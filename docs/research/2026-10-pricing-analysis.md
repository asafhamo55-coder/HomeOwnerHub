# 2026-10 pricing analysis — BL-001 refresh and BL-068 module pricing

**Date:** 2026-10-20 · **Status:** research input to `docs/decisions/2026-10-20-pricing.md` · **Changes no prices.** Stripe, `packages/billing/src/pricing.ts` and `apps/marketing/src/lib/hoa-pricing.ts` are untouched.

**Inputs:**
- Code: `packages/billing/src/pricing.ts`, `apps/hoa/src/lib/billing.ts`, `apps/hoa/src/app/api/admin/setup-stripe-pricing/route.ts`, `apps/marketing/src/lib/hoa-pricing.ts`, `packages/ai/src/model.ts`, `apps/hoa/src/lib/api/ai-limits.ts`.
- Docs: `docs/decisions/2026-10-pricing.md` (BL-001 first pass, scenario A), `docs/decisions/2026-10-18-marketing-pricing-truth.md`, `docs/decisions/2026-10-19-owner-delegated-defaults.md`, `docs/backlog.md` BL-001 and BL-068, `docs/research/2026-10-competitors.md` §1.5, §2.2, §2.3.
- Fresh competitor pages, fetched 2026-10-20 (§2). An adversarial review by an advisor agent (Opus) is in §6 and was folded into the recommendation.

---

## 1. Where we are

| | Today (checkout) |
|---|---|
| Price | $4.99/door/mo; annual $53.88/door/yr (10% off) |
| Floor | `ceil(200 / 4.99)` = 41 doors → **$204.59/mo** (not the "$200" the code aims for) |
| Term | 12-month first-year commitment on both cadences |
| Stripe | one Product ("HOA Hub"), two per-door Prices: `hoa_per_door_monthly` (499¢), `hoa_per_door_annual` (5388¢); checkout `quantity = billableDoors(doors)` |
| Decided but not built | BL-068 modules: Core $0.60/door ($39 min), Accounting $0.40 ($20), AI $0.50 ($25), Mailbox / Vendors / Leases $0.10 ($5) each |

At 50 doors we bill **$249.50/mo**. PayHOA bills **$65** monthly (or $59 on annual) for the same HOA: **3.8×** (4.2× against annual). At 25 doors it is $204.59 vs $54: **3.8×**.

## 2. Competitor prices (fetched 2026-10-20)

"Quote" = no public price. Monthly prices, monthly billing unless noted.

