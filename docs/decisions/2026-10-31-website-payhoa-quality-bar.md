# Website quality bar: match PayHOA's structure and polish, not its content

**Date:** 2026-10-31 · **Decided by:** Asaf (owner likes https://www.payhoa.com and wants our site to look and feel like it).

## Decision

Match structure, patterns and quality bar only. Never copy their text, images, logos or brand. Never fake reviews, ratings, customer logos, testimonials or counts.

Revises the home section order in `2026-10-27-website-product-first-positioning.md`. New order (pinned by `marketing-truth.test.ts`):
Hero, FeatureExplorer, UpAndRunning, StateLawBuiltIn, TrustSecurity, PricingTeaser, HomeFaq, CtaCloser.
Pillars, ProductTour and HowItWorks leave the home page (ProductTour stays on /hoa).

## Design tokens (apps/marketing/src/app/globals.css)

- Body 18px, line-height 1.6. H1 at most 56px.
- Primary button: violet #4B27C9, 12px radius, tinted shadow, min height 48px. White-on-violet variant on the gradient slab.
- Cards 20px radius with large soft violet-tinted shadows. Pale violet canvas. Section padding about 104px desktop, 72px mobile.
- Contrast: body ink on the canvas stays above 6:1 (see the measured list in globals.css).

## Claims checked for the hero checklist

| Line | Evidence |
| --- | --- |
| 30-day free trial | `TRIAL_DAYS` in `lib/hoa-pricing.ts`, mirrors packages/billing |
| No credit card to start | `packages/billing/src/checkout-v2.ts` collects a card only `if_required`; pricing copy says no card needed |
| Import your roster yourself | `/properties/import` in apps/hoa (CSV or Excel, preview) |
| Cancel anytime | v2 pricing copy: month to month, cancel in Settings, Billing |
| ~~We load your roster~~ | DROPPED: nothing in code or docs says we do the loading |

Card and ACH online payments are not shipped. No page copy may claim them (a test checks the feature explorer).

## Fixes

- "Start free trial" linked to /demo. It now goes to the app's signup (`SIGN_UP_URL` in `lib/app-origin.ts`).

## Stopgaps

- The hero and feature panels use the in-repo HTML mockups (`mockups.tsx`, `tour-screens.tsx`) with sample data, labelled as such.

## TODO: proof section (owner assets needed)

There is no proof section on purpose. Do not add one until the owner supplies:

1. Real product screenshots (dashboard, Approvals, a violation letter, announcements) to replace the mockups.
2. Real testimonials from named board members, with written permission to publish. No invented reviews, ratings, logos or counts.
3. Optional: permission to name an association or a case study.
