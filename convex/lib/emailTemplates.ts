import { DEFAULT_APP_BASE_URL } from "./appUrl";
import { readEnv } from "./env";

/**
 * Transactional email rendering.
 *
 * One layout, one palette, every message. Convex renders the final HTML and
 * hands it to n8n, which only transports it — so a copy change is a deploy, not
 * a workflow re-import, and the design cannot drift between W1/W2.
 *
 * Constraints this file obeys:
 * - Table layout + inline styles only (Outlook, Gmail, Apple Mail).
 * - No external CSS, no web fonts, no SVG in the body.
 * - Every image has alt text and a text fallback, because images are blocked by
 *   default in several clients.
 * - Palette per the brand sheet: #1F299C, #16215B, #0373FF, #30D1FF, #A3A9F5.
 */

const PALETTE = {
  brand: "#1F299C",
  navy: "#16215B",
  orange: "#F25929",
  blue: "#0373FF",
  cyan: "#30D1FF",
  lilac: "#A3A9F5",
  mist: "#E0EAF8",
  muted: "#565B85",
  page: "#F4F6FC",
  rule: "#E4E8F5",
  white: "#FFFFFF",
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** `2026-11-20` → `20 Nov 2026`. No Intl: unit tests run without it. */
export function humanDate(isoDay: string): string {
  const parts = isoDay.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return isoDay;
  }
  return `${day} ${MONTHS[month - 1] ?? ""} ${year}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Deployment-specific asset + origin config, resolved once per email. */
export function emailBrand(): { logoUrl: string | null; appUrl: string } {
  const host = readEnv("R2_PUBLIC_HOST");
  const appUrl = (readEnv("APP_BASE_URL") ?? DEFAULT_APP_BASE_URL).replace(/\/+$/, "");
  return {
    logoUrl: host === undefined || host.length === 0 ? null : `https://${host}/email/logo-v2.png`,
    appUrl,
  };
}

interface Fact {
  label: string;
  value: string;
}

export interface LayoutInput {
  preheader: string;
  /** Small uppercase kicker above the headline. */
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  facts?: Fact[];
  image?: { url: string; alt: string } | null;
  /** Shown in place of the photo when a listing has none. */
  fallbackInitial?: string;
  cta: { label: string; url: string };
  /** Why this person is receiving the message. Completes "You're receiving this because …". */
  footerReason: string;
}

function header(logoUrl: string | null): string {
  if (logoUrl === null) {
    return `<div style="font:700 24px/28px ${FONT};color:${PALETTE.navy};letter-spacing:-0.02em;">LendLoop<span style="color:${PALETTE.orange};">.</span></div>`;
  }
  return `<img src="${esc(logoUrl)}" width="140" height="30" alt="LendLoop" style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;">`;
}

function hero(input: LayoutInput): string {
  if (input.image !== undefined && input.image !== null) {
    return `<img src="${esc(input.image.url)}" alt="${esc(input.image.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:14px;outline:none;text-decoration:none;">`;
  }
  const initial = (input.fallbackInitial ?? "L").slice(0, 1).toUpperCase();
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${PALETTE.mist};border-radius:14px;">`,
    `<tr><td align="center" style="padding:46px 0;font:700 64px/64px ${FONT};color:${PALETTE.brand};">${esc(initial)}</td></tr>`,
    `</table>`,
  ].join("");
}

