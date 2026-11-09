#!/usr/bin/env python3
"""Pick a representative photo for every seeded listing.

Source strategy, in order:
  1. Wikipedia article images. Wikipedia's search is good at concepts ("claw
     hammer" → the Claw hammer article) and its article photos are curated, so
     the file names are usually exact ("Claw-hammer.jpg"). This is the main path.
  2. The curated Commons category map in image-sources.json, for articles that
     are missing or thin.
  3. Commons file search, as a last resort.

A candidate is only accepted when its file name contains the listing's own
search words, so a "jigsaw" query cannot pick a jigsaw puzzle, and a "stand
mixer" query cannot pick a hand beater. Licences are limited to public domain,
CC0, CC BY and CC BY-SA; attribution is collected per image for /credits.

Output (git-ignored):
  .seed-cache/manifest.json
  .seed-cache/webp/*.webp

SEED_AUDIT=1 prints the picks without downloading. SEED_LIMIT=n limits the run.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE = ROOT / ".seed-cache"
RAW = CACHE / "raw"
WEBP = CACHE / "webp"
MANIFEST = CACHE / "manifest.json"
CATALOG = HERE / "catalog.json"
SOURCES = HERE / "image-sources.json"
OVERRIDES = HERE / "image-overrides.json"
USER_AGENT = "LendLoopSeed/1.0 (https://lendloopnow.vercel.app; seed@example.com)"

LICENSE_OK = re.compile(
    r"^(public domain|pd[- ]|cc0|cc by( |-sa)? ?\d|cc by( |-sa)?$|copyrighted free use|no restrictions)",
    re.I,
)
BAD_WORDS = re.compile(
    r"\b(map|diagram|logo|drawing|illustration|chart|poster|stamp|banknote|coin|"
    r"painting|sketch|document|patent|advertisement|catalog(ue)?|page|infographic|icon|"
    r"scheme|blueprint|engraving|lithograph|woodcut|cartoon|comic|sheet music|symbol|sign)\b",
    re.I,
)
DISCOURAGED = re.compile(
    r"\b(museum|exhibition|historic(al)?|vintage|antique|rusty|abandoned|scrap|broken|"
    r"ruined|decay|woman|man|people|person|child|children|boy|girl|hand|hands|"
    r"portrait|selfie|wedding|ceremony|navy|army|soldier|military|monument|memorial|"
    r"plaque|statue|trail|park|road|street|building|station|church|cemetery|festival|parade|"
    r"rock formation|landscape|scenic|panorama|skyline|ridge|view|overlook|software|"
    r"mission|planning|execution|dashboard|interface)\b",
    re.I,
)
STOPWORDS = {
    "a", "an", "and", "with", "for", "the", "of", "on", "in", "to", "pair", "set",
    "kit", "inch", "inches", "cm", "mm", "m", "l", "kg", "w", "v", "wh", "btu",
    "two", "three", "six", "eight", "nine", "ten", "twelve", "single", "double",
    "mini", "small", "large", "heavy", "duty", "pro", "professional", "high",
    "speed", "press",
}
CATEGORY_FALLBACK = {
    "power_tools": ["Power tools"],
    "hand_tools": ["Hand tools"],
    "garden": ["Garden tools"],
    "kitchen": ["Kitchen appliances"],
    "camping": ["Camping equipment"],
    "cleaning": ["Cleaning equipment"],
    "automotive": ["Automotive tools"],
    "electronics": ["Consumer electronics"],
    "sports_fitness": ["Fitness equipment"],
    "bikes": ["Bicycles"],
    "music": ["Musical instruments"],
    "photography": ["Photographic equipment"],
    "party_events": ["Party supplies"],
    "other": ["Ladders"],
}

ARTICLE_CACHE: dict[str, list[dict]] = {}
FILE_CACHE: dict[str, dict | None] = {}
CATEGORY_CACHE: dict[str, list[str]] = {}


def desired_images(index: int) -> int:
    slot = index % 20
    if slot < 10:
        return 1
    if slot < 17:
        return 2
    return 3


def http_json(url: str, tries: int = 3) -> dict:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read())
        except Exception as error:  # noqa: BLE001 - retry any transport error
            last = error
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"GET failed: {url}: {last}")


def commons(params: dict) -> dict:
    return http_json(
        f"https://commons.wikimedia.org/w/api.php?{urllib.parse.urlencode({**params, 'action': 'query', 'format': 'json'})}"
    )


def tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2}


GENERIC = {"tool", "tools", "equipment", "machine", "machines", "appliance",
           "appliances", "device", "devices"}


def core_tokens(query: str) -> list[str]:
    """The words a photo's file name must contain, in query order.

    Generic adjectives ("cordless", "electric") are dropped so a file called
    "Electric drill.jpg" is not rejected, but the object noun and any real
    modifier ("hammer", "impact", "leaf") stay.
    """
    words = [word for word in re.findall(r"[a-z0-9]+", query.lower()) if len(word) > 2]
    meaningful = [word for word in words if word not in STOPWORDS]
    objects = [word for word in meaningful if word not in GENERIC]
    return objects or meaningful or words


def article_score(title: str, query: str) -> float:
    wanted = set(core_tokens(query))
    clean = re.sub(r"\s*\([^)]*\)", "", title)
    have = tokens(clean)
    if not wanted or not have:
        return -99.0
    score = len(wanted & have) * 2.0
    if wanted <= have:
        score += 3.0
    disambiguation = re.search(r"\(([^)]*)\)", title)
    if disambiguation is not None:
        words = tokens(disambiguation.group(1))
        if words & wanted:
            score += 4.0
        if BAD_ARTICLE.search(disambiguation.group(1)):
            score -= 8.0
    if BAD_ARTICLE.search(clean):
        score -= 8.0
    extra = have - wanted - {"tool", "tools", "appliance", "machine", "equipment", "device"}
    score -= 0.75 * len(extra)
    return score


def wiki_articles(query: str) -> list[dict]:
    if query in ARTICLE_CACHE:
        return ARTICLE_CACHE[query]
    data = http_json(
        "https://en.wikipedia.org/w/api.php?"
        + urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "generator": "search",
                "gsrsearch": query,
                "gsrlimit": "5",
                "prop": "images|pageimages",
                "piprop": "name",
                "imlimit": "40",
            }
        )
    )
    pages = list(((data.get("query") or {}).get("pages") or {}).values())
    pages.sort(key=lambda page: article_score(page.get("title", ""), query), reverse=True)
    ARTICLE_CACHE[query] = pages
    return pages


FILE_CACHE_LOCAL_KEY = "commons"


def file_meta(titles: list[str]) -> dict[str, dict | None]:
    """Batch-fetch Commons metadata for up to 40 files per request."""
    missing = [title for title in titles if title not in FILE_CACHE]
    for start in range(0, len(missing), 40):
        chunk = missing[start : start + 40]
        data = commons(
            {
                "titles": "|".join(chunk),
                "prop": "imageinfo",
                "iiprop": "url|size|mime|extmetadata",
                "iiurlwidth": "1600",
            }
        )
        pages = ((data.get("query") or {}).get("pages") or {}).values()
        found = set()
        for page in pages:
            title = page.get("title", "")
            found.add(title)
            info = (page.get("imageinfo") or [{}])[0]
            FILE_CACHE[title] = {"info": info, "pageid": page.get("pageid")} if info else None
        for title in chunk:
            if title not in found:
                FILE_CACHE[title] = None
    return {title: FILE_CACHE.get(title) for title in titles}


def usable(title: str, meta: dict | None) -> dict | None:
    """A metadata row that is a real, licensed, large-enough photograph."""
    if meta is None or not meta.get("info"):
        return None
    info = meta["info"]
    if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        return None
    width, height = info.get("width", 0), info.get("height", 0)
    if min(width, height) < 500 or max(width, height) < 800:
        return None
    if width / height > 1.95 or width / height < 0.5:
        return None
    name = title.removeprefix("File:")
    if BAD_WORDS.search(name):
        return None
    ext = info.get("extmetadata") or {}
    license_name = (ext.get("LicenseShortName") or {}).get("value", "").strip()
    if LICENSE_OK.match(license_name) is None:
        return None
    thumb = info.get("thumburl") or info.get("url")
    if not thumb:
        return None
    return {
        "pageid": meta.get("pageid") or hash(name),
        "title": name,
        "thumb": thumb,
        "source": info.get("descriptionurl") or thumb,
        "license": license_name,
        "licenseUrl": (ext.get("LicenseUrl") or {}).get("value", ""),
        "artist": re.sub(r"<[^>]+>", "", (ext.get("Artist") or {}).get("value", "")).strip()[:160],
        "width": width,
        "height": height,
    }


ACCESSORY = re.compile(
    r"\b(?:bits?|blades?|discs?|brush(?:es)?|nails?|screws?|chuck|batter(?:y|ies)|"
    r"macro|detail|close ?up|parts?|accessor(?:y|ies)|attachments?|diamond)\d*\b",
    re.I,
)
BAD_ARTICLE = re.compile(
    r"\b(company|band|film|software|puzzle|puzzles|game|games|wrestler|teaching|"
    r"technique|camouflage|clothing|retailer|album|song|book|novel|series|ridge|"
    r"disambiguation)\b",
    re.I,
)


def score_file(candidate: dict, query: str, strict: bool) -> float | None:
    ordered = core_tokens(query)
    if not ordered:
        return None
    head = ordered[-1]
    wanted = set(ordered)
    have = tokens(candidate["title"])
    if head not in have:
        return None
    overlap = len(wanted & have)
    if strict and overlap < len(wanted):
        return None
    if not strict and overlap < max(1, len(wanted) - 1):
        return None
    if ACCESSORY.search(candidate["title"]) and not ACCESSORY.search(query):
        return None
    if DISCOURAGED.search(candidate["title"]):
        return -99.0
    score = overlap * 3.0
    if wanted <= have:
        score += 3.0
    if len(candidate["title"]) < 55:
        score += 1.0
    if min(candidate["width"], candidate["height"]) >= 1000:
        score += 0.5
    if not strict:
        score -= 4.0
    return round(score, 3)


def article_is_exact(title: str, query: str) -> bool:
    """True when the article is *the* thing in the query (Jigsaw (tool), Hacksaw).

    "Mixer (appliance)" is not exact for "stand mixer", and "Drill" is not exact
    for "cordless drill" — those articles carry too many other pictures.
    """
    wanted = set(core_tokens(query))
    clean = re.sub(r"\s*\([^)]*\)", "", title)
    disambiguation = re.search(r"\(([^)]*)\)", title)
    words = tokens(clean)
    if disambiguation is not None:
        words |= tokens(disambiguation.group(1))
    return bool(wanted) and wanted <= words and (words - wanted) <= GENERIC


def picks_from_articles(queries: list[str], used: set[int]) -> list[dict]:
    """The top article for each query, with a filename sanity check."""
    found: list[dict] = []
    for query in queries:
        ranked = wiki_articles(query)
        if not ranked:
            continue
        article = ranked[0]
        relevance = article_score(article.get("title", ""), query)
        if relevance <= 0:
            continue
        exact = article_is_exact(article.get("title", ""), query)
        ordered = core_tokens(query)
        head = ordered[-1] if ordered else ""
        wanted = set(ordered)
        titles = [
            image.get("title", "")
            for image in article.get("images", [])
            if image.get("title", "").lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
        ]
        meta = file_meta(titles[:60])
        for title in titles:
            candidate = usable(title, meta.get(title))
            if candidate is None or candidate["pageid"] in used:
                continue
            have = tokens(candidate["title"])
            if exact:
                if head not in have:
                    continue
            elif not (wanted <= have):
                continue
            if ACCESSORY.search(candidate["title"]) and not ACCESSORY.search(query):
                continue
            if DISCOURAGED.search(candidate["title"]):
                continue
            score = len(wanted & have) * 3.0 + relevance * 1.5
            if wanted <= have:
                score += 3.0
            if len(candidate["title"]) < 55:
                score += 1.0
            if min(candidate["width"], candidate["height"]) >= 1000:
                score += 0.5
            found.append({**candidate, "score": round(score, 2)})
    return found


def picks_from_categories(categories: list[str], queries: list[str], used: set[int], strict: bool) -> list[dict]:
    found: list[dict] = []
    titles: list[str] = []
    for category in categories:
        if category in CATEGORY_CACHE:
            members = CATEGORY_CACHE[category]
        else:
            members = []
            cont: dict[str, str] = {}
            for _ in range(2):
                data = commons(
                    {
                        "generator": "categorymembers",
                        "gcmtitle": f"Category:{category}",
                        "gcmtype": "file",
                        "gcmlimit": "50",
                        "prop": "imageinfo",
                        "iiprop": "url|size|mime|extmetadata",
                        "iiurlwidth": "1600",
                        **cont,
                    }
                )
                members.extend(
                    page.get("title", "")
                    for page in ((data.get("query") or {}).get("pages") or {}).values()
                )
                cont = data.get("continue") or {}
                if not cont:
                    break
            CATEGORY_CACHE[category] = members
        for title in members:
            if title not in titles:
                titles.append(title)
    meta = file_meta(titles[:120])
    for query in queries:
        for title in titles:
            candidate = usable(title, meta.get(title))
            if candidate is None or candidate["pageid"] in used:
                continue
            score = score_file(candidate, query, strict)
            if score is None:
                continue
            found.append({**candidate, "score": score + 1.0})
    return found


def picks_from_search(queries: list[str], used: set[int], strict: bool) -> list[dict]:
    found: list[dict] = []
    titles: list[str] = []
    for query in queries:
        data = commons(
            {
                "generator": "search",
                "gsrsearch": f"filetype:bitmap {query}",
                "gsrnamespace": "6",
                "gsrlimit": "30",
                "prop": "imageinfo",
                "iiprop": "url|size|mime|extmetadata",
                "iiurlwidth": "1600",
            }
        )
        for page in ((data.get("query") or {}).get("pages") or {}).values():
            title = page.get("title", "")
            if title and title not in titles:
                titles.append(title)
    meta = file_meta(titles[:120])
    for query in queries:
        for title in titles:
            candidate = usable(title, meta.get(title))
            if candidate is None or candidate["pageid"] in used:
                continue
            score = score_file(candidate, query, strict)
            if score is None:
                continue
            found.append({**candidate, "score": score})
    return found


def download(candidate: dict) -> Path:
    raw_path = RAW / f"{candidate['pageid']}.img"
    if raw_path.exists() and raw_path.stat().st_size > 0:
        return raw_path
    last: Exception | None = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(candidate["thumb"], headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                raw_path.write_bytes(response.read())
            return raw_path
        except Exception as error:  # noqa: BLE001
            last = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"download failed for {candidate['title']}: {last}")


def reencode(candidate: dict) -> dict:
    raw_path = download(candidate)
    object_key = f"listing-images/{secrets.token_hex(16)}.webp"
    out_path = WEBP / object_key.rsplit("/", 1)[-1]
    if not out_path.exists():
        with Image.open(raw_path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            image.save(out_path, "WEBP", quality=82, method=6)
    with Image.open(out_path) as saved:
        width, height = saved.size
    return {
        "objectKey": object_key,
        "contentType": "image/webp",
        "byteSize": out_path.stat().st_size,
        "width": width,
        "height": height,
        "file": str(out_path.relative_to(ROOT)),
        "credit": {
            "pageid": candidate["pageid"],
            "title": candidate["title"],
            "source": candidate["source"],
            "license": candidate["license"],
            "licenseUrl": candidate["licenseUrl"],
            "artist": candidate["artist"],
        },
    }


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    WEBP.mkdir(parents=True, exist_ok=True)
    audit = os.environ.get("SEED_AUDIT") == "1"

    catalog = json.loads(CATALOG.read_text())
    listings = catalog["listings"]
    limit = int(os.environ.get("SEED_LIMIT", "0"))
    offset = int(os.environ.get("SEED_OFFSET", "0"))
    if offset > 0:
        listings = listings[offset:]
    if limit > 0:
        listings = listings[:limit]
    sources = json.loads(SOURCES.read_text())
    overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}

    previous: dict[str, list[dict]] = {}
    if MANIFEST.exists():
        try:
            previous = {row["name"]: row["images"] for row in json.loads(MANIFEST.read_text())["listings"]}
        except Exception:  # noqa: BLE001 - a stale cache should not block a run
            previous = {}

    used_pages = {image.get("credit", {}).get("pageid") for images in previous.values() for image in images}
    used_pages.discard(None)

    results = []
    missing = []
    for index, listing in enumerate(listings):
        name = listing["name"]
        desired = desired_images(index)
        # A hand-picked set wins over the automatic pick. Used to correct the
        # handful of listings where the best article photo is the wrong subtype.
        if name in overrides and len(overrides[name]) == 0:
            results.append({**listing, "images": []})
            print(f"[{index + 1:3d}/{len(listings)}] override(empty) {name}", flush=True)
            continue

        if name in overrides:
            titles = [title if title.startswith("File:") else f"File:{title}" for title in overrides[name]]
            meta = file_meta(titles)
            picked_override = []
            for title in titles:
                candidate = usable(title, meta.get(title))
                if candidate is not None:
                    picked_override.append(candidate)
            if picked_override:
                images = [reencode(candidate) for candidate in picked_override]
                for candidate in picked_override:
                    used_pages.add(candidate["pageid"])
                results.append({**listing, "images": images})
                print(f"[{index + 1:3d}/{len(listings)}] override {name} ({len(images)})", flush=True)
                continue

        chosen = previous.get(name, [])
        if len(chosen) > 0 or (audit and chosen):
            for image in chosen:
                pageid = image.get("credit", {}).get("pageid")
                if pageid is not None:
                    used_pages.add(pageid)
            results.append({**listing, "images": chosen})
            if not audit:
                print(f"[{index + 1:3d}/{len(listings)}] cached   {name} ({len(chosen)})")
            continue

        queries = listing["imageQueries"]

        pool: list[dict] = picks_from_articles(queries, used_pages)
        if len(pool) < desired:
            pool += picks_from_categories(sources.get(name, []), queries, used_pages, True)
        if len(pool) < desired:
            pool += picks_from_categories(
                CATEGORY_FALLBACK[listing["category"]], queries, used_pages, True
            )
        if len(pool) == 0:
            pool += picks_from_search(queries, used_pages, True)
        if len(pool) == 0:
            pool += picks_from_categories(sources.get(name, []), queries, used_pages, False)
            pool += picks_from_search(queries, used_pages, False)

        unique: dict[int, dict] = {}
        for candidate in pool:
            if candidate["pageid"] in used_pages:
                continue
            best = unique.get(candidate["pageid"])
            if best is None or candidate["score"] > best["score"]:
                unique[candidate["pageid"]] = candidate
        ordered = sorted(unique.values(), key=lambda row: row["score"], reverse=True)
        picked = ordered[:desired]

        if audit:
            print(f"\n[{index + 1:3d}] {name}  ({desired} wanted)")
            print(f"     queries: {' | '.join(queries)}")
            for candidate in picked:
                print(f"     pick:    {candidate['title'][:78]}  [{candidate['license']}] {candidate['score']}")
            results.append({**listing, "images": chosen})
            continue

        if not picked:
            missing.append(name)
            results.append({**listing, "images": []})
            print(f"[{index + 1:3d}/{len(listings)}] MISSING  {name}")
            continue

        images = []
        for candidate in picked:
            used_pages.add(candidate["pageid"])
            try:
                images.append(reencode(candidate))
            except Exception as error:  # noqa: BLE001 - one bad file must not stop the run
                print(f"    ! {candidate['title']}: {error}")
        results.append({**listing, "images": images})
        partial = {
            "source": "Wikimedia Commons (via Wikipedia article images)",
            "licenses": "public domain, CC0, CC BY, CC BY-SA (credit per image)",
            "totalListings": len(results),
            "totalImages": sum(len(row["images"]) for row in results),
            "listings": results,
        }
        MANIFEST.write_text(json.dumps(partial, indent=2) + "\n")
        print(f"[{index + 1:3d}/{len(listings)}] {len(images)} image(s)  {name}", flush=True)

    if audit:
        return

    manifest = {
        "source": "Wikimedia Commons (via Wikipedia article images)",
        "licenses": "public domain, CC0, CC BY, CC BY-SA (credit per image)",
        "totalListings": len(results),
        "totalImages": sum(len(row["images"]) for row in results),
        "listings": results,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\nwrote {MANIFEST}")
    print(f"{manifest['totalImages']} images for {len(results)} listings")
    if missing:
        print(f"\n{len(missing)} listings without an image:")
        for name in missing:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
