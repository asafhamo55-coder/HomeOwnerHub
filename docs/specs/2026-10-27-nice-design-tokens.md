# nice.com design tokens and how apps/marketing uses them

**Date:** 2026-10-27 · **Owner ask:** make the site look much closer to www.nice.com.
Boundaries: `docs/decisions/2026-10-26-website-nice-inspired-design.md`. Message and section order:
`docs/decisions/2026-10-27-website-product-first-positioning.md` (unchanged).

Method: headless Chrome captures of the home page and a product page at 1440 and 390 px
(kept in /tmp only, never committed); the page's own stylesheets read for computed values; plus
**REA evidence** (a separate 1440x900 capture and page inspection of nice.com: DOM, accessibility
tree, resource list) which matched the headless capture. Only measurements are recorded here.
No NICE CSS, markup, copy or images are in our repo.

## Observed tokens

| Area | nice.com observation | Our re-implementation |
|---|---|---|
| Font | Be Vietnam Pro (an open SIL OFL Google font), Helvetica/Arial fallback | Same open font via next/font, weights 300/400/500/600/700 |
| Weights | 300 dominant for body and leads, 500 headings, 600 labels | `.t-lead`, `.card p`, `.feature p` at 300; headings 500 |
| Type scale | Hero display about 54px; section h2 about 40 to 48; body 16/18; small 12 to 14 | Hero clamp to 62px; h2 32 to 48; lead 17 to 20 |
| Palette | Ink #22212b, warm stone #f2f0eb, link blue, violet to blue to teal hero gradient | Ink #22212b, `--warm` #f2f0eb, own violet gradient panel, own mint accent |
| Radii | Hero panel about 40px, cards 24 to 32px, buttons full pill | Panel 40px, cards 32px, pills |
| Shadows | Very light (`0 5px 10px` at 5 percent) | Existing soft shadows |
| Container | 1170 to 1440 max width; hero panel inset about 10px from the viewport | 1200 container; panel inset 8 to 12px |
| Buttons | Near-black pill, circular outlined arrow on the right | `.btn-primary` pill with ringed arrow (BL-174) |
| Nav | Grey utility strip (login, status, support) above a white nav, pill CTA at right | NEW: `.util-bar` strip (Security, Docs, Roadmap, Status, Sign in), collapses on scroll |
| Hero | Inset rounded gradient card, large left headline, product collage right | Same pattern with our headline and product mockup |
| Sections | Centered heading and subtitle; white, then full-bleed dark #22212b band, then stone band; rule-topped feature columns with link row | NEW: centered pillar header, `.feature` rule-topped columns; `.section-night` band for How it works; `.section-warm` for State law |
| Footer | Flat dark full-bleed | NEW: footer is `.section-night`, full-bleed |
| Motion | `transition all .5s`, `.2s ease-in-out` on hover, accordion max-height | 200ms hover; NEW `.reveal` scroll ease-in (view timeline, translate and opacity only), off under reduced motion |

## What changed in this pass

Utility strip; light 300 copy weight; flat night and warm full-bleed bands; rule-topped feature
columns replacing boxed cards on the pillars; 32px cards; larger hero; flat full-bleed footer; scroll
reveal. Home section order, copy, CTAs, analytics events, SEO metadata and PM/Eviction hiding are
untouched. Contrast: night band text uses the `.on-dark` token set (white and 86 percent lavender on
#22212b, above 12:1); warm band uses ink on #f2f0eb (above 13:1).

## Not done on purpose

- No customer-logo strip (we have no customers we may name).
- No mega-menu: we have one product, so the nav stays a simple link row.
- No video hero, no NICE imagery, no cookie banner copy.

## Open-source pieces

None added. Everything is our own CSS and React; the font is Be Vietnam Pro (SIL OFL 1.1,
already in use through next/font/google). Existing dependencies unchanged: lucide-react (ISC),
framer-motion (MIT).
