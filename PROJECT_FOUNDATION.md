# Project foundation — Homeowner Portal SaaS

> Single source of truth for product, architecture, GTM. Generated from a 7-agent strategic working session on 2026-05-03.
>
> **Read this first.** Every decision below is the consensus output. Where briefs disagreed, the resolution is recorded. Where the founder overrode a brief's recommendation, that's annotated explicitly.

---

## 0. How to use this document

- **Claude Code:** read this in full at the start of every session. The decisions here are load-bearing — don't redesign architecture, scope, or GTM without explicit founder direction. Section 11 ("Open questions and explicit founder overrides") flags where caution is warranted.
- **Founder (Asaf):** re-read section 1 (the wedge) and section 12 (week 1 action list) before each Monday. The rest is reference.
- **Future hires:** sections 1, 2, 3, 5, 7 are the onboarding read. The rest is operational.

---

## 1. The wedge — one paragraph

We're building an AI-native operating system for residential property life — serving HOA boards, small landlords, and the legal process when tenancies break down — built on the insight that all three are the same buyer at different life stages, and nobody has unified them. The strategic wedge is identity-level consolidation, not feature parity. The competitive moat is a self-hosted open-source LLM stack that makes our marginal AI cost ~10× lower than competitors using frontier APIs, plus 17 vertical AI workflows that automate the work today's incumbents leave to volunteers.

**One-sentence positioning:** "The all-in-one OS for self-managed HOAs. AI does the paperwork."

**Brand promise (one word):** "Less."

---

## 2. The constraints (founder-locked, do not relitigate)

| Constraint | Decision | Tension flagged |
|---|---|---|
| Modules in v1 | HOA + Property Management + Eviction (3 parallel) + standalone eviction subdomain | Strategy/Product pushed for sequenced launch; founder overrode |
| LLM stack | 100% self-hosted open-source from day one (Qwen 2.5 14B + 7B fallback) | Strategy pushed for hybrid; founder overrode — non-negotiable |
| Geography | Atlanta-metro only for v1; Charlotte/Raleigh/Nashville/Tampa/Orlando at month 6+ | Locked |
| Lead design partner | Madison Park HOA (Johns Creek) | Locked — single point of failure, see risk §10 |
| Founder time | 40-50 hrs/week alongside NICE W-2 | Founder-stated, will be re-evaluated weekly |
| AI workflows in v1 | All 17 by month 4 | Product/Architecture pushed for v1=5, v1.5=+6, v2=+6; founder overrode and accepted timeline risk |
| Bar A/B/C honesty bars | Adopted publicly. v1 ships 6 production, 8 beta, 3 demo-only | Locked |
| Repo structure | Monorepo with module CODEOWNERS, feature flags, module-level CI | Locked (reconsidered from initial split-repo answer) |
| Native mobile | PWA only in v1; native deferred to v2 gated on usage data | Locked (reconsidered from initial native-required answer) |
| UI languages | English only at launch; LLM-translated content for residents | Locked |
| Public roadmap | Live from day one, auto-generated from workflows directory | Locked |
| Eviction legal review | Subdomain ships at Bar A behind hard legal-review gate. GA attorney retainer budgeted. | Architectural policy — non-overridable without lawyer + founder co-sign |
| Pricing posture | Premium-mid: $39-79/mo HOA, $19-49/mo PM, $99-199/case eviction | Locked |
| Brand name | Pending founder check. Document uses `[brand]` placeholder. | Open |

---

## 3. The 17 AI workflows

All 17 ship in v1 by month 4 at the bar specified. Bar definitions:

- **Bar C (Production):** works on real customer data, no human gate required for low-stakes outputs
- **Bar B (Beta):** works on real customer data, human review gate required before any customer-facing output
- **Bar A (Demo):** works on curated test data only, marketed as demo, not safe for production use

