# Weekly SEO audit, 2026-11-02 (run 2026-10-31)

Scope: apps/marketing (www.homeownerledger.online). Method: `next build` and `next start`, then a Playwright (Chromium) crawl of every URL in `/sitemap.xml`, with axe-core (WCAG 2 A and AA) run on each page and every internal link found on those pages fetched for a status code. The crawl was run before and after the fixes below.

## Result

| Check | Before | After |
| --- | --- | --- |
| Sitemap URLs crawled | 104 | 104 |
| HTTP 200 | 104 | 104 |
| Unique titles | 104 | 104 |
| Unique descriptions | 104 | 104 |
| Titles 50-60 chars (rendered, with suffix) | 88 | 104 |
| Descriptions 140-160 chars | 81 | 104 |
| Canonical present and matching the path | 104 | 104 |
| Exactly one H1 | 104 | 104 |
| Images without alt | 0 | 0 |
| Broken internal links (404 or 5xx) | 0 | 0 |
| Pages with a page-specific OG and Twitter image | 0 (all shared one image) | 104 |
| Pages with SoftwareApplication and WebSite JSON-LD | 0 | 104 |

Nothing on the site renders a raster `<img>` (0 images on every sampled page), so there are no image weights to optimise. The LCP element is the H1 on every page sampled (/, /hoa, /pricing, /roadmap, /honesty-bars, /security, a guide), with LCP at 40-110 ms on localhost.

## Fixed this run (in scope)

1. **Per-page share images.** New `app/og/route.tsx` (next/og) renders the page title on a violet card, 1200x630, system font, title clamped to 90 characters, long cache headers. `pageMetadata()` in `lib/site.ts` now points every page's Open Graph and Twitter image at `/og?title=<page title>`. The existing `app/opengraph-image.tsx` stays as the default for routes that don't use `pageMetadata`. `/og` is deliberately not disallowed in robots.txt: Twitterbot honours robots rules and would drop the card.
2. **Structured data.** `lib/jsonld.ts` gained `websiteLd()` and `softwareApplicationLd()`. The root layout now emits Organization, WebSite and SoftwareApplication on every page. The offers are read from `lib/hoa-pricing.ts` (Essentials $49 and Complete $99 a month, entry band, with the 30-day trial and "rises by community size band" in the offer description), so they cannot drift from /pricing. No `aggregateRating`, review or count anywhere, and a test now fails if one appears. BreadcrumbList, Article, FAQPage and HowTo were already emitted by the page and guide templates.
3. **Titles and descriptions to the 50-60 and 140-160 targets.** 16 titles and 23 descriptions were short. Rewritten in `lib/page-meta.ts`, `lib/state-law.ts` (Florida and Texas hubs) and `lib/georgia/*` (4 guide titles, 1 checklist). The home title is now "HomeownerHub: AI workspace for self-managed HOA boards". The pricing description reuses the pricing copy plus "Month to month, and no card needed to start" (both stated on /pricing). No claims were added that the pages don't already make.
4. **Audit test tightened.** `lib/seo-audit.test.ts` now enforces 50-60 title and 140-160 description (it was 30-60 and 70-160), expects the per-page OG image, and checks the structured-data builders.
5. **next.config headers.** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, `Strict-Transport-Security`, `poweredByHeader: false`, and a one-day browser and one-week edge cache on `/brand/*`.
6. **Image settings.** `images.formats` is AVIF then WebP and `minimumCacheTTL` is a day, ready for the day the site uses `next/image`.

Sitemap and robots were already correct (lastModified is content date, previews are `Disallow: /`, sitemap and host point at the .online origin) and are unchanged.

## Remaining issues (outside scope: page bodies and components)

Accessibility (axe, serious or critical), by file:

- `apps/marketing/src/components/site/state-law-built-in.tsx`: eyebrow and H2 on a dark section have contrast ratios of 1.4 and 1.48 (colours #d1c8e4 and #c8c7c5 against a light background). Affects `/` (20 nodes) and `/hoa` (20 nodes). Likely a light-on-dark text style on a section whose dark background is not applied, or a light background where dark was intended.
- `apps/marketing/src/components/site/audit-log-live.tsx` (lines 180, 210, 219, 222): `text-background/40` and similar small text at 3.5:1 on the dark panel, needs 4.5:1. Affects `/security` (33 nodes).
- `apps/marketing/src/components/site/roi-calculator.tsx` (lines 60 and 71): two `<input type="range">` elements have no label. Critical. Affects `/pricing`.
- `/honesty-bars` (19 contrast nodes) and `/roadmap` (123 contrast nodes in the first crawl, none in the second) show contrast failures that vary between runs, which points to elements captured mid fade-in animation. Owner of the page body should check the final colours.

Performance:

- First Load JS is 331-352 kB per route against 172 kB shared. Every page loads one extra chunk (`chunks/7563-*.js`, 530 kB raw) that is not in the shared set. The 2026-10-27 audit recorded 229-233 kB and a 200 kB budget, so this is a regression somewhere in the layout or provider tree. Not identified here; needs a bundle analyzer run (`@next/bundle-analyzer`) by whoever owns the layout and providers.
- Fonts are self-hosted by `next/font` with `display: swap` and preloaded (no render-blocking font request). Six woff2 files, about 107 kB, load on every page because Be Vietnam Pro is loaded in five weights plus JetBrains Mono. Dropping weight 300 and loading the mono face only where used would save roughly a third. This is in `app/layout.tsx` and touches visual design, so it was left alone.
- Three render-blocking stylesheets in `<head>` per page (Next's normal CSS chunks). Nothing to act on.

Content (not found, listed for completeness):

- No missing or duplicate H1s, no images without alt, no broken internal links on any of the 104 pages.
- `/landlords` and `/eviction` build as pages but redirect to `/hoa` and are correctly absent from the sitemap (BL-097).

## Reproduce

Build with `NEXT_PUBLIC_SITE_URL=http://localhost:3199`, run `next start -p 3199`, then crawl `/sitemap.xml`. Without that variable the build uses the production origin, which is what ships.
