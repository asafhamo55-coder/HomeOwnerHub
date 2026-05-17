# 004 — Zero-cost-tier constraint for v1

**Date:** 2026-05-13
**Status:** Accepted
**Context:** Build Spec v1.1 §2.1. Asaf's directive — v1 ships using only free
tiers and existing infrastructure. Any service requiring a paid plan to
function is deferred until paying customers justify it. This ADR makes the
constraint explicit and records the substitutions we accepted when earlier
plans collided with paid pricing.

## Decision

No paid SaaS dependencies are introduced into v1 without a follow-up ADR
and Asaf's explicit approval. The free-tier inventory below is the v1
budget. When a tier crosses 80% utilization, the build raises an ADR for
upgrade — no automatic upgrades.

## Free-tier inventory (the v1 budget)

| Service | Free tier | What it covers in v1 |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth/mo | Three Next.js apps (`hoa`, `pm`, `eviction`) |
| Supabase | 500 MB DB, 1 GB storage, 50K MAU | App backend, auth, storage, pgvector |
| Plaid | Sandbox unlimited; Production 200 items/yr free | Bank account linking + W18 bank-feed |
| Stripe | Free integration; per-txn fees only | ACH + card + Apple Pay + Google Pay |
| Resend | 3,000 emails/mo, 100/day | Transactional email (notices, RFP invites) |
| Sentry | 5,000 events/mo | Error monitoring |
| PostHog | 1M events/mo | Product analytics |
| GitHub | Private repos + 2,000 Actions min/mo | Source control + CI |
| Cloudflare | DNS + Tunnel | DNS, inbound tunnel to GPU host for LLM |
| Foursquare Places | 1,000 calls/day (fallback only) | Not a v1 feature — held in reserve |

## Substitutions accepted (vs. v1.0 plan)

These are the explicit changes from earlier drafts. Each was driven by
"this previously-assumed free path is no longer free" or "the paid path
is not justified by Madison Park's traffic profile."

| Earlier plan | v1.1 substitution | Why |
|---|---|---|
| Trigger.dev / Inngest (managed) | `pg-boss` self-hosted in Postgres | Both have free tiers, but `pg-boss` runs in the DB we're already paying for (i.e. nothing). One fewer external dep. **Note:** Phase 1 production still runs on Inngest (see ADR-001); migration is a v1 build task, not a Phase 1 hot-fix. |
| Twilio voice + SMS in v1 | Defer to v1.5 entirely | Twilio has no usable production free tier. Email + in-portal chat cover the Madison Park design-partner phase. |
| AWS SES bulk email | Resend free tier only | 3,000/mo is enough for one HOA. Revisit when we hit the cap. |
| Google Places for vendor enrichment | **Defer to v1.5**; v1 vendor module is manual entry | Google removed the free tier Feb 2025. Min ~$275/mo. |
| Lambda / RunPod GPU from day one | Asaf's existing GPU during dev; rent only at demo time | Avoids $300–$800/mo GPU rental during the build phase. Cutover to RunPod when Madison Park goes live (see ADR-002). |
| White-glove migration tooling | CSV import + manual SQL for first 10 customers | Founder-led onboarding is the v1 GTM motion. Defer tooling until volume demands it. |
| Reserve study comparison data | Build the framework; populate later | No free public dataset. W9 ships framework-only in v1. |
| Premium fraud-detection ML | Use rules + LLM judgment in v1.5's W19 | No paid fraud API. v1 doesn't have the trailing-12-month data anyway. |
| Twilio SMS for notifications | Email-only in v1; in-portal chat for residents | Free tier covers the volume. |

## What this changes for the build

1. **§3 repo skeleton** adds `packages/accounting/`, `packages/vendors/`,
   `packages/payments/` — all live in the existing monorepo, no new
   SaaS. (`packages/jobs/` already exists for the `pg-boss` migration
   from Inngest when that work lands.)
2. **§5 workflow set** stays 17. Deferred workflows (W17, W19, W20,
   W24–W27) are tracked in `parking-lot.md` with the v1.1 reason.
3. **§14.1 vendor module v1** is manual-entry only. No public data
   enrichment. The `vendor_external_data` table exists in migration
   0007 but is nullable and unused in v1.
4. **§16 payment rails** include Pay-by-Zelle assisted reconciliation
   (a free differentiator) and exclude direct Zelle/Venmo APIs (which
   either don't exist or forbid our use case — see ADR-005).

## Escalation policy

When any free tier exceeds 80% utilization, Claude Code raises
`/docs/decisions/NNN-paid-tier-<service>.md` containing:

- Current usage (last 30 days)
- Projected month-end usage
- Smallest paid tier that fits
- Alternatives considered (other free providers, deferral, etc.)
- Recommendation

Asaf decides. The build does not silently upgrade.

## Open follow-ups

- Migrate `packages/jobs/` from Inngest to `pg-boss` — see ADR-001 open
  item. Target: month 2 of v1 build. Risk: medium (need to re-run the 5
  cron functions on a Postgres-backed scheduler). Until then we accept
  Inngest's free tier as a dependency.
- Decide Twilio vs Telnyx vs self-hosted Asterisk for v1.5 voice — open.
- Decide Google Places vs Foursquare for v1.5 vendor enrichment — open.
