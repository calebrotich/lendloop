# LendLoop brand assets

Exports of the loop mark and lockup used in the app. The source of truth is the
inline `LoopMark`/`Brand` component (`components/ui/brand.tsx`); `app/icon.svg`
is the favicon. These files are portable copies.

## Files

| File                      | Use                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `lendloop-mark.svg`       | The loop on its own — an indigo ring with the orange return segment. Adaptive: the ring uses `currentColor`.             |
| `lendloop-mark-white.svg` | Same mark for dark or photographic backgrounds.                                                                          |
| `lendloop-badge.svg`      | The app icon — the loop on a brand-indigo rounded square (matches `app/icon.svg` and the favicon).                       |
| `lendloop-logo.svg`       | Horizontal lockup: badge + "LendLoop" wordmark, matching the email header (`public/logo.png`). The text is live Manrope. |
| `png/`                    | Raster exports (transparent background) re-rendered from the SVGs above.                                                 |

## Colours

The palette is the same brand sheet used by the transactional email templates
(`convex/lib/emailTemplates.ts`):

- Brand / primary: `#1F299C`
- Ink / navy: `#16215B`
- Accent: `#F25929` (use `#C8451B` for white body text — AA contrast)
- Support: blue `#0373FF`, cyan `#30D1FF`, lilac `#A3A9F5`
- Surfaces: mist `#E0EAF8`, page `#F4F6FC`, rule `#E4E8F5`

## Typography

Body: Manrope. Display headings: GT Alpina, with Fraunces as the bundled
stand-in (see `app/globals.css` and `docs/ui.md`). The wordmark is Manrope
ExtraBold in navy, with no full stop — the same lockup used in the email
header. The orange lives in the mark's return segment.

## Usage

```html
<!-- mark, sized by CSS, brand indigo + orange return -->
<img src="/brand/lendloop-mark.svg" alt="LendLoop" width="24" height="24" />

<!-- favicon -->
<link rel="icon" href="/brand/lendloop-badge.svg" type="image/svg+xml" />
```

To recolour an inline copy, set `color` on the `svg` — the loop paths use
`currentColor`; the dot stays brand orange.

Keep clear space of at least a quarter of the mark's width around it. The badge
is drawn on a 32×32 grid; scale it in whole multiples (16, 32, 64, 128, 512,
1024 px) to keep the stroke crisp.
