# 2026-10-19: Ledger logo and the blue palette (BL-094, BL-095)

**Status:** accepted. **Supersedes:** "Indigo is the brand" in
`docs/specs/2026-10-15-design-system-v2.md` §2.

## Decision

1. **Logo.** Ledger (www.homeownerledger.com) gets a real mark: a blue
   rounded tile with a white roof and chimney over two ledger lines. The
   lower line is short and light blue, like a running total. Next to it
   sits a monoline geometric "Ledger" wordmark, drawn as strokes so it
   renders the same without any font. The mark replaces the old "L in a
   square" letterform and the lucide `ScrollText` icon tile in the app.
2. **Palette.** HOA Hub and the marketing site move from indigo-600
   `#4F46E5` to a blue / light-blue system with cool slate neutrals. The
   palette matches the logo tile exactly.

## Why

- **On theme.** The roof says homeowners' association and the ruled lines
  say ledger, in two strokes. It stays geometric (three paths, round caps,
  one stroke weight), not an illustrated house.
- **Legible at 16 px.** Three shapes with 2.5 to 3 px gaps at 32 px.
  Rendered at 16 px it still reads as a house over lines (checked by
  rendering `favicon.ico` sizes to PNG). The chimney is there so that the
  roof cannot be read as an "upload" chevron.
- **Blue for 2025–2026 SaaS.** Fintech and back-office tools (Stripe,
  Mercury, Linear's light theme, Ramp) have moved to a clear,
  slightly-saturated blue, light-blue tinted surfaces and slate neutrals
  instead of violet-leaning indigo. Blue also reads as "trusted, financial",
  which suits an HOA ledger and the product name.
- **One hue family.** The logo tile, `primary`, links, focus ring and
  `primary-subtle` tints are all on the same Tailwind blue ramp
  (blue-50/100/200/400/500/600/700), so nothing clashes.

## The palette (HOA hub)

Brand roles (`BRANDS.hoa` in `packages/ui/src/tokens.ts`):

| Role | Light | Dark |
| --- | --- | --- |
| `primary` | `#2563EB` (blue-600) | `#60A5FA` (blue-400) |
| `primary-hover` | `#1D4ED8` (blue-700) | `#93C5FD` (blue-300) |
| `primary-fg` | `#FFFFFF` | `#0A0F1A` |
| `primary-subtle` | `#EBF3FF` (light blue) | `#132A4F` |
| `ring` | `#3B82F6` (blue-500) | `#60A5FA` |

Shared neutrals: cool slate, faintly blue. They also apply to PM and
Eviction, which keep their own `primary*`.

| Role | Light | Dark |
| --- | --- | --- |
| `background` | `#F5F8FC` | `#0A0F1A` |
| `surface` | `#FFFFFF` | `#111827` |
| `elevated` | `#FFFFFF` | `#182235` |
| `subtle` | `#EEF3F9` | `#1E293B` |
| `border` | `#E2E8F0` | `#243045` |
| `border-strong` | `#CBD5E1` | `#334155` |
| `input` | `#7A879C` | `#6B7A90` |
| `foreground` | `#0F172A` | `#F1F5F9` |
| `foreground-secondary` | `#334155` | `#CBD5E1` |
| `muted` | `#526077` | `#94A3B8` |

Status and the amber AI accent are unchanged.

Logo colours (`LOGO` in tokens.ts): tile `#2563EB`, glyph `#FFFFFF`, ledger
line `#BFDBFE` (blue-200), wordmark `#0F172A` on light and `#F1F5F9` on
dark. The tile is the same in dark mode. The dark `primary` is a lighter
blue that white would not read on, so the mark uses `LOGO`, not the themed
`primary` class.

## Contrast (WCAG 2.2 AA)

Key pairs. The minimum is 4.5:1 for text and 3:1 for non-text UI.

| Pair | Ratio |
| --- | --- |
| white on `primary` (light button) | 5.17 |
| white on `primary-hover` | 6.70 |
| `primary` link on `background` / `surface` | 4.85 / 5.17 |
| `primary` on `primary-subtle` (tinted chip) | 4.63 |
| `foreground` on `background` | 16.76 |
| `muted` on `subtle` (light) | 5.71 |
| `ring` on `background` (non-text) | 3.45 |
| `input` on `surface` / `background` (non-text) | 3.64 / 3.41 |
| dark: `primary-fg` on `primary` (dark button) | 7.54 |
| dark: `primary` link on `surface` / `elevated` | 6.98 / 6.26 |
| dark: `primary` on `primary-subtle` | 5.61 |
| dark: `foreground` on `background` | 17.49 |
| dark: `muted` on `subtle` | 5.71 |
| dark: `input` on `surface` (non-text) | 4.06 |
| logo: white roof on tile / light-blue line on tile | 5.17 / 3.64 |
| logo: tile on the dark canvas | 3.71 |

`packages/ui/src/tokens.test.ts` checks every pair in `CONTRAST_PAIRS`
for all three hubs in both modes. It measures the HSL channels the CSS
actually ships. It also adds explicit floors for the key pairs above and
for the logo colours. `scripts/release-notes/release-notes.test.ts` fails
if the release-note email's copied `BRAND` colours drift from the tokens.

## Consequences

- PM Hub's `#1F5FD6` is now close to the HOA blue. Hub tints were meant
  to tell hubs apart. That still works through the hub name, switcher and
  sidebar, and PM and Eviction are out of scope (`feedback_hoa_only`). If
  it matters later, move PM to teal or a deeper navy. It only needs a
  change to `BRANDS.pm`.
- Guide screenshots are stale until the CI UI-shots workflow retakes them
  after merge.
- The release-note email keeps a blue cell with an "L", because Gmail strips
  SVG. Its colours come from the new palette.
- `Avatar` and `StatusDonut` keep their categorical hues (indigo/violet are
  among six distinguishable avatar/segment colours). Those hues stand for
  identity and categories, not the brand.

## Files

- Tokens: `packages/ui/src/tokens.ts` (`BRANDS.hoa`, neutrals, `LOGO`).
- Components: `packages/ui/src/components/LedgerLogo.tsx` (`LedgerMark`,
  `LedgerWordmark`, `LedgerLogo`, also exported as
  `@homeowner-portal/ui/brand`).
- Static art, identical in `apps/hoa/public/brand/` and
  `apps/marketing/public/brand/`:
  - `logo-mark`, `logo-wordmark` and `logo-full`, each with a `-dark`
    variant, as `.svg` plus `-512.png` and `-192.png`
  - `icon.svg`, `icon-touch.svg`, `icon-maskable-512.png`,
    `apple-touch-icon.png` and `favicon.ico` (16/32/48)
- Wiring, HOA: `app/favicon.ico`, `app/icon.tsx`, `app/apple-icon.tsx`
  (redrawn), the SVG icon in `layout.tsx` metadata, the manifest's 192/512
  and maskable icons, and `brand/` excluded from the auth middleware.
- Wiring, marketing: `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`.
