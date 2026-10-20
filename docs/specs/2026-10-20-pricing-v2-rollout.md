# 2026-10-20 — Pricing v2 rollout (BL-104)

**Decision:** `docs/decisions/2026-10-20-pricing.md` · **Backlog:** BL-104 · **Flag:** `PRICING_V2` in `packages/billing/src/pricing-flag.ts`, mirrored in `apps/marketing/src/lib/hoa-pricing.ts`.

## What is live and what is flagged

| Part | State | Where |
|---|---|---|
| Shared board AI cap on the board-only routes that had no limit: violation drafting (wizard, /inspect, analyze-violation), the daily digest, parse-document and suggest-fields, shared with the compose box. 200/day for every org today (the Complete level) | **Live** | `board_ai` bucket + `BOARD_AI_POOL` in `apps/hoa/src/lib/api/ai-limits.ts` |
| Existing orgs | **Live:** today's per-feature limits, unchanged. No current customer loses capacity | `aiTierFor` returns `null` = the base ceilings |
| Per-band AI ceilings (worst-case AI ≤ 30% of the band price) for orgs on the new plans; board cap 100/day on Essentials | **Code ready, applies only after `PRICING_V2`**, and only to `essentials` / `complete` orgs and trials | `aiLimitFor`, `AI_BAND_MULTIPLIER`, tier read in `lib/api/rate-limit.ts` (`loadAiTier`) |
| Essentials / Complete band prices, Stripe tier params, checkout, entitlements, grandfathering, Settings → Billing copy, marketing copy | **Behind `PRICING_V2` (off)** | `packages/billing/src/{pricing-v2,checkout-v2,entitlements,grandfathering}.ts`, `apps/hoa/src/lib/billing.ts`, `settings/billing/*`, `apps/marketing/src/lib/hoa-pricing.ts` |

With the flag off, checkout, Settings → Billing and the marketing site charge and show $4.99/door exactly as before.

### Why a code constant, not an env var

`apps/hoa` and `apps/marketing` are separate Vercel projects. An env var could be on in one and off in the other, which is the checkout/site mismatch the marketing-truth rule forbids. The marketing copy of the flag is pinned to the billing one by `hoa-pricing.test.ts`, so a single commit flips both apps, the flip is reviewed, and the release-note email fires on that deploy. (A team-level env var has already shadowed a tested default once: see the AI model outage.)

### AI ceilings in numbers

**Who gets which limits:**
- **Before the flip, every org:** today's per-feature limits exactly, plus the new `board_ai` cap at 200/day. The tier isn't even read.
- **After the flip, grandfathered $4.99/door orgs** (`monthly`, `annual`, `legacy_per_door`) **and any other pre-flip plan value** (such as `pilot`): the same, until renewal moves them to `complete` (`grandfathering.ts`; the webhook rewrites `orgs.plan`).
- **After the flip, `essentials` / `complete` orgs:** the band multipliers below. Orgs with no subscription are on the trial footing: Essentials, 1–50.

`ai-limits.test.ts` pins every bucket's legacy limits to today's literal values.

For new-plan orgs, `perOrg.limit = max(5, round(base × multiplier))`. Base = today's ceilings. Per-user windows are unchanged.

| Band | Essentials | Complete |
|---|---:|---:|
| 1–50 (and trial) | 0.10× | 0.20× |
| 51–100 | 0.18× | 0.30× |
| 101–200 | 0.28× | **0.54×** |
| 201–400, 401+ | 0.44× | 0.85× |

Complete 101–200 is 0.54, not the record's 0.55: at 0.55 the worst case is $68.76, six cents over 30% of $229. `ai-limits.test.ts` checks the ≤30% rule at every door count from 1 to 2,000 for both plans.

Example for a new-plan org: Complete at 40 doors gets 100 doc questions and 120 assistant messages a day. Realistic use is ~150 document questions a **month** (research §3.1). Legacy orgs keep 500 and 600 until renewal.

~~**Not capped, pending a decision amendment:** `meeting-summary` and `ask-community`.~~ Capped since BL-106 (own buckets) and sized by BL-108, below.

### AI budget per plan (BL-108, implemented behind `PRICING_V2`)