| Product | Segment | Model | 25 doors | 50 | 100 | 150 | 300 | 400 | AI | Source |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| **PayHOA** | self-managed (leader) | flat bands; ~9% off annual | $54 | $65 | $109 | $142 | $219 | $252 | none listed on pricing page (Jan 2026 AI announced, not shipped per prior research) | [payhoa.com/pricing](https://www.payhoa.com/pricing) |
| **HOA Express** | self-managed, website-first | free ≤50 households; Inform $15 / Engage $21 (≤25 households, billed yearly) | $0–21 | $0 (free tier) | n/p | n/p | n/p | n/p | none | [hoa-express.com/pricing](https://www.hoa-express.com/pricing) |
| **HOA Start** | self-managed | size-based, quote only now; third parties say "from $39" flat | ~$39 | quote | quote | quote | quote | quote | none listed | [hoastart.com/pricing](https://www.hoastart.com/pricing), [softwaresuggest](https://www.softwaresuggest.com/hoa-start/pricing) |
| **TownSq** | boards + mgmt cos | flat bands: Pro $90 / Advanced $145 (≤300 units); $180 / $290 (301–900); add-ons $10–99 per community; 10% off annual | $90 | $90 | $90 | $90 | $90 | $180 | "TownSq AI" (replies, inbox) | [townsq.io/pricing](https://townsq.io/pricing) |
| **GnomeOwner** | volunteer boards, AI-native | Free; $29 (≤25), $59 (≤100), $99 (≤250), $199 (≤1,000) | $29 | $59 | $59 | $99 | $199 | $199 | doc Q&A with citations, compliance calendar | [toolradar](https://toolradar.com/tools/gnomeowner) |
| **HomeHerald** | self-managed, AI-native | free ≤50 units; above 50 not published | $0 | $0 | n/p | n/p | n/p | n/p | CC&R chat, violation letters from photos, Dues Chaser, payment-matching agent | [Product Hunt](https://www.producthunt.com/products/homeherald) |
| **KindHOA** | self-managed | Free; Board Automation $29 flat | $29 | $29 | $29 | $29 | $29 | $29 | "24/7 Smart AI Assistant" | [Capterra](https://www.capterra.com/p/10040080/KindHOA/) (search snippet) |
| **AffordableHOA** | self-managed | 5 flat tiers, 50–1,000 units, $49–$293 | $49 | $49 | n/p | n/p | n/p | n/p | "Know It All" doc assistant | [Capterra](https://www.capterra.com/p/10043205/AffordableHOA/) (search snippet; page 403'd) |
| **Smartwebs** | mgmt cos + boards | per door, quote; "minimums and implementation fees apply". Third-party: $0.35/door ($100 min) mgmt, $0.45/door ($175 min) with accounting | $175 | $175 | $175 | $175 | $175 | $180 | — | [smartwebs.com/pricing](https://smartwebs.com/pricing/), [G2 via search](https://g2.com/products/smartwebs/pricing) |
| **Condo Control** | condos/HOAs | quote by size band (0–99, 100–199 …); AI Assistant is a paid add-on. Third-party "Standard ≈ $67/mo" (prior research) | quote | quote | quote | quote | quote | quote | paid add-on | [condocontrol.com/pricing](https://www.condocontrol.com/pricing/) |
| **Buildium** | mgmt cos (residential) | Essential from $62, Growth $192, Premium $400; associations by phone quote | $62–192 | $62–192 | $62–192 | $192 | $192–400 | $400 | Lumina AI (some features separately priced) | [buildium.com/pricing](https://www.buildium.com/pricing/) |
| **AppFolio** | mgmt cos | community associations $0.80/unit (Core), $0.85 (Plus); 50-unit minimum + unpublished minimum spend (third-party: $280) | ≥$280 | ≥$280 | ≥$280 | ≥$280 | $280 | $320 | Realm-X | [usecarly (2026-09-01)](https://www.usecarly.com/blog/appfolio-pricing/), [appfolio.com/pricing](https://www.appfolio.com/pricing) |
| **Vantaca** | large mgmt cos | quote only; Capterra lists "per user" | quote | quote | quote | quote | quote | quote | Vantaca AI | [Capterra](https://capterra.com/p/230892/Vantaca/), [ManageCasa comparison](https://managecasa.com/articles/managecasa-vs-vantaca-hoa-software-comparison) |
| **Enumerate** (ex-TOPS) | mgmt cos + self-managed | third-party: $0.75/door, **$375/mo minimum** (not re-fetched; from prior research 2026-10-15) | $375 | $375 | $375 | $375 | $375 | $375 | — | [softwareconnect](https://softwareconnect.com/reviews/enumerate-central/) |
| **HOALife** | boards, violations-heavy | $199/$299 flat, or $100 + $0.50/property (prior research, not re-fetched) | $199+ | $199+ | $199+ | $199+ | $199+ | $199+ | — | [itqlick](https://www.itqlick.com/hoalife/pricing) |
| **HOA Hub today** | — | $4.99/door, 41-door floor | **$204.59** | **$249.50** | **$499** | **$748.50** | **$1,497** | **$1,996** | full AI suite included | `packages/billing/src/pricing.ts` |

**Source confidence.** High: PayHOA, HOA Express, TownSq, Buildium (vendor pricing pages fetched 2026-10-20; PayHOA's 151–200 = $186 and 500+ = $0.55/unit with a $275 minimum are on its page). Medium: AppFolio association rate (third-party article reading the page's structured data). **Low:** GnomeOwner, HomeHerald, KindHOA, AffordableHOA, Smartwebs per-door figures, Condo Control, Enumerate, HOALife (listings, search snippets or prior research, not the vendor's own page). Vantaca, HOA Start, Condo Control and Smartwebs are quote-only on their own sites.

Payment fees sit on top almost everywhere (PayHOA: ACH $2.45, card 3.5% + $0.50). PayHOA also sells bookkeeping from $199/mo, which is the price signal for "real accounting" in this segment.

**What the table says:**

1. **The self-managed market clears at $0–65 for ≤50 doors and $90–250 at 300–400 doors.** Almost every self-managed tool prices in **flat bands**, not per door. The effective per-door rate falls with size: PayHOA is $2.16/door at 25, $1.30 at 50, $0.73 at 300, $0.63 at 400.
2. **Free is now a real competitor under 50 doors** (HOA Express, HomeHerald, GnomeOwner, KindHOA). These are thin products (websites, chat, dues), but they set the anchor.
3. **AI is either free-and-thin (GnomeOwner, KindHOA, HomeHerald) or a paid add-on at the incumbents (Condo Control, Buildium Lumina).** Nobody publishes a per-door AI price.
4. **Management-company tools converge at ~$0.80/door with $175–280 minimums** (AppFolio, Smartwebs). We don't sell that product yet (no portfolio view, no cross-association access).
5. **Annual discounts are ~9–10%.** Ours matches. **No self-managed tool advertises a 12-month lock-in**; HOA Start says "cancel anytime".

## 3. Unit economics — what one org costs us

### 3.1 AI cost from the model config

Models (`packages/ai/src/model.ts`): default `openai/gpt-oss-120b`, fast path `openai/gpt-oss-20b`, vision `qwen/qwen3.6-27b`. Groq list price for gpt-oss-120b: **$0.15 / 1M input, $0.075 cached input, $0.60 / 1M output** ([Groq model page](https://console.groq.com/docs/model/openai/gpt-oss-120b), fetched 2026-10-20). Everything below prices all text at 120b rates, which overstates the fast path. Vision: ~⅓¢ per photo request (W34 notes; not re-verified).

**Not measured.** `ai_runs` has `tokens_in`/`tokens_out`, but this branch has no database access. The owner can replace these estimates with the query in `docs/decisions/2026-10-pricing.md` §4.

**Typical month (estimate).** A busy 50-door board: ~200 inbox drafts, 150 document/law questions, 30 digests, 20 violation drafts with photos, 50 rewrites, plus resident assistant use. That's ≈5M input + 0.5M output tokens ≈ **$1.05**, plus ≈$0.10 vision → **$1–2/org/mo**. At 400 doors, activity (not doors) drives it: **$3–8/org/mo**. Per door: **$0.02–0.04/door/mo**.

**Ceiling case (from `ai-limits.ts`).** Per-org daily ceilings are the same for every org, whatever its size:

| Bucket | per-org/day | Assumed tokens per call (in / out) |
|---|---:|---|
| arc_precheck | 200 | 4k / 0.5k |
| ask_docs | 500 | 4k / 0.5k |
| help_ask | 500 | 4k / 0.5k |
| rewrite | 500 | 4k / 0.5k |
| follow_up_letter | 300 | 4k / 0.5k |
| inbox_autodraft | 300 | 4k / 0.5k |
| translate | 200 | 3k / 2k |
| resident_assistant | 600 | 12k / 1k (multi-step tool loop) |
| **Total** | **3,100 calls** | ≈17.0M in + 2.15M out per day |

That's ≈$2.55 + $1.29 ≈ **$3.84/day ≈ $115/org/mo** if every bucket is maxed every day for a month. Board-only routes (violation drafting, digests, parse/suggest) are unlimited on top. Nobody legitimate gets close: it's 124 AI calls per door per day at 25 doors. But it matters for pricing in one way: **the ceiling is flat while the price is per door**, so a 25-door HOA on a $25 AI minimum can, in the worst case, cost ~4.6× its AI revenue. The fix is cheap (scale `perOrg` limits with plan or doors, §5 implementation), not a price change.

### 3.2 Other variable cost per org

| Item | Per org / month | Basis |
|---|---:|---|
| Stripe card fee + Stripe Billing | 2.9% + $0.30, plus 0.7% Billing (Stripe Tax +0.5% if enabled); ACH 0.8% capped $5 | **$3.86** on a $99 bill |
| SMS (Twilio/Vonage path in `apps/hoa/src/lib/communications/send.ts`) | ~$0.011 per segment; a 279-char text is 2 segments, Spanish with accents (UCS-2) 4–5 | two blasts/mo to 400 doors ≈ **$18**; to 50 doors ≈ $2 |
| Mailed letters (planned, BL-032) | pass-through | not in the subscription |
| **Onboarding and support** | 3–6 h of setup per org today (roster import, dues, documents) | likely the **largest** cost per new org; at $49/mo it takes 3–6+ months to pay back |
| Plaid (bank feed) | ~$0.30–1.50 per connected account | estimate, prior doc |
| Resend email | pennies at board volume; resident blasts are the swing | estimate |
| Storage, embeddings | rounding error at this size (ADR-003) | — |
| Supabase / Vercel | fixed, not per org | — |

**Conclusion:** realistic variable cost is **≈$5–10/org/mo** under 150 doors and **≈$25–35** at 400 (Stripe fees and SMS included), before onboarding labour. Every scenario below clears ~85% gross margin at every size on *realistic* use; margin isn't the constraint. Positioning, simplicity, the flat AI ceiling (§3.1), the SMS swing and onboarding time are.

### 3.3 BL-068 module prices against cost

| Module | Price | Realistic cost it covers | Read |
|---|---|---|---|
| AI $0.50/door, $25 min | $25 at 50 doors | $1–2 | 12–25× cost. Priced on value, not cost. Fine, but it's the module whose ceiling must scale (§3.1). |
| Accounting $0.40, $20 min | $20 at 50 doors | Plaid ~$1 | Below PayHOA's $199 bookkeeping-service anchor by 10×. Underpriced if anything. |
| Mailbox / Vendors / Leases $0.10, $5 min | $5 each | ~$0 | Too small to be worth a line item; each is a decision for a volunteer board to make for $5. |

## 4. Scenarios

Revenue per month at six sizes, monthly cadence. "Everything" = all modules on.

### Scenario 1 — BL-068 as decided (six modules, per door with minimums)

| Doors | Core only | Core + Accounting | + AI | Everything | PayHOA | Ratio (Everything / PayHOA) |
|---:|---:|---:|---:|---:|---:|---:|
| 25 | $39 | $59 | $84 | $99 | $54 | 1.8× |
| 50 | $39 | $59 | $84 | $99 | $65 | 1.5× |
| 100 | $60 | $100 | $150 | $180 | $109 | 1.7× |
| 150 | $90 | $150 | $225 | $270 | $142 | 1.9× |
| 300 | $180 | $300 | $450 | $540 | $219 | 2.5× |
| 400 | $240 | $400 | $600 | $720 | $252 | 2.9× |

- **For:** already decided and documented; the price follows the module switches BL-068 builds; Core at $39 beats PayHOA under 50 doors.
- **Against:** six prices and six minimums is a pricing page volunteer boards have to model in a spreadsheet; the best-reviewed tools publish 3–5 flat bands (competitors §4c.1). **Linear per-door pricing diverges from a market that discounts with size**: by 300–400 doors "everything" is 2.5–2.9× PayHOA and above AppFolio's management-company rate ($0.80/door). Six Stripe subscription items per org means six proration lines on every change.

### Scenario 2 — Two plans, flat size bands (chosen; revised after the advisor review in §6)

Two plans built on the BL-068 module switches. Entitlement stays modular; the *price* is a bundle.
- **Essentials:** Core (portal, communications, documents and cited state-law Q&A, violations, ARC, meetings, tickets, events), dues with a simple ledger (`Dues & online payments` with Accounting off), and **the AI assistant at Essentials limits** (violation and inbox drafts, doc Q&A, resident assistant). AI is the pitch and the cheapest thing we serve, so the entry plan carries it.
- **Complete:** Essentials plus Accounting (GL, bank rec and Plaid, AP and bill scan, budgets, reports, collections), Mailbox, Vendors & RFPs, Leases, and **full AI limits**.

| Doors (band) | Essentials /mo | Complete /mo | PayHOA (same band) | Complete / PayHOA |
|---|---:|---:|---:|---:|
| 1–50 | **$49** | **$99** | $54–65 | 1.5–1.8× |
| 51–100 | $79 | $149 | $109 | 1.4× |
| 101–200 | $119 | $229 | $142–186 | 1.2–1.6× |
| 201–400 | $179 | $349 | $219–252 | 1.4–1.6× |
| 401+ | $0.45/door | $9 + $0.85/door | $0.55/door ($275 min) | ~1.5× |

The 401+ formulas keep the price rising with doors: Essentials 401 doors = $180.45 (> $179); Complete 401 doors = $349.85 (> $349). A plain $0.85/door would have made 401 doors ($340.85) cheaper than 400 ($349), which the advisor caught.

**Annual = 10 × monthly (2 months free, ≈17% off)**: Essentials $490 / $790 / $1,190 / $1,790; Complete $990 / $1,490 / $2,290 / $3,490; 401+ at $4.50/door/yr (Essentials) and $90 + $8.50/door/yr (Complete). HOAs budget annually; the bigger annual discount replaces the 12-month lock-in as the retention lever. Monthly is month-to-month. **30-day free trial** on Essentials limits.

At the six sizes: Essentials $49 / $49 / $79 / $119 / $179 / $179; Complete $99 / $99 / $149 / $229 / $349 / $349.

- **For:** one choice for a board plus a number read off a table; Essentials undercuts PayHOA at every size while adding AI drafting and cited law Q&A PayHOA lacks; Complete stays within ~1.5× PayHOA everywhere, which is the gap "real accounting + AI" has to justify (PayHOA's own bookkeeping service starts at $199/mo). At 400 doors Complete ($349) sits between Buildium Growth and Premium and near AppFolio's ~$320. In Stripe it is one Price per plan per cadence (`billing_scheme: tiered`, `tiers_mode: volume`, `flat_amount` per band, `unit_amount` only on 401+), `quantity = doors`, so the `ceil` floor bug goes away.
- **Against:** replaces the decided BL-068 price table (the owner delegated this; the decision record says so); no à-la-carte "Core + Accounting without AI"; band edges create cliffs (51 doors pays $30–50 more than 50, the same as PayHOA's), which makes the door count something a customer could under-report — so the quantity must come from our own count (decision record §4).

### Scenario 3 — One simple per-door price, everything included

$1.99/door/mo, **$79 true minimum** (a separate floor, not `ceil`), annual 10% off, month-to-month.

| Doors | Price | PayHOA | Ratio |
|---:|---:|---:|---:|
| 25 | $79 | $54 | 1.5× |
| 50 | $99.50 | $65 | 1.5× |
| 100 | $199 | $109 | 1.8× |
| 150 | $298.50 | $142 | 2.1× |
| 300 | $597 | $219 | 2.7× |
| 400 | $796 | $252 | 3.2× |

- **For:** smallest code change (two constants, two new Stripe Prices, a real floor); one sentence on the pricing page.
- **Against:** same linear-scaling problem as Scenario 1, worse at the top; no low entry price against the free and $29 tools; doesn't use the BL-068 module work at all.

### Side by side (monthly, all features on; S2 Essentials shown for the entry price)

| Doors | Today | S1 Everything | S2 Complete | S2 Essentials | S3 | PayHOA |
|---:|---:|---:|---:|---:|---:|---:|
| 25 | $204.59 | $99 | $99 | $49 | $79 | $54 |
| 50 | $249.50 | $99 | $99 | $49 | $99.50 | $65 |
| 100 | $499 | $180 | $149 | $79 | $199 | $109 |
| 150 | $748.50 | $270 | $229 | $119 | $298.50 | $142 |
| 300 | $1,497 | $540 | $349 | $179 | $597 | $219 |
| 400 | $1,996 | $720 | $349 | $179 | $796 | $252 |

Margin check, S2 Complete on realistic use: $99 at 25 doors vs ≈$8–10 variable cost → ~90%; $349 at 400 doors vs ≈$25–35 (SMS-heavy) → ~90%. Worst-case AI is held to ≤30% of each band's price by the per-band ceilings in the decision record, so even a maxed-out org stays above ~55% gross margin before onboarding labour.

## 5. Implementation sketch (detail in the backlog entry)

See `docs/backlog.md` BL-104. In short: `pricing.ts` gets band tables per plan; `setup-stripe-pricing` creates four tiered Prices with new lookup keys and leaves the old two active for grandfathered subscriptions; checkout picks plan × cadence; webhook writes the plan; module entitlement comes from BL-068's switches; `ai-limits.ts` per-org ceilings scale with plan/band; marketing `hoa-pricing.ts` and its test pins change in the same PR as checkout.

## 6. Adversarial review (advisor, Opus) and what changed

Verdict: **accept Scenario 2 with changes.** Scenarios 1 and 3 rejected for linear scaling against a banded market. The issues, most severe first, and what this doc and the decision record did with them:

| # | Advisor finding | Disposition |
|---|---|---|
| 1 | Complete at 401 doors ($0.85 × 401 = $340.85) was cheaper than at 400 ($349) | **Fixed:** 401+ Complete = $9 + $0.85/door; a test asserts price never falls as doors rise (1–2,000) |
| 2 | Flat per-org AI ceilings (~$115/mo worst case) exceed band prices; board-only AI routes are unlimited | **Fixed:** per-band AI ceilings set so worst-case AI ≤ 30% of the band price, plus a board-only daily cap (decision record §3) |
| 3 | "Keep price until renewal" protects nobody on a monthly plan and keeps them on a *higher* price | **Kept the owner's rule, defined it:** "renewal" = end of the current 12-month commitment or annual term; a customer may ask to move to the new, lower price earlier and we honour it. Check Stripe for live subscriptions first (decision record §5) |
| 4 | Bands reward under-reporting doors; nothing says who sets the count | **Fixed:** quantity = server-side unit count, never a form field; portal quantity editing off; band changes at renewal with no proration |
| 5 | Essentials had no AI, yet the pitch is AI and AI is cheapest to serve | **Fixed:** Essentials includes AI at lower limits; Complete differs by Accounting, Mailbox, Vendors, Leases and full limits |
| 6 | Cost model missed SMS, Stripe Billing 0.7%, mailed letters, onboarding labour | **Fixed** in §3.2; SMS becomes a per-band allowance |
| 7 | Dropping the lock-in with no counterweight lets a board onboard, run dues and leave | **Fixed:** annual = 2 months free; 30-day trial; first 25 paying orgs locked 24 months |
| 8 | Overriding a "decided" price table in four places | **Fixed:** decision record supersedes BL-068's table, BL-041, scenario A and the marketing-truth "coming soon" table by name, under the 2026-10-19 delegation; investor deck flagged |
| — | Scenario 1 totals overstated at 100/150 doors | **Fixed** ($180, $270) |
| — | PayHOA $186 and $0.55/door "derived" | **Not changed:** both are on PayHOA's own page (fetched 2026-10-20) |
| — | Low-confidence sources; Enumerate and HOALife dropped | **Fixed:** confidence note added; both restored |
| — | No AI usage measured | **Kept as a revisit trigger:** run the `ai_runs` query after 10 paying orgs or 90 days |

Alternatives the advisor considered and rejected: a free tier (support load, no proof of demand; the trial does the job), a 1–25 band (complexity), AI as an Essentials add-on (fallback only if the owner wants AI out of Essentials: flat $20 for 1–100 doors, $40 above).