| # | Workflow | v1 Bar | Pillars used | Module(s) |
|---|---|---|---|---|
| 1 | Onboarding Agent | C | DIC, IL | All |
| 2 | Covenant Brain | C | DIC, IL | HOA |
| 3 | Violation Drafter | B | DIC, CE, IL | HOA |
| 4 | ARC Recommender | B | DIC, AIR, IL | HOA |
| 5 | Multilingual Comms | C | CE, IL | All |
| 6 | Conversational Resident Portal | C | DIC, CE, IL | HOA |
| 7 | Minutes Engine | B | DIC, CE, AIR, IL | HOA |
| 8 | Lease & Document Q&A | C | DIC, IL | PM |
| 9 | Vendor Oracle | B | DIC, AIR, IL | HOA, PM |
| 10 | Delinquency Coach (day 5–30) | B | DIC, CE, AIR, IL | PM |
| 10b | Delinquency Coach (court filing) | A | DIC, CE, AIR, IL | Eviction |
| 11 | Tenant Risk Score | A | DIC, IL | PM |
| 12 | Reserve Live | B | DIC, AIR, IL | HOA |
| 13 | Budget Anomaly Detection | B | DIC, AIR, IL | HOA, PM |
| 14 | Support Agent (tier-1) | C | DIC, CE, IL | All (internal) |
| 15 | Predictive Maintenance | B | AIR, IL | HOA, PM |
| 16 | Board Copilot | B | DIC, AIR, IL | HOA |
| 17 | List-building & outreach agent | — | IL | Build-side, not in product |

**Hard rule:** Bar A workflows render outputs with an explicit "Demo only — not for filing/use" label and watermark in the UI. Marketing copy mirrors this. Crossing from Bar A → B requires founder + (where applicable) lawyer sign-off recorded in the AIEventLog.

---

## 4. The four shared pillars

Every workflow rides on one or more of these. Build them once, ship them everywhere. Months 1-2 are pillar-heavy; months 3-4 are workflow-heavy.

### Pillar DIC — Document Intelligence Core
- Ingestion: PDF, DOCX, scanned image, audio
- Extraction: pdfplumber → unstructured.io → Tesseract OCR fallback
- Chunking: semantic, ~500 tokens, 50-token overlap
- Embedding: BGE-M3 (multilingual, ~1GB RAM, ~200ms/query)
- Retrieval: hybrid (vector + BM25) with BAAI/bge-reranker-v2-m3
- Powers workflows: 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 16

### Pillar CE — Communications Engine
- Channels: email (Resend), SMS (Vonage), in-app (Supabase Realtime), portal
- Translation gate: outbound auto-translates to recipient.language via Qwen
- Human review gate: workflow-configurable (required for B-bar outputs)
- Audit trail: every send logs original language, delivered language, AI-generated flag, reviewer ID
- Inbound: reply detection routes back to AIR

### Pillar AIR — Action Item Router
- Typed event bus over Postgres LISTEN/NOTIFY (no Kafka, no SQS at this scale)
- ActionItem schema: source, target_workflow, payload, status, due_at, audit_trail
- Workflows subscribe to event types they handle; cross-module routing is the connective tissue

### Pillar IL — Inference Layer
- vLLM serving Qwen 2.5 14B Instruct (4-bit, ~9GB VRAM) on a single A10G/L4 GPU
- llama.cpp running same model on CPU as fallback
- Single FastAPI surface: `/v1/complete` with workflow-keyed routing
- Every call logged to `AIEventLog` with prompt hash, model version, output, citations
- Workload-class routing: cheap (7B), standard (14B), heavy (14B + reranker)

---

## 5. Data model — the shape that matters

```
Organization (tenant root)
├── modules_enabled: [hoa, pm, eviction]
├── jurisdiction: { state, county }
├── settings (languages, branding, notification_prefs)
│
├── Properties              -- the atom; type: residence | common_area | rental_unit
├── People                  -- residents/owners/tenants/board/vendors, role-tagged
├── Documents               -- the corpus, vector-embedded, DIC reads here
├── ActionItems             -- AIR pillar
├── Communications          -- CE pillar
├── Financials              -- operating | reserve | trust accounts (separation enforced at DB layer)
└── AIEventLog              -- append-only, every AI action logged
```

**Three load-bearing decisions:**

