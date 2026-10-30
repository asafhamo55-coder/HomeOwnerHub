# 2026-10-18 — Marketing shows the price checkout charges (BL-042)

**Status:** Decided (BL-042, under the owner's delegation of 2026-10-17). **Changes no prices.** Stripe, `packages/billing/src/pricing.ts` and the product app are untouched.

## Problem

Three HOA prices were live on the marketing site at once:

| Where | Said | Checkout charges |
|---|---|---|
| Homepage teaser (`pricing-teaser.tsx`) | flat $39 / $79 / $149 a month ("HOAs pay between $40 and $150") | per door |
| `/compare` | "$79/mo at 180 doors", "$948/year", "a management quote = ~18 months of Ledger" | $898.20/mo at 180 doors |
| `/pricing`, ROI calculator | $4.99/door, "$200/mo minimum" | $4.99/door, but a **$204.59** minimum (see below) |

The owner has decided new prices (pricing scenario A, extended by BL-068 module pricing). But BL-068 (module switches) isn't built, and Stripe still charges the old price. Advertising the new price before checkout charges it would be a false claim.

## Decision

1. **The site shows only what checkout charges today.** That is $4.99 per door per month, or $53.88 per door per year on the annual plan ($4.49/door/mo, 10% off). Both plans carry a 12-month first-year commitment, as `/settings/billing` already says.
2. **The minimum is stated as it is billed:** "41-door minimum ($204.59/mo)". `billableDoors()` rounds `200 / 4.99` up to 41 doors, so the advertised "$200 minimum" was never charged. (This is finding §2 of `2026-10-pricing.md`. Fixing the floor itself is a billing change, which is out of scope here.)
3. **One source:** `apps/marketing/src/lib/hoa-pricing.ts`. The homepage teaser, `/pricing`, `/compare`, the ROI calculator and the `/demo` FAQ all read their prices from it.
   - `hoa-pricing.test.ts` checks it against `packages/billing/src/pricing.ts` (constants, billable doors and monthly bill at ten sizes) and against the cent amounts in `setup-stripe-pricing/route.ts` (499 and 5388).
   - It also fails if any of those five pages hand-types an HOA price (`$39`, `$79`, `$149`, `4.99`, `$200`, `$948`, "18 months" …).
4. **The teaser and `/pricing` render the same `HOA_PLANS` list**, so they can't drift apart again.
5. When BL-068 ships and Stripe charges module prices, change `hoa-pricing.ts` (and its test pins) in the **same PR** as the checkout change, not before.

## Known gap (billing, not marketing)

The in-app `annualCostUsd()` uses `monthly × 12 × 0.9` and gets $9,700.56 at 180 doors. The Stripe annual Price is 5388 cents per door, which gives $9,698.40. Marketing shows the Stripe figure. The in-app display is off by about $2 at that size. Fix this along with the floor when billing is next touched.

## Module prices (superseded 2026-10-30)

The per-module price table that stood here (BL-068, never charged) was removed in the PRICING_V2 cut-over. Pricing is now Essentials / Complete size bands: `docs/decisions/2026-10-20-pricing.md`.

## Testimonials (coordinator decision, 2026-10-18)

The composite "typical feedback" testimonials (Jon, James and Sarah) were removed from the homepage. They read as real customers, and they weren't. Only Linda's verbatim Madison Park reference quote remains. Add a quote back only when a named customer has agreed to it.

## 2026-10-19 round 3 (BL-090)

- **Shipped features now listed as available:** Spanish announcements, AI ARC review, inspection mode, follow-up letters, payment plans and recurring entries.
- **Removed or reworded every unsupported metric:**
  - 32+ hours, 247 questions and $4,200;
  - demo conversion rates;
  - competitor prices and setup times;
  - uptime and backup claims;
  - "Georgia counsel reviewed".
- **Open, waiting on Asaf:**
  - Is "Linda, Madison Park" a real person who gave the marquee quote? The repo's design docs use Linda as a buyer persona. If she isn't real, remove the quote everywhere.
  - Eviction/PM pages still claim "attorney-reviewed". That's out of HOA scope; it was left as is.

## 2026-10-19 update: Linda quote removed

Resolved under the owner-delegated defaults (`2026-10-19-owner-delegated-defaults.md`): no customer quote is verified, so Linda's quote has been removed everywhere on the marketing site. That covers the homepage marquee and case-study section, the /hoa persona card (now a product-facts list), /demo and /case-studies. `/case-studies/madison-park` redirects to `/case-studies`, which says case studies will be published once a customer approves them. No replacement testimonial was written.