Decision: `docs/decisions/2026-10-20-ai-spend-ceiling.md`. Code: `apps/hoa/src/lib/api/ai-limits.ts` (caps, sizing rule, tiers), `ai-spend.ts` (meter, kill switch), `ai-spend-notice.ts` (board email), `rate-limit.ts` (`checkAndRecordAiUsage` / `requireAiQuota`, `loadAiBudget`), `components/billing/AiSpendBanner.tsx`, `packages/jobs/src/ai-spend-alert.ts`.

- **Caps for new-plan orgs:** Copilot 10 / 15 / 20 / 30 a day on Essentials and 25 / 40 / 60 / 100 on Complete (1–50 / 51–100 / 101–200 / 201–400 and 401+); meeting summaries 2 a day on Essentials and 3 on Complete. Own buckets, never the `board_ai` pool. Orgs with no tier keep 10 summaries and 25 Copilot questions a day.
- **Sizing rule:** a heavy-use month (25% of each cap, `board_ai` 30%, Copilot 50%, 8 summaries) is at most 20% of the price at every door count from 1 to 2,000 (`ai-limits.test.ts`; it lands at 13–17.5% on the closed bands).
- **Monthly spend meter** (new-plan orgs and trials only): this calendar month's (UTC) `ai.usage.*` counts × the per-call estimates, cached 60 s per instance. 20% of the price: one FYI email to the board. 25%: resident-facing and automatic AI refused (their existing 429 message, reason `spend_ceiling`) plus a dashboard banner and an email. 30%: board AI refused too, until the 1st. Trials: $5 a month in total. If the meter read fails, the per-bucket caps still apply and the failure is logged with ids only; AI is not blocked.
- **Platform:** `AI_PLATFORM_KILL_SWITCH=1` in Vercel production refuses every metered AI call with a friendly 503 (`upstream_unavailable`, reason `ai_paused`). Unmetered model calls (the inbox's manual "Draft a reply", background jobs, embeddings) do not pass through it. A daily Inngest job (`ai-spend-alert`, 00:30 UTC) emails `AI_SPEND_ALERT_TO` (platform admin, comma-separated, set in Vercel production) when yesterday's estimated platform spend passes $50. It is live for every org (it only emails the admin); unset recipient = log only.
- **Index (owner, if slow):** the meter filters `audit_log` by `(org_id, action, created_at)`. The only index today is `(org_id, created_at DESC)`. Candidate SQL, not applied: `docs/specs/2026-10-20-audit-log-ai-index.sql` (the same index as item 9 of `2026-10-19-perf-indexes.sql`). Not needed until new-plan orgs exist.

## Stripe objects to create (at the cut-over, not before)

All on the existing product **"HOA Hub"**. Each is a recurring Price, `currency: usd`, `billing_scheme: tiered`, `tiers_mode: volume`. Amounts in cents. In volume mode Stripe prices every unit at the tier the quantity lands in: a closed band is its `flat_amount`, 401+ is `flat_amount + unit_amount × doors`. `stripeTiers()` in `pricing-v2.ts` generates exactly these, and a test proves they equal `planPriceCents` at every size from 1 to 2,000.

| Lookup key | Interval | ≤50 | ≤100 | ≤200 | ≤400 | 401+ (`inf`) |
|---|---|---:|---:|---:|---:|---|
| `hoa_essentials_monthly` | month | flat 4900 | flat 7900 | flat 11900 | flat 17900 | flat 0, unit 45 |
| `hoa_essentials_annual` | year | flat 49000 | flat 79000 | flat 119000 | flat 179000 | flat 0, unit 450 |
| `hoa_complete_monthly` | month | flat 9900 | flat 14900 | flat 22900 | flat 34900 | flat 900, unit 85 |
| `hoa_complete_annual` | year | flat 99000 | flat 149000 | flat 229000 | flat 349000 | flat 9000, unit 850 |

Closed tiers have `unit_amount: 0`. Checks: 50 doors Essentials monthly = $49; Complete 401 doors monthly = 900 + 85 × 401 = 34,985¢ = $349.85.

**Leave `hoa_per_door_monthly` and `hoa_per_door_annual` active.** Grandfathered subscriptions use them until renewal. Never archive or edit a Price a live subscription uses.

Two ways to create them:
1. **Setup route (preferred).** After the flag commit is deployed, `POST /api/admin/setup-stripe-pricing` (platform-admin session or `Authorization: Bearer $STRIPE_PRICING_SETUP_SECRET`). With `PRICING_V2` on it also creates the four Prices above, idempotently by lookup key, and returns their ids under `bandPrices`.
2. **Dashboard, by hand.** Create the four Prices with the table above and set each lookup key exactly. Optionally set `STRIPE_PRICE_ESSENTIALS_MONTHLY`, `STRIPE_PRICE_ESSENTIALS_ANNUAL`, `STRIPE_PRICE_COMPLETE_MONTHLY` and `STRIPE_PRICE_COMPLETE_ANNUAL` in Vercel production (checkout reads these before the lookup key).

**Customer portal (dashboard, Asaf):** turn quantity editing **off**. Allow switching Essentials ↔ Complete only if the portal accepts tiered Prices in test mode; otherwise leave plan switching off (boards switch through support until a settings-page switch exists).

## Flip steps

1. **Before cut-over (ids only, no PII):** in live mode, list subscriptions whose price lookup key is `hoa_per_door_monthly` or `hoa_per_door_annual`. Record org id, cadence and term end in BL-104. Confirm whether anyone besides the Madison Park pilot pays list price.
2. **Pilots and design partners:** any org on `plan = 'free'` that must keep every module (Madison Park, design partners) gets a non-free plan value first, e.g. `pilot`. After the flip, `free` means "trial / no subscription" and gets Essentials; any unknown value gets Complete.
3. **Test mode:** create the four Prices in Stripe test mode (setup route against the test key, or the dashboard). Check out at 50, 51, 401 doors on both plans and confirm each invoice equals `planPriceCents`.
4. **The flip commit:** set `PRICING_V2 = true` in **both** `packages/billing/src/pricing-flag.ts` and `apps/marketing/src/lib/hoa-pricing.ts`. Also in that commit: flip the `ships off` assertion in `packages/billing/src/pricing-v2.test.ts`; remove the "Coming soon" module table from `docs/decisions/2026-10-18-marketing-pricing-truth.md`; add the release note. Gates: `pnpm typecheck`, `pnpm typecheck:integration`, `pnpm test:unit`.
5. **Live Stripe:** after the deploy, create the four live Prices (setup route or dashboard). Until they exist, a v2 checkout fails with the generic "checkout isn't set up" message and logs `v2 checkout price not configured` with the lookup key.
6. **Portal settings** as above.
7. **Verify:** the marketing /pricing page and Settings → Billing show the same $49 / $99 for a 50-home org; a grandfathered org sees "Your current price stays until your term ends" and no checkout button.
8. **Outside the repo:** update the investor deck (`~/HomeownerHub-decks/`) to the band table.

### Rollback

Set both constants back to `false` and redeploy. New subscriptions already on the band Prices keep working (the webhook maps their lookup keys to `essentials` / `complete` whatever the flag says); only the checkout and the copy switch back.

## Grandfathering (decision §5)

`packages/billing/src/grandfathering.ts`. A legacy subscription (`plan` = `monthly`, `annual` or `legacy_per_door`) keeps its $4.99/door Price until renewal: the end of the 12-month commitment for monthly subscribers (or the next invoice once past it), or the end of the paid year for annual. At renewal it moves to Complete at its band with `proration_behavior: 'none'`; the board is told 30 days before. Checkout refuses a legacy subscriber (`reason: 'grandfathered'`), and Settings → Billing shows the kept price and the price they will move to. Until renewal, legacy subscribers get Complete entitlements and today's AI limits, with the board cap at 200/day.

## Not in this change (still BL-104)

- Nightly band-sync job (recount units, update quantity with no proration) and the renewal-migration job (30-day email, swap at term end). The rule they apply is `grandfathering()`.
- SMS allowance per plan (decision §4).
- Module-off pages and nav hiding: `moduleEnabled()` exists, but the BL-068 per-tenant switches need migration batch M2, so nothing reads it yet.
- A trial that ends without a card setting the org to `free`: the existing `customer.subscription.deleted` path already does this.
- The "trial on Essentials limits" rule only covers orgs with no subscription. `orgs` has no status column, so an org trialing **Complete** gets Complete limits during the trial.
- Webhook writing `legacy_per_door`: legacy subscriptions keep writing `monthly` / `annual`, which `isLegacyPlan` already treats as legacy.