1. **People-as-roles** — same human can be board member + resident + landlord + (eventually) vendor across modules with one identity. This is what makes the "owner-operator stack" wedge real.
2. **Operating/reserve fund separation enforced at the database layer** — not at the application layer. State HOA statutes (GA OCGA Title 44 et al.) require this; competitors like BoardStack are already winning deals on it.
3. **AIEventLog is non-negotiable** — every AI output logged with model version, prompt hash, citations, and human action taken. This is the legal defense story. Without it, no defensible product.

**Multi-tenancy:** Postgres Row-Level Security by `tenant_id`. RLS policies have a dedicated eval suite with the same CI gate as workflow evals.

---

## 6. Tech stack — every layer named

```
Apps
  Next.js 15 (App Router, RSC)
  apps/web (HOA + PM)   apps/eviction (subdomain)   apps/admin
  Hosted: Vercel

API & Edge
  Next.js Route Handlers + Server Actions
  Auth: Supabase Auth (email + magic link + Google)
  Rate limiting: Upstash Redis

Pillars (packages/)
  pillar-dic   pillar-ce   pillar-air   pillar-il
  TypeScript libs

Workflow runtime
  17 workflow files in packages/workflows/
  Long-running: Inngest

Data plane           Inference plane         Storage plane
Supabase Postgres    vLLM + FastAPI          Supabase Storage / R2
+ pgvector           Qwen 2.5 14B/7B
RLS by tenant        + llama.cpp CPU fallback
                     Hosted: RunPod A10G → L4
```

**Repo structure (monorepo, pnpm workspaces + Turborepo):**

```
homeowner-portal/
├── apps/
│   ├── web/                  Next.js — HOA + PM
│   ├── eviction-subdomain/   Same Next.js, different theme/routes
│   ├── admin/                Internal ops console
│   └── inference/            FastAPI in front of vLLM
├── packages/
│   ├── core-data/            Supabase schema, migrations, RLS
│   ├── pillar-dic/
│   ├── pillar-ce/
│   ├── pillar-air/
│   ├── pillar-il/
│   ├── module-hoa/
│   ├── module-pm/
│   ├── module-eviction/
│   └── workflows/            One file per AI workflow, all 17
├── ops/
│   ├── infra/                Docker Compose (local), Terraform (prod)
│   ├── evals/                Eval harness — required CI gate
│   └── runbooks/             How to debug each workflow in production
└── docs/
    ├── PROJECT_FOUNDATION.md  ← this file
    ├── public-roadmap/        Auto-generated from workflow status flags
    └── changelog/             Auto-generated from PR labels
```

**Module ownership model:** CODEOWNERS at the package level. Each module has its own CI pipeline triggered by changes to its files. Pillars are stable; modules are isolated above them. Feature-flag-gated deploys.

---

## 7. The four-month build plan

### Month 1 — pillars + foundation

**Week 1:** Repo scaffolding (pnpm workspaces, Turborepo, CI). Supabase project provisioned. RunPod A10G with vLLM + Qwen 2.5 14B. Basic auth flow. `.claude/` context populated. **End of week:** can log in, can hit `/v1/complete`, get a response.

**Week 2:** Pillar-DIC v1. Madison Park CC&R ingested, queryable via API, returns citations. Pillar-IL audit log working. RLS tested.

**Week 3:** Pillar-AIR + Pillar-CE skeletons. Workflow #2 (Covenant Brain). **End of week:** Madison Park CC&R queryable through web UI. Demo to board.

**Week 4 + buffer:** Workflow #1 (Onboarding Agent). Drop full Madison Park doc set, watch tenant configure. **End of month 1:** Madison Park is in the system with real data. **Note:** week 4 includes a 1-week buffer for pillar-DIC quality issues — if extraction quality is poor on real-world legal documents, this is when we'd catch it.

### Month 2 — HOA core

Workflows 3-8 ship: Violation Drafter, ARC Recommender, Multilingual Comms, Conversational Resident Portal, Minutes Engine, Lease Q&A. **End of month 2:** Madison Park using the product daily. Two friendly Atlanta HOAs in pilot.

### Month 3 — PM module + financial workflows

PM module data model. Workflows 9-13: Vendor Oracle, Delinquency Coach (Bar A & B halves), Tenant Risk Score (Bar A), Reserve Live, Budget Anomaly. Founder's own rentals as test case. **End of month 3:** 3-5 paying HOAs, PM module functional.

