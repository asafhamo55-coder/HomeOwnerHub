# 2026-10 — HOA Hub pricing: self-managed boards vs small management companies

**Date:** 2026-10-15 · **Status:** Draft — **owner decision** (BL-001) · **Changes no prices.** Stripe products, `packages/billing/src/pricing.ts` and the pricing pages are untouched by this doc.

**Inputs:** `docs/research/2026-10-competitors.md` §1.5, §2, §3, §4c.1, §5.1 (competitor prices as of the cited pages, 2026-10-15); `packages/billing/src/pricing.ts`; `apps/hoa/src/lib/billing.ts`.

---

## 1. The problem in one paragraph

We sell to volunteer boards ("AI for volunteer boards", `/hoa`) at a price set for management companies. $4.99/door with a $200 floor costs a 50-unit HOA **$249.50/mo**; PayHOA charges **$65**, GnomeOwner **$59**, HomeHerald **$0**. The board comparing tools sees 4× before it sees our general ledger, bank reconciliation, approval layer or state-law answers — which are exactly the things PayHOA's reviewers complain it lacks (research §2.2, §4b.3).

## 2. What we charge today (from the code, not the page)

| Doors | Billed doors | Monthly | Note |
|---:|---:|---:|---|
| 25 | 41 | **$204.59** | see finding below |
| 50 | 50 | $249.50 | |
| 150 | 150 | $748.50 | |
| 400 | 400 | $1,996.00 | |

**Finding — the floor is not $200.** `billableDoors()` rounds the implied minimum *up* (`ceil(200 / 4.99) = 41` doors), and checkout sends that quantity to Stripe (`apps/hoa/src/lib/billing.ts`), so the smallest bill is 41 × $4.99 = **$204.59**, while marketing, the billing page and the ROI calculator all say "$200/mo minimum". Whatever is decided below, the floor should be a real floor (a separate minimum price, or `floor(...)` plus a top-up), and a unit test should pin it.

**Second finding — the homepage contradicts the pricing page.** `apps/marketing/src/components/site/pricing-teaser.tsx` advertises flat tiers of **$39 / $79 / $149** per month ("HOAs pay between $40 and $150 a month"); `/pricing` and checkout charge per door. Prices were left alone here (owner's call), but the two must agree the day this is decided.

## 3. Competitor price points at the four sizes BL-001 asks for

All monthly. "n/p" = not published for that size. Sources are research §2 and §3.

| Doors | **Us today** | PayHOA (self-managed leader) | Enumerate (mgmt + self-managed) | Buildium (mgmt; association price by quote) |
|---:|---:|---:|---:|---:|
| 25 | $204.59 | $54 (0–25 tier) | $375 (min; $0.75/door) | $62 Essential – $192 Growth (residential list) |
| 50 | $249.50 | $65 (26–50) | $375 (min) | $62 – $192 |
| 150 | $748.50 | n/p — between $109 (51–100) and $219 (201–300) | $375 (min) | $192 – $400 |
| 400 | $1,996.00 | n/p — between $219 (201–300) and $275 (401–500) | $375 (min) | $400 Premium (+ per-EFT fees) |

Also relevant: GnomeOwner $29 (25) / $59 (100) / $99 (250); HOA Start from $39; HOA Express free ≤50; HomeHerald free ≤50; HOALife $199–299 flat; AppFolio ≈$0.80/unit association rate with a $298 minimum and a 50-unit minimum. Payment fees are on top almost everywhere (PayHOA ACH $2.45, card 3.5% + $0.50).

Reading the table: at 25–50 doors the self-managed market clears at **$0–65**. At 150–400 doors the management-company tools converge at **$375–400**. We are above both everywhere, and ~5× Enumerate at 400 doors.

## 4. Variable cost basis

**AI (Groq).** Default model `openai/gpt-oss-120b`, fast path `openai/gpt-oss-20b` (`packages/ai/src/model.ts`); vision `qwen/qwen3.6-27b` at ~⅓¢ per request with photos (W34 notes). **Not measured:** `ai_runs` has `tokens_in`/`tokens_out` per run, but this branch has no database access, so the figures below are an **estimate**. Owner, to replace the estimate with real numbers:

```sql
select organization_id, date_trunc('month', created_at) as month, model,
       count(*) as runs, sum(tokens_in) as tok_in, sum(tokens_out) as tok_out
from ai_runs where created_at > now() - interval '90 days'
group by 1, 2, 3 order by 1, 2;
```

Estimate for a busy 50-door board (≈200 inbox drafts, 150 document/law questions, 30 digests, 20 violation drafts with photos, 50 comms rewrites a month): ≈5M input + 0.5M output tokens on gpt-oss-120b at Groq list ≈$0.15/$0.60 per 1M ≈ **$1.05**, plus ≈$0.10 vision → **≈$1–2 per org per month**. Scale roughly with activity, not doors: **≈$3–8** at 400 doors. Embeddings (ADR-003) are a rounding error at this size.

**Everything else per org:** Resend email (pennies at board-only volume; resident blasts are the swing factor), Plaid production items (~$0.30–1.50 per connected bank account per month, estimate), storage. Fixed platform costs (Supabase, Vercel) don't vary per org.

**Conclusion:** variable cost is **≈$2–5 per org per month** below 150 doors and **under $15** at 400. Margin is not the constraint on any scenario below; positioning is.

## 5. Three priced scenarios

Each has a per-door rate, a floor, and an unbundled **AI add-on** (W3 violation drafts, W32 reply drafts, W34 work orders, W22/W23 RFPs, Copilot, digest narrative). Document and state-law Q&A with citations (W1/W30) stay in the base in every scenario — they are table stakes now (HomeHerald, GnomeOwner give them away) and they are how a board first sees the product work. Annual prepay keeps 10% off in all three.

### A — "Self-managed first": $1.00/door, $59 floor, AI add-on $0.50/door ($25 min)

| Doors | Base | + AI add-on | Total | vs PayHOA | vs Enumerate | vs Buildium |
|---:|---:|---:|---:|---|---|---|
| 25 | $59 | $25 | **$84** | +$30 (base +$5) | −$291 | ≈ Essential–Growth |
| 50 | $59 | $25 | **$84** | +$19 (base −$6) | −$291 | ≈ Essential–Growth |
| 150 | $150 | $75 | **$225** | within PayHOA's $109–219 band (base) | −$150 | ≈ Growth |
| 400 | $400 | $200 | **$600** | base above $219–275 | +$225 | +$200 vs Premium |

Base is PayHOA's price with a full general ledger, bank reconciliation, approvals and cited document Q&A on top — the switching argument research §4b.3 and §5.1 describe. With AI it is still a third of today's price at 50 doors.

### B — "Middle": $1.50/door, $79 floor, AI add-on $0.75/door ($25 min)

| Doors | Base | + AI | Total | vs PayHOA | vs Enumerate |
|---:|---:|---:|---:|---|---|
| 25 | $79 | $25 | **$104** | +$50 | −$271 |
| 50 | $79 | $38 | **$117** | +$52 | −$258 |
| 150 | $225 | $113 | **$338** | base above band | −$37 |
| 400 | $600 | $300 | **$900** | ~3× | +$525 |

Halves today's price but still loses the price-led 25–50-door comparison, and at 400 doors is 2.4× Enumerate.

### C — "Small management companies": $2.49/door, $149 floor, AI add-on $1.00/door ($25 min)

| Doors | Base | + AI | Total | vs PayHOA | vs Enumerate | vs Buildium |
|---:|---:|---:|---:|---|---|---|
| 25 | $149 | $25 | **$174** | ~3× | −$201 | ≈ Growth |
| 50 | $149 | $50 | **$199** | ~3× | −$176 | ≈ Growth |
| 150 | $374 | $150 | **$524** | — | +$149 | +$124 vs Premium |
| 400 | $996 | $400 | **$1,396** | — | 3.7× | 3.5× |

Priced against Enumerate/Buildium for a manager running a handful of small associations. It only works if we sell what management companies buy — and today we don't have it: no portfolio view across associations, no per-manager access across boards (the "multi-board access controls" claim was removed from pricing in BL-002 because it isn't built), no owner-statement or vendor-payment runs. At 400 doors it is still 3.5× the incumbents.