function factRows(facts: Fact[]): string {
  const cells = facts
    .map(
      (fact) =>
        `<td width="50%" valign="top" style="padding:12px 14px;background-color:${PALETTE.mist};border-radius:10px;">` +
        `<div style="font:600 10px/14px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${PALETTE.muted};">${esc(fact.label)}</div>` +
        `<div style="margin-top:4px;font:600 15px/20px ${FONT};color:${PALETTE.navy};">${esc(fact.value)}</div>` +
        `</td>`,
    )
    .join('<td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${cells}</tr></table>`;
}

export function renderLayout(input: LayoutInput): string {
  const brand = emailBrand();
  const paragraphs = input.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px 0;font:400 16px/26px ${FONT};color:${PALETTE.navy};">${esc(text)}</p>`,
    )
    .join("");
  const facts =
    input.facts === undefined
      ? ""
      : `<div style="padding:6px 0 4px 0;">${factRows(input.facts)}</div>`;

  return [
    `<!doctype html>`,
    `<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="x-apple-disable-message-reformatting">`,
    `<meta name="color-scheme" content="light only">`,
    `<meta name="supported-color-schemes" content="light only">`,
    `<title>${esc(input.heading)}</title>`,
    `</head>`,
    `<body style="margin:0;padding:0;background-color:${PALETTE.page};">`,
    `<div style="display:none;font-size:1px;color:${PALETTE.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(input.preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.page}" style="width:100%;background-color:${PALETTE.page};">`,
    `<tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.white}" style="width:600px;max-width:600px;background-color:${PALETTE.white};border-radius:16px;border:1px solid ${PALETTE.rule};">`,
    // brand accent bar
    `<tr><td style="height:6px;line-height:6px;font-size:0;background-color:${PALETTE.brand};background-image:linear-gradient(90deg,${PALETTE.brand} 0%,${PALETTE.blue} 58%,${PALETTE.orange} 100%);border-radius:16px 16px 0 0;">&nbsp;</td></tr>`,
    // logo
    `<tr><td style="padding:28px 32px 0 32px;">${header(brand.logoUrl)}</td></tr>`,
    // eyebrow + heading
    `<tr><td style="padding:26px 32px 0 32px;">`,
    `<div style="font:700 11px/16px ${FONT};letter-spacing:.10em;text-transform:uppercase;color:${PALETTE.orange};">${esc(input.eyebrow)}</div>`,
    `<h1 style="margin:8px 0 0 0;font:700 26px/34px ${FONT};color:${PALETTE.navy};letter-spacing:-0.01em;">${esc(input.heading)}</h1>`,
    `</td></tr>`,
    // hero
    `<tr><td style="padding:22px 32px 0 32px;">${hero(input)}</td></tr>`,
    // copy
    `<tr><td style="padding:22px 32px 0 32px;">${paragraphs}${facts}</td></tr>`,
    // cta
    `<tr><td style="padding:22px 32px 0 32px;">`,
    `<a href="${esc(input.cta.url)}" style="display:inline-block;background-color:${PALETTE.brand};border-radius:10px;padding:14px 26px;font:600 16px/20px ${FONT};color:${PALETTE.white};text-decoration:none;">${esc(input.cta.label)}</a>`,
    `<div style="margin-top:14px;font:400 13px/20px ${FONT};color:${PALETTE.muted};">Button not working? Paste this link into your browser:<br><a href="${esc(input.cta.url)}" style="color:${PALETTE.blue};text-decoration:underline;word-break:break-all;">${esc(input.cta.url)}</a></div>`,
    `</td></tr>`,
    // footer
    `<tr><td style="padding:30px 32px 28px 32px;">`,
    `<div style="border-top:1px solid ${PALETTE.rule};padding-top:18px;">`,
    `<p style="margin:0;font:400 13px/20px ${FONT};color:${PALETTE.muted};">You're receiving this because ${esc(input.footerReason)}.</p>`,
    `<p style="margin:8px 0 0 0;font:600 13px/20px ${FONT};color:${PALETTE.navy};">LendLoop<span style="color:${PALETTE.orange};">.</span> <span style="font-weight:400;color:${PALETTE.muted};">Neighbourhood tool lending</span></p>`,
    `</div>`,
    `</td></tr>`,
    `</table>`,
    `<div style="margin-top:16px;font:400 12px/18px ${FONT};color:${PALETTE.muted};">LendLoop · <a href="${esc(brand.appUrl)}" style="color:${PALETTE.muted};text-decoration:underline;">${esc(brand.appUrl.replace(/^https?:\/\//, ""))}</a></div>`,
    `</td></tr>`,
    `</table>`,
    `</body>`,
    `</html>`,
  ].join("");
}

