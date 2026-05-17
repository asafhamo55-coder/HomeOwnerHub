# HomeownerHub Product Strategy — Chief Product Officer Brief
**Date:** May 6, 2026  
**Author:** Chief Product Officer (9-agent synthesis)  
**Status:** Operative for Month 1 build start

---

## 1. Feature Prioritization Framework

**Constraint:** ~1 founder + AI, 4 months to 10 paying HOA customers. Three products shipping in parallel.

### Scoring Criteria (weighted)

Each candidate feature is scored 0–10 on:

1. **GTM Velocity (40%)** — Does it directly unblock a board-meeting demo? Does it close a deal?
   - Covenant Brain (8/10): Madison Park demo shows immediately.
   - Reserve Live (5/10): Nice-to-have; doesn't close in month 1.
   - Tenant Risk Score (2/10): PM module hasn't launched; wrong sequence.

2. **Pillar Dependencies (30%)** — How many critical shared systems must be built first?
   - DIC (Document Intelligence Core) unblocks 13/17 workflows. Build it once; all downstream workflows accelerate.
   - Violation Drafter needs DIC + CE (Communications Engine) + legal review infrastructure. Cost: 3 systems.

3. **Revenue Impact (20%)** — Per-door pricing means per-door workflows win faster than per-case.
   - HOA Hub per-door ($0.40–0.80/door/mo) scales linearly with customer size.
   - Eviction Hub per-case ($99–249) has binary ROI (file or don't); doesn't compound.

4. **Risk Reduction (10%)** — Does it reduce a load-bearing risk?
   - Onboarding Agent (Bar C): eliminates R7 (document quality variance).
   - Covenant Brain (Bar C): eliminates hallucination fear on core use case; de-risks product positioning.

### Application: Month-by-Month Scoring

**Month 1 Focus:** Pillars + foundational workflows that unlock GTM

| Workflow | GTM | Pillars | Revenue | Risk | **Composite** | Month |
|----------|-----|---------|---------|------|-------------|-------|
| Onboarding Agent | 9 | High | 0 | 10 | **7.7** | M1 |
| Covenant Brain | 9 | High | 7 | 10 | **8.4** | M1 |
| Multilingual Comms | 7 | Medium | 4 | 6 | **5.9** | M2 |
| Violation Drafter | 8 | High | 8 | 8 | **8.0** | M2 |
| Conversational Portal | 6 | High | 7 | 5 | **6.3** | M2 |
| Minutes Engine | 5 | High | 6 | 4 | **5.2** | M3 |
| Lease Q&A | 4 | Medium | 5 | 3 | **4.3** | M3 |
| Tenant Risk (Bar A) | 2 | Medium | 4 | 2 | **2.8** | M4 |
| Predictive Maintenance | 3 | Medium | 5 | 1 | **3.5** | M3 |

**Rule:** If composite score < 5.0, defer to v1.5 or v2. The founder has limited context-switching bandwidth.

---

## 2. Month-by-Month Product Roadmap (Months 1–12)

### **MONTH 1: Pillars + Madison Park Demo Ready**

**Goal:** "Can we run Covenant Brain on real data and survive?"

**Shipping:**
- Pillar DIC v1 complete: PDF → chunks → embeddings → retrieval pipeline live
- Pillar IL v1: vLLM running Qwen 2.5 14B, logging all calls to AIEventLog
- Pillar CE skeleton: email channel, human review gate
- Workflow #1 (Onboarding Agent, Bar C): ingests Madison Park's entire doc set; outputs structured "here's your HOA" summary
- Workflow #2 (Covenant Brain, Bar C): Madison Park CC&Rs queryable with citations
- **Madison Park demo ready:** board can ask "Can we fine a resident for late lawn care?" → AI answers with bylaw cite

**Metrics to track:**
- DIC extraction accuracy: >85% on known-good PDFs (vs. 60% baseline)
- Covenant Brain hallucination rate: <1% false citations per 50 queries
- Onboarding time: <20 min from upload to "ready to query"

**Not shipping:** PM module, eviction, any Bar B workflows

---

### **MONTH 2: HOA Core Workflows + First Production Customer**

**Goal:** Second HOA in pilot; Madison Park moved from demo to daily-use.

**Shipping:**
- Workflow #3 (Violation Drafter, Bar B): full human review gate in CE
- Workflow #4 (ARC Recommender, Bar B): architectural review letter generation
- Workflow #5 (Multilingual Comms, Bar C): outbound email/SMS translation
- Workflow #6 (Conversational Resident Portal, Bar C): self-serve FAQ chat for residents
- Pillar AIR v1: event bus routing, ActionItems flowing between workflows
- Legal review process documented: Violation Drafter requires lawyer sign-off before customer output
- **UI:** Daily Digest Dashboard (displays 3–5 priority items in plain English)

**Customers:** Madison Park + 1 warm pilot (second board, 6-mo free)

**Metrics:**
- Violation Drafter accuracy: >95% compliance with Georgia HOA code (legal review after, not instead of)
- Portal adoption: >60% of residents using Q&A in first 30 days
- Demo-to-pilot conversion: 40% (hit target)

---

### **MONTH 3: PM Module Launch + Financial Workflows**

**Goal:** Landlord self-serve free tier live; HOA financial workflows unlock.

**Shipping:**
- PM module data model: properties, tenants, leases, rent tracking
- Workflow #7 (Minutes Engine, Bar B): meeting audio → transcribed → draft minutes with decisions
- Workflow #8 (Lease Q&A, Bar C): "What does section 4.2 say about pet deposits?" via Porter
- Workflow #9 (Vendor Oracle, Bar B): vendor contact recommendations based on past spend
- Workflow #11 (Reserve Live, Bar B): fund balance projections, real-time trending
- Workflow #12 (Budget Anomaly Detection, Bar B): flags spend >10% over budget YTD
- PM Free tier: 1 property, basic rent tracking, no AI
- **Compliance Heat Map calendar:** visual 12-month timeline of deadlines (state/county specific)

**Customers:** 3–5 paying HOAs, 50+ free PM signups

**Metrics:**
- Reserve Live accuracy: within 5% of manual spreadsheet calculations
- Minutes Engine time saved: >90 min per meeting (vs. 3 hours manual)
- PM free-to-paid conversion intent: 25%+ saying "yes, would pay"

---

### **MONTH 4: Eviction Launch + Launch Blitz**

**Goal:** Hit "10 paying HOAs" target; eviction subdomain open to waitlist.

**Shipping:**
- Workflow #10b (Delinquency Coach, Bar A): notice generation, timeline tracking (demo only)
- Workflow #13 (Board Copilot, Bar B): meeting prep agent summarizing recent actions/decisions
- Eviction subdomain: Bar A behind hard legal gate; GA attorney reviews every template
- PM Investor tier ($19/mo): 2–10 units, zero-touch rent collection
- Public Roadmap: auto-generated from workflow status flags
- **Sales blitz:** 4 board-meeting demos/week; target warm pipeline from month 2 pilots

**Customers:** 10 paying HOAs, 100+ PM free tier, 200+ eviction waitlist

**Metrics:**
- Pilot-to-paid conversion: >50%
- HOA customers: exactly 10
- Roadmap page views: >500/month (SEO signal)

---

### **MONTHS 5–6: Stabilization + Second Geography**

**Goal:** Prove PMF locally; expand to Charlotte/Raleigh (new geographies per constraint §2).

**Shipping:**
- Workflow #10 full (Delinquency Coach, Bar B): day 5–30 escalation with human gate
- Workflow #14 (Support Agent, Bar C): Tier-1 internal support via Covenant Brain + docs
- Workflow #15 (Predictive Maintenance, Bar B): roofing/HVAC/parking lot component failure forecasting
- PM Pro tier ($49/mo): 11–50 units, predictive maintenance
- Regional expansion: legal review templates for NC, RLS policies tested in prod
- Second named reference customer (non-Madison Park)

**Customers:** 15–20 paying HOAs, 500+ PM free, 1000+ eviction waitlist

**Metrics:**
- CAC (Customer Acquisition Cost): <$200 per HOA at $79/mo ASP
- LTV: >3 years (strong indicator of PMF)
- NPS: >40 (industry baseline)

---

### **MONTHS 7–9: Advanced AI + Engagement**

**Goal:** Move from "good" to "must-have." Unlock expansion revenue.

**Shipping:**
- Workflow #16 (AI Resident Responder, Bar C): triage inbound resident requests → FAQ or escalation
- Computer vision for reserve fund management: snap roof photo → AI estimates life remaining
- Dynamic pricing module: real-time construction cost updates by zip code
- PM white-label: management companies embed with branding
- Resident Portal v1: payments, violations, announcements (read-only)
- Monthly customer advisory board: 3–4 customers review roadmap

**Customers:** 30–40 paying HOAs, 2000+ PM free, 2000+ eviction waitlist

**Metrics:**
- Expansion revenue: 15%+ of existing customers upgrading tiers
- Resident Portal adoption: >50% of residents logging in
- Reserve fund features: 30%+ of customers using

---

### **MONTHS 10–12: Scale + v2 Roadmap Foundation**

**Goal:** Lock in PMF signals; lay groundwork for next phase (month 12+).

**Shipping:**
- Board Member Training Library: state-specific governance/finance modules
- Community Benchmarking (anonymous): "Boards your size spend X% on reserves"
- Violation Drafter v2: handles architectural violations, landscaping violations, parking violations (state-specific)
- Reserve Study automation complete: one-click study generation (3 hours vs. 8 weeks)
- All 17 workflows at declared Bar (A/B/C) with public labels
- Eviction Bar B gate opened in Harris County, TX (if legal review clears)

**Customers:** 50–80 paying HOAs (goal was 10; if tracking above means expansion is working), 5000+ PM free, 3000+ eviction waitlist

**Metrics:**
- Gross margin: 75%+ (on track for $2,150/mo self-hosted cost at this scale)
- Retention: 85%+ annual (PMF indicator)
- ARPU: $95–140/mo (expansion revenue working)

---

## 3. Bar A/B/C Quality Framework — Detailed

### Definition Recap

| Bar | Output readiness | Customer-facing? | Legal use? | Human gate? | Sign-off |
|-----|------------------|------------------|-----------|-----------|----------|
| **C** | Production. Tested on live data. <1% error. | Yes, immediately | Yes | No gate for low-stakes | Product Lead sign-off (founder) |
| **B** | Functional, >90% accuracy. Human review required. | Yes, after review | Requires human validation | Yes, mandatory | Product Lead + domain expert (lawyer for legal) |
| **A** | Demo only. Curated test data. <80% accuracy OK. | Only in sandbox/watermarked | No, never | N/A (demo context) | Product Lead + lawyer (for legal-adjacent workflows) |

### Movement Criteria: A → B

**Necessary conditions (all required):**
1. 50+ eval cases run (not random; representative of actual customer data)
2. Accuracy >90% on blind test set (human reviewed independently)
3. Citations/audit trail complete (every output traceable to source)
4. Human review gate implemented and tested (CE pillar, ~5 min to review)
5. Legal review (if applicable) green-lit in writing

**Sign-off process:**
- Product Lead writes brief: "X workflow ready for Bar B. Evals show Y% accuracy. Human gate deployed and tested with Z customers."
- Applicable domain expert (lawyer, accountant, etc.) reviews and signs in writing.
- Founder approves final move.
- AIEventLog records Bar move with approval chain.

**Timeline:** Expect 3–4 weeks from Bar A to Bar B (evals take time; legal review takes longer).

### Movement Criteria: B → C

**Necessary conditions:**
1. 100+ eval cases. Accuracy >95%.
2. Human review gate *tested in production with real data* and feedback loop closed (insights from reviews feed back to model prompting).
3. Zero critical safety issues in 30 days of real-world use.
4. Legal clearance (if applicable) with contingency clause: "If accuracy drops below X%, revert to Bar B."
5. Workflow is stable (no model retraining in last 14 days; model weights pinned).

**Sign-off:** Same as A → B, but founder can solo sign-off without external expert for non-legal workflows (e.g., Covenant Brain can move to Bar C with only founder sign-off; Violation Drafter requires lawyer approval).

**Production safeguards (all Bar C workflows required):**
- AIEventLog enabled and auditable
- Citation requirement (customer can see why AI said X)
- Fallback: if inference fails, output "Unable to generate at this time. Please contact support." Never hallucinate.
- Rate limit: 10 concurrent requests per customer (prevent token exhaustion)

### Example: Violation Drafter Path

- **Week 2 (Month 1):** Violation Drafter at Bar A. Watermarked "Demo — do not file." Runs on Madison Park test notices.
- **Week 1 (Month 2):** Accuracy evals done. GA attorney reviews 10 samples. Suggests template refinements. Bar B green-lit.
- **Week 3 (Month 2):** Deployed to pilot customer #2 with human review gate. Every notice is reviewed by board treasurer before going out.
- **Week 1 (Month 3):** 100+ eval cases done; 96% accuracy. GA attorney confirms templates are compliant. Founder approves Bar C move.
- **Week 2 (Month 3):** Bar C live. Human review gate is *optional*, but 70% of customers still use it (safety culture).

---

## 4. Product Metrics for Each Hub

### HOA Hub — The Three Metrics That Predict Retention

1. **Workflow Daily Active Percentage (WDAP)**
   - Definition: % of HOA customers who interacted with at least one AI workflow in the last 7 days.
   - Target: 65%+ (Madison Park is 100%; second customer should hit 50%+ by week 4)
   - Why: If a customer uses the product, they renew. If they don't use it within the first month, churn is >60%.
   - Measurement: Query AIEventLog for workflow interactions, grouped by tenant_id.

2. **Expansion Revenue per Customer (ERC)**
   - Definition: (Revenue from tiers 2+ - baseline tier revenue) / customer count
   - Target: $30+/customer/month by month 6 (on top of per-door pricing)
   - Why: Indicates customers are unlocking advanced AI; correlates with NPS and retention.
   - Measurement: revenue per customer by tier, month-over-month.

3. **Time-to-Next-Decision Cycle (TDC)**
   - Definition: Avg. days from HOA board meeting to next decision documented in system (via Minutes Engine or Board Copilot).
   - Target: <7 days by month 6 (baseline: 30+ days in spreadsheets)
   - Why: Shorter cycles = higher engagement = product is integrated into workflow = stickiness.
   - Measurement: Meeting date timestamp, next decision log timestamp, diff.

**Why these three:** WDAP is a proxy for habit formation. ERC is a proxy for perceived value. TDC is a proxy for workflow integration. All three are early-stage predictors of month-6+ retention, not vanity metrics.

---

### PM Hub — The Three Metrics That Predict Expansion

1. **Free-to-Paid Conversion (FPC)**
   - Definition: % of free tier customers who pay for PM Investor or Pro tier within 90 days.
   - Target: 8%+ (baseline PLG is 2–5%)
   - Why: Indicates product-market fit in self-serve landlord motion. High FPC means organic growth.
   - Measurement: Trial account → paid account, 90-day cohort.

2. **Rent Collection Coverage (RCC)**
   - Definition: % of rent payments processed through the platform vs. outside it (Venmo, check, etc.).
   - Target: 40%+ by month 6 (baseline: 5–10% for new products)
   - Why: Zero-touch rent collection is the #1 feature. If it's not being used, the product has the wrong value prop.
   - Measurement: Query Financials table; sum payments_collected_via_platform / total_rent.

3. **Tenant Lifecycle Retention (TLR)**
   - Definition: % of tenants retained at lease renewal by customers who are PM Investor+ users.
   - Target: 65%+ (baseline: 50%)
   - Why: Indicates product is reducing landlord friction, tenants like the resident portal, reducing turnover.
   - Measurement: Lease renewal table; flag renewals where customer used PM platform in prior term.

---

### Eviction Hub — The Three Metrics That Predict Legal Defensibility + PMF

1. **Bar Compliance Rate (BCR)**
   - Definition: % of Bar B/C workflow outputs that are legally compliant on external attorney review (per 50-case sample).
   - Target: 98%+ (regulatory baseline)
   - Why: One bad filing tanks the product. This is the leading indicator.
   - Measurement: GA attorney reviews 50 cases/quarter at random. Notes compliance issues. Monthly reporting.

2. **Case-to-Filing Conversion (CFC)**
   - Definition: % of customers who start a case in the system that go through to actual filing.
   - Target: 70%+ (baseline: many don't finish; our job is to make it frictionless)
   - Why: Indicates the system is removing friction from the eviction process. Low CFC = template/UX problem.
   - Measurement: ActionItems table; count started vs. filed per customer.

3. **Waitlist-to-Pilot Conversion (WPC)**
   - Definition: % of eviction hub waitlist who enter a pilot once opened (Harris TX in month 4).
   - Target: 40%+ (strong PMF signal)
   - Why: Shows demand is real, not hypothetical. Feeds into product confidence.
   - Measurement: Waitlist email → accept pilot → active account within 14 days.

---

## 5. Feedback Loop Design — Madison Park Monthly Call

### Structure (60 minutes, 2nd Tuesday each month, 7 PM ET)

**Attendees:** Madison Park board president + treasurer (essential); founder (lead); optionally product + one engineer.

**Agenda (scripted):**

1. **Metrics deep-dive (10 min)** — Data-first, not opinion-first.
   - "You queried Covenant Brain 47 times this month. Top 3 questions: [show themes]."
   - "You used Minutes Engine 2x. Each saved you ~2 hours. That's 4 hours/month."
   - "Violation Drafter: you drafted 3 notices, all approved by board first time. Accuracy: perfect."
   - Share month-over-month trend graphs.

2. **What's working (15 min)** — Praise and specific follow-ups.
   - "Multilingual Comms: you sent notices in Spanish to 8 residents. How are they responding?"
   - "Conversational Portal: residents asked 12 FAQs; none escalated. Are we covering the right questions?"
   - Listen actively. Take notes. Record verbatim quotes for case study.

3. **What's not (15 min)** — Failure modes and friction.
   - "We heard Board Copilot isn't being used. What would make it useful?"
   - "Onboarding was 22 minutes, target was 15. Where did it drag?"
   - Ask: "If you could wave a wand and fix one thing, what would it be?"

4. **Roadmap co-design (15 min)** — Externalize the roadmap decision.
   - "Next month we're shipping Reserve Live. Does that matter to you?"
   - "PM module is coming in month 3. Would you use it for your rental properties?" (Asaf's angle; softly ask if they have rental income.)
   - "We're designing a Resident Portal. What should it do? Payments? Complaints? Approvals?"
   - Record their top 3 priorities.

5. **Ask for a reference (5 min)** — Soft close.
   - "Can we record a 2-minute video of you saying how this saves time?" (60-second clips, natural, not scripted.)
   - "If another HOA board calls, can we give them your number?" (Confirm 2x per month cap.)
   - "What should we tell other boards about their first 30 days?"

### Data Reviewed Before Call

- AIEventLog for Madison Park: count of each workflow invoked, timestamps, success rates.
- Support tickets (if any): categorize by feature. See trends.
- Feature flag state: which A/B variants are they in? Did we change their experience last month?
- Churn risk signals: any board members not logging in? Any unresolved issues?

### Post-Call Action Items

- Founder writes 1-page summary: key feedback, blockers, feature requests ranked.
- Product lead updates roadmap: does feedback change month prioritization?
- Engineer reviews verbatim quotes for UX insights.
- Founder schedules 1:1 calls with board members (optional, if they flag personal challenges: e.g., "Sarah might step down" — preempt churn).

---

## 6. Workflow Accuracy Standards & Eval Harness

### Accuracy Thresholds (by workflow, by Bar)

| Workflow | Bar A target | Bar B target | Bar C target | Eval method |
|----------|---|---|---|---|
| Covenant Brain | 75% cite accuracy | 95% | 98% | 50 queries, human review |
| Violation Drafter | 80% form completeness | 95% legal compliance | 98% | GA attorney reviews 50 cases |
| ARC Recommender | 70% form fill | 90% | 97% | Architect reviews; check against actual decisions |
| Minutes Engine | 60% decision capture | 90% | 95% | Board treasurer review; check against tape |
| Lease Q&A | 80% retrieval accuracy | 95% | 98% | 50 queries, contract lawyer spot-check |
| Tenant Risk Score | 70% risk ranking correlation | 90% | —* | Compare to actuals (paid/default history) |
| Reserve Live | 85% projection accuracy | 95% | 98% | Compare to CFP spreadsheets + actuals |

*Tenant Risk Score stays at Bar A in v1; too much liability at Bar B without 12+ months of historical data.

### Eval Harness Design

**Location:** `ops/evals/` in monorepo. Structured as pytest + custom runners.

```
evals/
├── covenant-brain/
│   ├── fixtures.jsonl           (50 Q&A pairs, annotated)
│   ├── eval.py                  (runner: invoke, check citations)
│   └── results-month3.json      (run output, timestamp, accuracy %)
├── violation-drafter/
│   ├── fixtures.jsonl           (50 violations, expected outputs)
│   ├── eval.py
│   ├── attorney-review.md       (attorney sign-off on compliance)
│   └── results-month3.json
└── suite.py                     (master runner, invoked in CI)
```

**Fixture creation (months 1–2, one-time work):**
- Pick 50 real Madison Park scenarios for each Bar B/C workflow
- Anonymize (strip names, dates, specific addresses; keep structure)
- Have human expert (attorney, accountant, board member) label ground truth
- Store in JSONL; version control

**Eval execution:**
- Run suite.py on every code change touching a workflow
- If accuracy drops >2 percentage points, CI fails
- Founder must retrain model or revert code before merging
- Monthly regression: re-run full eval suite (month 3, 6, 9, 12) with fresh attorney review

**Attorney review gate (for legal workflows):**
- Violation Drafter, ARC Recommender: GA attorney spot-checks 10 eval results/month
- Findings logged in attorney-review.md with signature/date
- If attorney flags issues, accuracy threshold is *lowered* (e.g., 95% → 92%) and mitigation tracked

---

## 7. Feature Flag Strategy — Safe Multiproduct Rollout

### Flag Architecture

All feature flags live in Supabase config table, checked at request time (not build time). Three dimensions:

1. **Module level:** `hoa_enabled`, `pm_enabled`, `eviction_enabled` (customer chooses which products)
2. **Workflow level:** `covenant_brain_enabled`, `violation_drafter_enabled`, etc. (ship with defaults)
3. **Experiment level:** `minutes_engine_v2_enabled` (A/B testing variants, small % of traffic)

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY,
  tenant_id UUID,                    -- org, not customer
  flag_name TEXT,                    -- "covenant_brain_enabled"
  is_enabled BOOLEAN,
  rollout_percentage INT,            -- 0-100; gradual rollout
  updated_at TIMESTAMP,
  reason TEXT                        -- "Bar A → B approved 2026-05-15"
);
```

### Rollout SOP (Month 1 → Month 4)

**Scenario 1: Bar A → B movement (Violation Drafter, month 2)**
1. Workflow deployed at Bar A: `violation_drafter_enabled = false` (only Madison Park has override)
2. Week 2 month 2: Evals complete. Attorney signs off. Founder approves.
3. Feature flag: `violation_drafter_enabled = true` for pilot customer #2 only (`tenant_id = [pilot2]`)
4. Week 3 month 2: Monitor error logs, human review gate latency. No issues.
5. Week 4 month 2: Expand to 50% of new signups (`rollout_percentage = 50`)
6. Week 1 month 3: 100% rollout. Flag now applies globally for all customers.

**Scenario 2: Emergency rollback (Covenant Brain hallucination spike, month 3)**
1. Monitor notices: false hallucinations above threshold (>2% instead of <1%)
2. Flag: `covenant_brain_enabled = false` globally (instant, no API restart needed)
3. Customers see: "Covenant Brain temporarily unavailable. Investigating. [Support link]"
4. Founder + engineer debug root cause
5. Flag flipped back to true once fixed + evals re-run
6. Incident logged in AIEventLog + postmortem recorded

**Scenario 3: Experiment (Minutes Engine v2, month 6)**
1. Two variants exist: Minutes Engine v1 (Bar B) and v2 (more detailed decision capture, Bar B)
2. Flag: `minutes_engine_v2_enabled = true` for 10% of new customers
3. Track: accuracy (same), user satisfaction (different?), time-to-review-minutes (faster or slower?)
4. Month 7: if v2 is better on metrics, flip to 100%. If worse, sunset v2 branch.

### Safety Rules (Non-negotiable)

- **Never flag a Bar A workflow globally** without founder + expert sign-off. Flag defaults to OFF; opt-in only.
- **Never flag a Bar C workflow OFF without incident documentation.** Exceptions require founder + legal review.
- **Experiment flags must have a sunset date.** No permanent A/B tests. Decide by X date or revert.
- **Feature flags are not a substitute for testing.** They're a rollout safety mechanism, not a testing crutch.

---

## 8. v2 Roadmap (Month 12+) — From Good to Dominant

### Five Features That Transform Each Hub

#### HOA Hub Dominance (Months 12–18)

1. **Reserve Study Full Automation** (Feature 1)
   - Computer vision on component photos (roof, parking lot, siding)
   - Dynamic pricing: daily scrape of labor/materials by zip code
   - One-click professional study export (competitor: $5k–8k, 8 weeks → us: $0, 3 hours)
   - Partnership: county permitting APIs to cross-check code changes (new roof installed? adjust reserve life automatically)
   - Target: 50% of customers using by month 18

2. **Compliance Automation Engine** (Feature 2)
   - Real-time monitoring of state/county HOA law changes
   - Auto-generates required disclosures (special assessment, reserve study, annual meeting notice)
   - Calendar pops: "Annual meeting notice must go out by June 15 in your state. Draft ready."
   - Partnership: LexisNexis or similar for law change feeds
   - Target: zero compliance violations for customers using this

3. **Resident Engagement Portal v2** (Feature 3)
   - Payments (full integration, stripe + ACH)
   - Violation tracking (photo upload, appeals process, auto-notify resident)
   - Request management (architectural, variance, waiver requests; approval workflow)
   - Community polls (governance decisions, spending, satisfaction surveys)
   - Target: 70%+ resident adoption (resident satisfaction = board retention)

4. **Board Member Succession Planning** (Feature 4)
   - AI identifies over-tasked board members (at-risk of burnout/resignation)
   - Suggests role rotations, training paths for filling gaps
   - Tracks institutional knowledge (which member knows what?)
   - Auto-documents decision history (liability protection)
   - Target: reduce board member churn by 30%

5. **Community Insights Benchmarking** (Feature 5)
   - Anonymous aggregate data: "Boards your size spend X% on reserves, Y% on landscaping"
   - Peer comparison: "Your reserve fund is at Z%; similar communities at 40–60%"
   - Regulatory benchmarks: compare your fine/violation rate to county average
   - Partnership: county court records for anonymized violation data
   - Target: Premium tier feature; 30% attach rate

---

#### PM Hub Dominance (Months 12–18)

1. **Full Rent Collection Automation** (Feature 1)
   - Zero-touch ACH + credit card payments (Stripe integration)
   - Auto-late fees (configurable: 5% after 5 days, per state law)
   - Tenant dunning sequences (email → SMS → escalation)
   - Accounting integration (QuickBooks, Xero auto-sync)
   - Target: 60%+ of collected rent via platform

2. **Predictive Maintenance at Scale** (Feature 2)
   - Computer vision: monthly snapshot of unit condition (AI-analyzed)
   - ML model: predicts HVAC/plumbing/appliance failures 30–60 days out
   - Integration with contractor network (dispatch approved vendors automatically)
   - Cost forecasting: "This HVAC likely needs replacement in 14 months; budget $2–3k"
   - Target: 40% reduction in emergency maintenance costs

3. **Tenant Risk Scoring (Bar B)** (Feature 3)
   - Upgrade from Bar A to Bar B: integrate past-rent history, credit checks, eviction records
   - Fair lending compliance baked in (audit trail, no discrimination)
   - Screening workflow: conversational tenant Q&A → risk score → landlord decision → audit log
   - Partnership: consumer credit bureaus, court eviction records
   - Target: 50% of PM paid customers using on new leases

4. **Lease Compliance Assistant** (Feature 4)
   - Auto-generate state-compliant leases (Texas, California, New York, Georgia templates)
   - Interactive lease builder: Q&A → custom lease
   - Lease renewal automation: notify tenant 60 days out, auto-generate renewal docs
   - Fair housing audit: flags potentially discriminatory language
   - Target: 70% of PM customers use for new leases

5. **Landlord Community Insights** (Feature 5)
   - Benchmarking: "Landlords in your zip code charge $X for 2BR, collect Y% of rent on time"
   - Market pricing: scrape MLS, Zillow, Craigslist for local comp rents
   - Eviction statistics: "Your county has Z% eviction rate; you're at Z%"
   - Peer lending groups (optional): "Join a network of 50 landlords for deals on contractors"
   - Target: investor tier ($49/mo) + premium tier ($99/mo with full community access)

---

#### Eviction Hub Dominance (Months 12–18)

1. **Multi-State Court Integration** (Feature 1)
   - Expand from Harris TX + San Bernardino CA + King County WA to all major eviction markets
   - Court API integrations: auto-file notices, track filing status, receive court updates
   - County-specific forms: every jurisdiction's notice template auto-generated (5-day vs. 3-day, etc.)
   - Service of process coordination: platform-native dispatch (vs. manual vendor hunting)
   - Target: 30+ counties by month 18

2. **Judgment Automation** (Feature 2)
   - Hearing prep kit auto-generated (evidence summary, exhibits, testimony outline)
   - Post-judgment: writ of execution auto-filed, garnishment templates, levy coordination
   - Collection automation: track post-judgment status, escalate if no pay
   - Partnership: judgment enforcement networks (we automate the follow-through)
   - Target: 80% of cases go through to judgment (vs. 50% today; our job is removing friction)

3. **Tenant Representation AI (Optional, Future Moat)** (Feature 3)
   - Two-sided marketplace: offer pro-bono tenant defense via AI
   - Violates platform neutrality? Discuss. But if we do it, it's a defensibility move against criticism.
   - Auto-generate tenant response to eviction notice (fair housing, statutory defenses)
   - Tenant settlement offers: AI suggests reasonable offers (avoid court cost)
   - Target: reduce contested evictions, improve outcomes for tenants (=less adversarial relationship)

4. **Eviction Outcome Analytics** (Feature 4)
   - Dashboard: your eviction outcomes vs. county, vs. similar landlords
   - Predictive: "This notice has 40% chance of going to hearing (county avg. 60%). You're efficient."
   - Cost analysis: "You could have settled for $X and saved $Y in court costs. Here's the data."
   - Partnership: county clerk records (de-identified) for benchmarking
   - Target: help landlords make faster, better decisions

5. **Eviction Prevention AI** (Feature 5)
   - Early warning: "Tenant is 15 days late; historical data shows 3% of cases reach eviction from here. Offer payment plan?"
   - Settlement recommendation engine: "Tenant owes $2k; settlement at $1.5k has 70% acceptance. Cost-benefit: do it."
   - Re-lease incentives: "Tenant wants to stay; offer $200 credit if paid current. Cheaper than evicting."
   - Target: reduce actual evictions 30% (better for society, better for landlord ROI, reduces court load)

---

## 9. Product-Market Fit Signals (When Do We Know?)

### HOA Hub PMF Signal (Month 2–4 decision point)

**You know PMF is real when:**

1. **At 10 paying customers, >60% use a workflow daily.** (Not just signed up; actively using.)
2. **Pilot-to-paid conversion is >50%.** (If it's <30%, the product has a closing problem, not a product problem.)
3. **NPS >50.** (Not >70, just >50 to start. HOA boards are not usually enthusiastic; 50 is *great*.)
4. **Monthly churn <5%.** (Baseline SaaS is 5–7%; you should be better because HOA boards are sticky once embedded.)
5. **Expansion revenue is >20% of baseline tier.** (Customers are upgrading to Advanced tier; showing perceived value.)
6. **Net Retention >110%.** (Churn is low + expansion is real = you're growing within existing customers.)
7. **Sales motion converges to repeatable unit economics:** Founder demos at $X cost/customer, converts Y%, closes at $79 ASP. If unit econ math works, you can hire an SDR and scale it.

**Red flags (if you see this, rethink the product):**
- Pilot-to-paid <30%
- NPS <40
- Customers sign up, use the product once, then ghost
- "It's great, but we're too busy to set it up" is the top reason for not converting

**Decision:** At month 6 (after month 4 launch), if you're hitting 3+ of the 7 signals above, you have PMF. If you're hitting <2, diagnose which pillar is failing:
- Product problem = UX friction, wrong features, wrong buyer
- Go-to-market problem = sales process broke, customer doesn't understand value
- Market problem = addressable market is smaller than you thought

---

### PM Hub PMF Signal (Month 3–5 decision point)

**You know PMF is real when:**

1. **Free-to-paid conversion >8% within 90 days.** (PLG baseline is 2–5%; yours should be better because the product addresses a real pain.)
2. **At 50+ free tier users, >100 aggregate units managed.** (Users are actually trying it; not just signing up.)
3. **Paid tier users: >40% are active (log in >1x per month).** (Engagement > sign-up.)
4. **NPS >50 (paid tier only).** (Not looking at free tier; paid tier users are the signal.)
5. **Monthly churn <8% (paid tier).** (Landlords are lazy; once you're in their workflow, you stick. >8% is a signal the product isn't sticky enough.)
6. **Rent collection coverage >30%.** (If landlords aren't using your actual rent collection feature, they're not using the core value prop.)
7. **Word-of-mouth referrals from paid customers.** (At least 20% of new paid tier signups say "a friend referred me" or "someone in my landlord group told me.")

**Red flags:**
- Free-to-paid <5%
- Paid churn >10%
- No usage of rent collection (feature is dead; UX problem)
- All growth is founder-driven demos (no word-of-mouth)

**Decision:** At month 4–5, if you're hitting 4+ signals, PM Hub has PMF. If <2, consider:
- Free tier is broken (wrong incentives, wrong features)
- Paid tier is broken (too expensive, not valuable enough)
- Market is broken (landlords not your buyer; property managers are)

---

### Eviction Hub PMF Signal (Month 4–6 decision point)

**This one is different because it's outcome-dependent, not engagement-dependent.**

**You know PMF is real when:**

1. **Waitlist-to-pilot conversion >40%.** (Demand is real, not hypothetical.)
2. **Bar compliance rate stays >97% on live data.** (You didn't ship a legal liability. Critical.)
3. **Case-to-filing conversion >70%.** (People are actually finishing the process. You removed friction.)
4. **Customer satisfaction >60/100 on "confidence in legal defensibility."** (This is your #1 selling point; it's working.)
5. **Lawyer/attorney referral channel brings >30% of new customers.** (Attorneys recommend you = they trust your legal accuracy.)
6. **Zero legal incidents (wrongful filing, improper notice, etc.) in first 500 cases.** (If you ship a legal mistake, it's not PMF; it's a recall.)
7. **Expansion from Harris TX → new counties happens via customer pull, not founder push.** (Customers ask: "Can you do California?" = you have a product people want to expand.)

**Red flags:**
- Bar compliance <95%
- Customer says "I'm worried about this notice being wrong" (you've lost trust)
- Case-to-filing <50% (friction is still high)
- Zero attorney referrals by month 4 (you're not trusted by the legal community yet)

**Decision:** At month 6, if you're hitting 5+ signals, Eviction Hub has PMF. If <3, consider:
- Product isn't trustworthy (compliance or legal issue)
- Market isn't ready (attorneys aren't recommending; customers not converting)
- You shipped too early (Bar A is too much of a warning label; invest in Bar B infrastructure first)

---

## Summary: The Single Constraint That Drives Everything

**You have ~1 founder + AI, 4 months to prove the wedge. Ruthless prioritization is non-negotiable.**

1. **Months 1–2:** Build to close. Covenant Brain + Violation Drafter get 70% of attention. Everything else is foundation.
2. **Months 3–4:** Expand. PM module and first Eviction shell. Less polish; more breadth.
3. **Month 5+:** Double down on PMF signals. If one product is winning, go deep. If all three are limping, kill two and go wide on the winner.

The roadmap above is aggressive but achievable *if* you don't redesign the product mid-flight. Constraints in §2 (founder-locked) are there to prevent thrashing. Stick to them.

**The one number that matters:** 10 paying HOAs by end of month 4. Everything else is derivative.

---

*This strategy synthesizes the 7-agent brief (PROJECT_FOUNDATION.md) with the CPO focus on ruthless prioritization, specific metrics, and repeatable processes. Update monthly; don't second-guess weekly.*
