# Website recolour to Royal purple (2026-11-06)

Status: accepted. Chosen by Asaf on 2026-11-06.

## Decision

The marketing website (apps/marketing, www.homeownerledger.online) moves from
the violet-to-blue palette to "Royal purple". The HOA app (apps/hoa) and the
shared preset in packages/ui/src/tokens.ts do not change.

## What changed

- Brand colour is now #6D28D9 (hover #5B21B6, subtle #F0E8FF).
- Page text is #211B2C, muted text #5C5469, wells #F6F2FB, borders tinted to a
  purple hue at the same lightness as before.
- Dark panels run #3B0764, #6B21A8, #7E22CE. Text on dark uses soft orchid
  tones (#E9D5FF and similar) at the same lightness as before.
- The mint accent and the teal glow are unchanged.
- The logo mark on the website is recoloured in the site CSS (tile #6D28D9,
  door #E9D5FF). The site favicon, apple icon and share images match. The
  shared logo token and the files in public/brand are untouched, so the app
  keeps its current violet logo.

## Why website only

The website is where the owner wanted the new look. Changing the shared
preset would also recolour the app, which was not asked for.

## Accessibility

Contrast ratios were measured with a script and are listed in the header
comment of apps/marketing/src/app/globals.css. Body text is at least 4.5 to 1,
large text and UI at least 3 to 1, and white text clears 7 to 1 on every
gradient stop.

## Follow-up

The app and the website now use different purples. If the owner later wants
one brand colour everywhere, update packages/ui/src/tokens.ts and rerun
scripts/build-brand-assets.ts, then delete the website overrides in globals.css.