// ---------------------------------------------------------------------------
// W1 — request lifecycle
// ---------------------------------------------------------------------------

export interface RequestEmailInput {
  event: string;
  recipientName: string;
  toolName: string;
  toolImageUrl: string | null;
  startDate: string;
  endDate: string;
  deepLink: string;
}

interface RequestCopy {
  subject: string;
  eyebrow: string;
  heading: string;
  body: string[];
  cta: string;
  reason: string;
  text: string;
}

function requestCopy(input: RequestEmailInput): RequestCopy {
  const range = `${humanDate(input.startDate)} to ${humanDate(input.endDate)}`;
  const hi = `Hi ${input.recipientName},`;

  switch (input.event) {
    case "request.created":
      return {
        subject: `Someone wants to borrow your ${input.toolName}`,
        eyebrow: "New request",
        heading: `A neighbour wants your ${input.toolName}`,
        body: [
          hi,
          `Someone nearby has asked to borrow your ${input.toolName} for ${range}.`,
          "Approve it if you're happy with those dates, or decline and they can pick another window. Nothing is booked until you decide.",
        ],
        cta: "Review the request",
        reason: `you listed ${input.toolName} on LendLoop`,
        text: `${hi}\n\nSomeone nearby has asked to borrow your ${input.toolName} for ${range}.\n\nApprove it if you're happy with those dates, or decline and they can pick another window. Nothing is booked until you decide.\n\nReview the request:\n${input.deepLink}\n\n— LendLoop`,
      };
    case "request.approved":
      return {
        subject: `Approved — ${input.toolName} · ${range}`,
        eyebrow: "Approved",
        heading: `You're cleared to pick up the ${input.toolName}`,
        body: [
          hi,
          `Your request for ${input.toolName} (${range}) was approved.`,
          "Arrange a pickup time with the owner, and bring it back by the end date so it stays available for the next person.",
        ],
        cta: "Open my requests",
        reason: `you requested ${input.toolName}`,
        text: `${hi}\n\nYour request for ${input.toolName} (${range}) was approved.\n\nArrange a pickup time with the owner, and bring it back by the end date so it stays available for the next person.\n\nOpen my requests:\n${input.deepLink}\n\n— LendLoop`,
      };
    case "request.declined":
      return {
        subject: `Declined — ${input.toolName} · ${range}`,
        eyebrow: "Declined",
        heading: `Your request for ${input.toolName} was declined`,
        body: [
          hi,
          `The owner can't lend ${input.toolName} for ${range}.`,
          "Plenty of neighbours list similar tools — try the same dates with another listing, or shift the window slightly.",
        ],
        cta: "Browse other tools",
        reason: `you requested ${input.toolName}`,
        text: `${hi}\n\nThe owner can't lend ${input.toolName} for ${range}.\n\nPlenty of neighbours list similar tools — try the same dates with another listing, or shift the window slightly.\n\nBrowse other tools:\n${input.deepLink}\n\n— LendLoop`,
      };
    case "request.cancelled":
      return {
        subject: `Withdrawn — ${input.toolName} · ${range}`,
        eyebrow: "Withdrawn",
        heading: `The request for ${input.toolName} was withdrawn`,
        body: [
          hi,
          `The borrower cancelled their request for ${input.toolName} (${range}).`,
          "Your listing is active again with those dates free, so no action is needed.",
        ],
        cta: "View my listings",
        reason: `you listed ${input.toolName}`,
        text: `${hi}\n\nThe borrower cancelled their request for ${input.toolName} (${range}).\n\nYour listing is active again with those dates free, so no action is needed.\n\nView my listings:\n${input.deepLink}\n\n— LendLoop`,
      };
    case "request.returned":
      return {
        subject: `${input.toolName} is back and relisted`,
        eyebrow: "Returned",
        heading: `${input.toolName} is back on the shelf`,
        body: [
          hi,
          `${input.toolName} was marked as returned and is available to lend again.`,
          "Give it a quick check before the next borrower collects it.",
        ],
        cta: "View my listings",
        reason: `you listed ${input.toolName}`,
        text: `${hi}\n\n${input.toolName} was marked as returned and is available to lend again.\n\nGive it a quick check before the next borrower collects it.\n\nView my listings:\n${input.deepLink}\n\n— LendLoop`,
      };
    default:
      return {
        subject: `LendLoop update — ${input.toolName}`,
        eyebrow: "Update",
        heading: `There's an update on ${input.toolName}`,
        body: [
          hi,
          `Something changed on your ${input.toolName} request for ${range}.`,
          "Open LendLoop to see the details.",
        ],
        cta: "Open LendLoop",
        reason: `you have a request for ${input.toolName}`,
        text: `${hi}\n\nSomething changed on your ${input.toolName} request for ${range}.\n\nOpen LendLoop to see the details:\n${input.deepLink}\n\n— LendLoop`,
      };
  }
}

