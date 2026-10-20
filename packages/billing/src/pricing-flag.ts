/**
 * BL-104 switch: the 2026-10-20 Essentials / Complete band pricing
 * (docs/decisions/2026-10-20-pricing.md).
 *
 * false until the owner has created the four tiered Stripe Prices and
 * confirmed them (docs/specs/2026-10-20-pricing-v2-rollout.md). With it
 * false, checkout, Settings → Billing and the marketing site charge and
 * show exactly what they did before ($4.99/door).
 *
 * Why a code constant (like M1_APPLIED) and not an env var:
 *   - The marketing-truth rule (2026-10-18-marketing-pricing-truth.md §5)
 *     says checkout and the public site change in ONE PR. apps/hoa and
 *     apps/marketing are separate Vercel projects; an env var could be on in
 *     one and off in the other, which is exactly the mismatch the rule
 *     forbids. apps/marketing/src/lib/hoa-pricing.ts mirrors this literal and
 *     its test fails if the two differ, so one commit flips both apps.
 *   - The flip is reviewed and visible in git history, and the release-note
 *     email fires on that deploy. Env vars here have bitten us before (a
 *     TEAM-level var shadowed a tested default and was invisible to
 *     `vercel env ls`).
 *   - Integration and unit tests can render both states without env setup.
 *
 * No imports: pure modules (and the marketing test) read this file.
 */
export const PRICING_V2: boolean = false