### Month 4 — eviction subdomain + remaining workflows + launch

Workflows 14-17. Eviction subdomain at Bar A behind legal-review gate (waitlist if attorney review pending). Roadmap page auto-generated. PM open to landlord self-serve signup with free tier. **End of month 4:** 10 paying HOAs, 50 free PM accounts, 100 eviction subdomain waitlist signups, $500-1,200 MRR.

---

## 8. The TCO math (defensible economic moat)

| Milestone | Customers | Self-hosted OSS cost/mo | Frontier API equivalent | Delta |
|---|---|---|---|---|
| Month 1 | 1 (Madison Park) | ~$285 | ~$180 | -$105 (we're more expensive at this scale) |
| Month 6 | ~50 | ~$685 | ~$4,200 | **+$3,515 saved** |
| Month 12 | ~200 | ~$2,150 | ~$18,500 | **+$16,350 saved** |

**Crossover:** ~month 3-4. Below that, frontier APIs win on cost; above that, OSS pulls away fast.

**Implication:** the OSS-self-hosted decision is economically wrong for the first 90 days and economically dominant from month 4 onward. Don't second-guess at month 2 when the GPU bill arrives.

---

## 9. GTM motion summary

### The buyer (Linda)
58, retired financial analyst, board treasurer, 180-home Cumming subdivision, currently spending 8-12 unpaid hrs/week on HOA paperwork. Will not click "Schedule a Demo" buttons. Trusts referrals and in-person.

### The four channels (ranked by traction-per-hour)

1. **Physical board-meeting demos** — 4 evenings/month, 10-min scripted pitch, ~30% demo→pilot conversion, ~50% pilot→paid. Founder time: 8-12 hrs/week. **Load-bearing.**
2. **Madison Park as named reference customer** — case study (PDF + 90-sec video), reference calls (capped 2/month), quarterly user group dinner. Founder time: 1-2 hrs/week.
3. **Owned content** — 1 blog/week on jurisdiction-specific HOA topics, AI-drafted, founder-edited. Distributed to local HOA Facebook groups and CAI Georgia. Compounds in 6-12 months. Founder time: 2-3 hrs/week.
4. **Landlord PLG** — free tier on PM, "compare to Innago" pages, lead-magnet checklists. Self-serve. Founder time: ~2 hrs/week setup, autonomous after.

**Channels explicitly not doing in v1:** paid search, LinkedIn, webinars, conferences (CAI national), press, podcast tours.

### The 10-minute board-meeting demo (the closing motion)

Pre-ingested CC&R, 3 pre-canned scenarios via URL parameter, printed one-pager handed to each board member. Script:
- 0:00–0:30 — specific compliment about their community
- 0:30–1:30 — frame the problem in their language (Madison Park anchor)
- 1:30–4:30 — show home screen with their data (the moment that closes 40%)
- 4:30–7:00 — one workflow demo, deep, mapped to their #1 pain
- 7:00–8:30 — anchor against their current alternative without bashing
- 8:30–9:30 — the ask: 6 months free pilot, board vote at next meeting
- 9:30–10:00 — hand the one-pager, leave reference contact, exit

**Pilot agreement:** single page, plain English, signed via Dropbox Sign or DocuSign. 6 months free, $79/mo after, no auto-conversion without explicit confirmation, customer owns data, monthly feedback call.

### Pricing
- **HOA Starter** $39/mo (≤50 doors)
- **HOA Standard** $79/mo (51-300 doors) ← Madison Park
- **HOA Plus** $149/mo (301-1000 doors)
- **PM Free** 1 property
- **PM Investor** $19/mo (2-10 units)
- **PM Pro** $49/mo (11-50 units)
- **Eviction** $99 transactional (day 5-30 work) / $199 with Bar A demo filing package

### The pipeline math (to hit 10 paying HOAs by month 4)

| Stage | Conversion | Volume |
|---|---|---|
| Closed-won | — | 10 |
| Active pilots | 50% pilot→paid | 20 |
| In-person demos | 40% demo→pilot | 50 |
| Outreach emails | 12% reply rate | ~420 |
| Prospect list | — | 600-1,200 (List-Building Agent) |

### Pilot conversion sequence (months 7-10)
- Day -60: schedule review call
- Day -45: review call, pull metrics, listen
- Day -30: send conversion offer with first-pilot pricing
- Day -14: reminder if no response
- Day 0: do not auto-convert; send export link + conversion link
- Day +14: breakup email, close file

Realistic: 50-65% pilot→paid conversion.

---

## 10. Risks — the consolidated list

Each risk has an owner (the agent who flagged it) and a mitigation. Read this section monthly.

| # | Risk | Owner | Mitigation |
|---|---|---|---|
| R1 | Founder time at 40-50 hrs/week is stated, not verified | Strategy | Plan reviews at week 4 and week 8. Hire part-time SDR by month 9 if numbers justify. |
| R2 | Madison Park as both customer and reference is single point of failure | Strategy, Sales | Pay HOA $500/quarter for reference availability. Build second reference customer within 90 days. Document agreements in writing. |
| R3 | Eviction software liability (CFPB, wrongful eviction) | Strategy, Architecture | Hard legal-review gate at Bar A. GA attorney on retainer ($2-5K) before any Bar B output. Marketing copy reviewed by same lawyer. |
| R4 | All-17-in-v1 timeline assumes pillar-DIC works first try; it won't | Architecture | 1-week buffer in month 1, week 4. Plan for slip cascade if missed. |
| R5 | GPU is single point of failure (RunPod spot can be pulled) | Architecture | llama.cpp CPU fallback. Second GPU at month 6, not month 12. PagerDuty for inference health. |
| R6 | RLS bugs are silent data breaches | Architecture | Eval suite for RLS policies, same CI gate as workflow evals. |
| R7 | Document ingestion quality varies wildly across HOAs (1987 photocopy CC&Rs exist) | Product, Architecture | "Document quality score" surface in Onboarding Agent ("60% confident, please review"). |
| R8 | "All 17 production-grade" framing is not what we ship — A/B/C bars need consistent language across product, marketing, sales | Product | Bar labels visible in UI. Sales scripts use the bar terms explicitly. Roadmap page shows current bar per workflow. |
| R9 | AI hallucination in legal-adjacent workflows creates real liability | Strategy, Product, Architecture | Human review gates on all B-bar workflows. Full audit log on all 17. Citations required for legal-adjacent outputs. |
| R10 | Board-meeting motion doesn't scale past founder | Marketing, Sales | Plan part-time Atlanta SDR by month 9 (~$2K/mo). Or shift to remote demo motion. |
| R11 | Content marketing has 6-12 month lag — measuring at month 4 produces wrong conclusion | Marketing | Commit to 24 weekly posts before evaluating. |
| R12 | Self-hosting means we own uptime — frontier API outages aren't your fault, vLLM crashing is | Architecture | Runbook for restart-from-phone in 5 min. PagerDuty. CPU fallback always warm. |
| R13 | Selling to volunteer boards has seasonality (Dec dead, Jul-Aug dead) | Sales | Front-load demos in Mar-May and Sep-Nov. Month 4 lands in summer — adjust expectations. |
| R14 | Reference customer relationship can sour from a personality conflict | Sales | Document the agreement, build redundancy (R2), don't let one disagreement burn the moat. |
| R15 | Madison Park residents' real data cannot contaminate eval fixtures | Architecture | Anonymized synthetic data that *looks* like Madison Park's. Boring work, must happen month 1-2. |
| R16 | Founder W-2 (NICE, MicroStrategy EOL Jun 2026) plus active interview pipelines (CompanyCam, Fluence, Beazer) creates real time risk | Strategy | If a role lands, this becomes nights-and-weekends. Plan for either scenario; don't surprise yourself. |
| R17 | NICE non-compete and IP assignment may apply | (Legal, not addressed in working session) | **Open — founder must verify with employment lawyer before any code is written.** Flag added by synthesis review. |

**Risk #17 is new and was missed by all seven agents.** Asaf, you have a W-2 at NICE. Most enterprise employment agreements have IP assignment clauses that could plausibly cover "software in adjacent domains" depending on how broadly NICE's lawyers want to read it. This is not optional — get an employment attorney to review your NICE agreement before week 1 work starts. Cost: $300-800 for a 1-hour review. Skipping this is the single most expensive mistake you could make in this entire plan.

---

## 11. Open questions and explicit founder overrides

### Open (require resolution before or during week 1)
- Brand name + domain (founder checking Namecheap)
- NICE employment agreement IP review (R17 — must clear before code is written)
- GA landlord-tenant attorney for eviction templates (must be retained before any eviction template ships)
- Madison Park HOA formal reference agreement (paper, signed, $500/quarter compensation)

### Explicit founder overrides (recorded for posterity, do not silently undo)
- **Three modules in parallel** — Strategy and Product recommended sequencing. Founder accepted timeline risk.
- **100% self-hosted OSS LLM from day one** — Strategy recommended hybrid. Founder declared non-negotiable values decision.
- **All 17 workflows in v1 by month 4** — Product/Architecture recommended v1=5, v1.5=+6, v2=+6 sequencing. Founder accepted timeline risk and 40-50 hrs/week commitment.
- **Standalone eviction brand on subdomain** — Competitor recommended PM-feature-only. Founder accepted dual-brand cost.

If any of these get reconsidered, update this section before changing scope.

### Founder reversals during the session (now-correct positions)
- Initial answer: split repos for clean ownership. **Reversed to:** monorepo with module CODEOWNERS.
- Initial answer: native iOS/Android in v1. **Reversed to:** PWA only.

---

## 12. Week 1 action list — sales infrastructure first, code second

This list is ordered by dependency, not by enthusiasm. Do them in order.

1. **Get a Georgia employment attorney to review NICE's IP/non-compete language.** $300-800. Non-negotiable. Block this on the calendar Monday morning. (R17)
2. **Block 4 weekday evenings/month on the calendar through November**, labeled "[brand] sales." Mark recurring. Family knows.
3. **Pick the brand name.** Check 5-10 candidates on Namecheap. Cross-check top 2-3 against `uspto.gov/trademarks/search` for live trademarks in classes 9 and 36. Buy the .com.
4. **Talk to Madison Park's actual board lead** about reference status. Get explicit yes for: name in case study, video clip, monthly reference calls (cap 2/month). Document in writing. Pay $500/quarter via HOA invoice.
5. **Identify 5 Atlanta-metro HOAs you have a personal connection to** (neighbors, friends-of-friends). These are demos #1-5. Warm always beats cold.
6. **Set up Calendly link** for "10-minute virtual demo" — separate from NICE work calendar.
7. **Sign up for Attio or Folk** (free tier). Set up pipeline columns: HOA name, board president, county, source, stage, next action, next action date, notes. Add the 5 warm prospects from #5.
8. **Draft the pilot agreement.** Single Google Doc, under 600 words, plain English. Founder reviews; GA attorney reviews once before first signature; same template for everyone after.
9. **Start the GA landlord-tenant attorney conversation** for eviction templates. Even if you don't ship Bar B in month 4, the relationship needs to start now. Budget $2-5K retainer.

**Week 2 onward:** code starts. Repo scaffolding (Architecture §7 month 1 week 1 plan).

---

## 13. The single number that matters

By end of month 4: **10 paying HOA customers**.

If that number is on track at the end of month 2 (3-5 paying or in active pilot), the motion is working.
If it's not, diagnose by week 6: outreach not landing, demos not booking, or product not closing.
If it's still off at week 12, restructure — don't power through.

Everything else is leading indicator or follow-on. This is the one.

---

## 14. Document hygiene

- This file lives at `docs/PROJECT_FOUNDATION.md` in the monorepo.
- Update at end of each month, or when a constraint changes, or when a risk converts to an issue.
- Keep version-controlled. PR template for changes here requires founder approval.
- Cite this document by section number in PR descriptions when implementing decisions ("implements §4 Pillar DIC").
- Claude Code: read in full at session start. The decisions here are inputs to your work, not topics for redesign.

---

*Generated 2026-05-03 from a 7-agent strategic working session: Strategy → Competitor → Product → Architecture → Design → Marketing → Sales. Each agent's full brief is preserved in the conversation transcript. This synthesis is the canonical reference; the briefs are the supporting context.*