export function renderRequestEmail(input: RequestEmailInput): EmailContent {
  const copy = requestCopy(input);
  return {
    subject: copy.subject,
    text: copy.text,
    html: renderLayout({
      preheader: copy.body[1] ?? copy.heading,
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      paragraphs: copy.body,
      facts: [
        { label: "From", value: humanDate(input.startDate) },
        { label: "Until", value: humanDate(input.endDate) },
      ],
      image:
        input.toolImageUrl === null
          ? null
          : { url: input.toolImageUrl, alt: `${input.toolName} — the listing you're borrowing` },
      fallbackInitial: input.toolName,
      cta: { label: copy.cta, url: input.deepLink },
      footerReason: copy.reason,
    }),
  };
}

// ---------------------------------------------------------------------------
// W2 — overdue reminder
// ---------------------------------------------------------------------------

export interface ReminderEmailInput {
  borrowerName: string;
  toolName: string;
  toolImageUrl: string | null;
  dueDate: string;
  daysOverdue: number;
  deepLink: string;
}

export function renderReminderEmail(input: ReminderEmailInput): EmailContent {
  const hi = `Hi ${input.borrowerName},`;
  const days = input.daysOverdue === 1 ? "1 day" : `${input.daysOverdue} days`;
  const heading = `Your ${input.toolName} was due ${humanDate(input.dueDate)}`;
  const body = [
    hi,
    `Your loan of ${input.toolName} was due back on ${humanDate(input.dueDate)} — that's ${days} ago.`,
    "If you still have it, please arrange its return with the owner. If it's already back, ask them to mark it returned so it can be lent out again.",
  ];
  return {
    subject: `Overdue — ${input.toolName} was due ${humanDate(input.dueDate)}`,
    text: `${hi}\n\nYour loan of ${input.toolName} was due back on ${humanDate(input.dueDate)} — that's ${days} ago.\n\nIf you still have it, please arrange its return with the owner. If it's already back, ask them to mark it returned so it can be lent out again.\n\nOpen my requests:\n${input.deepLink}\n\n— LendLoop`,
    html: renderLayout({
      preheader: `${input.toolName} was due ${humanDate(input.dueDate)} — ${days} ago.`,
      eyebrow: "Overdue",
      heading,
      paragraphs: body,
      facts: [
        { label: "Due back", value: humanDate(input.dueDate) },
        { label: "Overdue by", value: days },
      ],
      image:
        input.toolImageUrl === null
          ? null
          : { url: input.toolImageUrl, alt: `${input.toolName} — the tool you borrowed` },
      fallbackInitial: input.toolName,
      cta: { label: "Open my requests", url: input.deepLink },
      footerReason: `you have ${input.toolName} on loan from a neighbour`,
    }),
  };
}