### Revenue at a glance (monthly, with AI add-on)

| Doors | Today | A | B | C |
|---:|---:|---:|---:|---:|
| 25 | $204.59 | $84 | $104 | $174 |
| 50 | $249.50 | $84 | $117 | $199 |
| 150 | $748.50 | $225 | $338 | $524 |
| 400 | $1,996 | $600 | $900 | $1,396 |

Today's column is list price, not revenue: no customer pays it yet (the six-month pilot), so moving down from it loses no actual revenue.

## 6. Recommendation

**Adopt Scenario A for HOA Hub: $1.00/door, $59/mo floor, AI add-on at $0.50/door ($25 min), 10% off annual — and do not build a management-company plan yet.**

1. **Self-managed boards are the segment our product and pitch already serve**, and they buy on price (research §4c.1, §5.1). A puts the base at PayHOA's price with an accounting depth PayHOA's reviewers ask for, and keeps AI as a visible, separately-valued upgrade instead of a reason the base looks expensive. At ≈$2–5/org variable cost, A's $84 at 50 doors is still >90% gross margin.
2. **Small management companies are not a pricing problem, they are a product gap.** Scenario C prices for a buyer whose core needs (portfolio view, cross-association access, manager workflows) we don't ship. Revisit with a per-door management tier when those exist; until then a manager can buy A per association.
3. **Ship it with the money loop, not before.** Repricing pays off only if a board can switch, and §5.2 of the research is blunt that no board switches to a product its residents can't pay through. Sequence: BL-006 (Pay-by-Zelle) → announce A. Grandfather Madison Park on whatever it is promised.

This is a recommendation; the owner decides (backlog risk note on BL-001).

## 7. Code changes this implies (none made here)

1. **`packages/billing/src/pricing.ts`** — `PER_DOOR_USD: 1.00`, `MIN_MONTHLY_USD: 59`; add `AI_ADDON_PER_DOOR_USD: 0.50`, `AI_ADDON_MIN_USD: 25`; fix the floor so the minimum bill equals the advertised minimum (§2 finding — today `ceil` makes it $204.59), with a unit test pinning each of the four sizes in §5.
2. **Stripe** — new recurring Prices for the base per-door rate (monthly + annual) and the AI add-on (monthly + annual); keep the old Prices for grandfathered orgs. `apps/hoa/src/lib/billing.ts` checkout adds a second line item when the add-on is chosen. Reconsider the 12-month commitment (`COMMIT_MONTHS`) — the self-managed tools are month-to-month.
3. **Entitlement** — an "AI add-on" flag per org, checked in the AI routes/workflows listed in §5 (W1/W30 stay ungated). `orgs.plan` is free text today; a new value avoids a migration, a dedicated column needs one (migration batch, applied by the owner).
4. **UI** — `/settings/billing` `PlanPicker` gains the add-on toggle; `apps/marketing/src/app/pricing/page.tsx`, its metadata title, `roi-calculator`, and **`pricing-teaser.tsx` (currently $39/$79/$149 — must be brought in line)** all read from `pricing.ts`.
5. **Docs** — supersede the price line in research §1.5 and this ADR's status once decided.
