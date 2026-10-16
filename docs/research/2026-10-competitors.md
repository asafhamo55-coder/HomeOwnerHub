# HOA software competitive research — October 2026

**Date:** 2026-10-15 · **Branch:** `claude/product-research` (from `8c15ea8`) · **Scope:** `apps/hoa` (HOA Hub, live at www.homeownerledger.com) only. The PM and eviction hubs are out of scope.

**What this is:** an inventory of what we have, competitor profiles with sources, a feature matrix, and a gap analysis. The ranked backlog that comes out of it is in `docs/backlog.md`.

## How the research was done, and what it cannot see

- **Our side** comes from reading the code at `8c15ea8`: `docs/NEXT.md`, `docs/parking-lot.md`, `docs/specs/*`, `packages/workflows/src`, `packages/jobs/src`, the route tree under `apps/hoa/src/app`, `migrations/`, and the marketing pricing page. Nothing was observed in a browser, because browser automation is unavailable (memory: Safari only).
- **Competitors** come from WebSearch and WebFetch, run on 2026-10-15.
  - G2, Capterra and Reddit mostly returned 403 or were blocked. Review themes are therefore paraphrased from search-result summaries and aggregator pages, not verbatim quotes.
  - **No r/HOA thread could be read.** "What boards say" leans on Capterra and Trustpilot reviews plus industry write-ups.
  - Several sources are vendor marketing, marked **[vendor]**. ManageCasa's comparison articles are written by a competitor, so treat their figures as directional only.
- **Pricing figures are as of the cited page.** Most enterprise vendors don't publish prices, so third-party figures are labelled as such.

---

## 1. What we have: capability inventory

**Legend:** ✅ shipped and reachable · 🟡 half-built (schema or back end exists, a user-facing piece is missing) · ❌ not present.

### 1.1 Board and admin side (~100 pages under `(dashboard)/`)

| Area | Status | What exists (evidence) |
|---|---|---|
| Board dashboard | ✅ | An attention-first dashboard: KPIs, "at risk this week", approvals, and a compliance heat map (`(dashboard)/page.tsx`, `lib/dashboard/*`). The 7am daily digest job is `packages/jobs/src/daily-digest.ts`. |
| Properties / units / residents | ✅ | Property 360 detail page, list view with "attention" and waiting-list columns (0039–0051), CSV export (`properties/export/route.ts`). The platform-admin CSV import is `admin/import-units`. |
| Dues / assessments | ✅ / 🟡 | `/dues` with KPIs, mark-paid, and month grouping. The nightly late-fee job is `hoa-late-fees.ts`. Payment plans (`/accounting/payment-plans`). The dues-reminder packets in `lib/dues-reminders/` render but are not sent automatically. |
| Collections | 🟡 | Tracks each account's stage, attorney, and a dated trail (0047, `lib/collections`). **Nothing is sent from the product, by design** (`docs/superpowers/specs/2026-08-14-hoa-collections-design.md`). |
| Accounting | ✅ | General ledger, chart of accounts, journal entries, bills/AP (`/accounting/invoices`), budgets, budget vs actual, balance sheet, income statement, cash flow, trial balance, fiscal periods, and recurring entries (job `recurring-jes.ts`). |
| Bank feeds and reconciliation | ✅ | Plaid sync every 4 hours (`plaid-sync.ts`). **W18** matches deposits by memo code and amount. **The approval layer (D)** puts board approval in front of every automated posting (`/accounting/bank/queue`, 0060). The accounting RLS fix is 0061. |
| Violations | ✅ | List, detail, and new. **W3** inspects the photo or text and drafts the letter. There is an approval queue, residents can report violations, and there is a CSV export. **There are no state-specific hearing or fine steps** (see §4). |
| ARC (architectural requests) | ✅ | Board review in `/arc` and `/arc/[id]`; residents submit and track requests. No AI review against the guidelines yet. |
| Tickets / maintenance | ✅ | Board and resident tickets, with notifications (`ticket-notifications.ts`, 0053). |
| Shared inbox (Gmail) | ✅ | Gmail OAuth, 12-month backfill, sync every 2 minutes, a resident rail on each thread. **W32** drafts replies with verified quotes; **W33** pulls vendor details out of mail; **W34** drafts a vendor work order, including from photos. |
| Communications | ✅ | Wizard with audiences, templates (0044) and AI rewrite. Email goes through Resend (`lib/email.ts`). **The SMS code path is Vonage** (`lib/sms.ts`); it needs keys and is parked for production (`docs/parking-lot.md`, ADR-004). |
| Meetings | ✅ | Schedule, minutes wizard, AI meeting summary (`api/ai/meeting-summary`), action items (0019). **No agenda/notice posting deadline, no attendance or quorum, no votes.** |
| Events | ✅ | Recurring events with notification settings (0020, 0021). |
| Documents | ✅ | Documents, governing-document upload and versions (0016). **W1** answers questions over governing documents with citations (`/ai/ask`, resident `/resident/ask`). |
| State law | ✅ / 🟡 | **W30** answers questions about state law, plus browse and law-update pages (`/legal/*`). GA has 27 paraphrased sections; FL Ch. 720 ingestion is phase 0 of F (0062). The **law-to-bylaw pipeline (F)** is only a spec. |
| Vendors | ✅ | Vendor master, COI/compliance checks, approval queue, and tokenized onboarding (**W21**). |
| RFPs and bids | ✅ | **W22** composes the RFP; tokenized bid submission; **W23** normalizes and compares bids. |
| Leases | ✅ | Leasing caps and waiting list for rentals inside the HOA (0017, 0051). |
| Board Copilot | ✅ | ⌘K palette plus a tool-using Q&A agent (`lib/community-qa/agent.ts`, Groq). |
| Members and roles | ✅ | Five fixed roles. Same-org privilege escalation closed in 0058. |
| SaaS billing | ✅ | Stripe Checkout and Portal for **our** subscription (`lib/billing.ts`). This is not resident payments. |
| Platform admin | ✅ | Tenants, impersonation, audit log, analytics, and import. |

### 1.2 Resident side (16 pages, mobile-first PWA, web push)

| Capability | Status | Notes |
|---|---|---|
| Home dashboard and announcements | ✅ | `/resident`, `/resident/announcements`, with last-viewed tracking (0052). |
| See dues balance | ✅ | `/resident/dues` |
| **Pay dues online** | ❌ (🟡 at the data layer) | `/resident/dues/page.tsx:110` says *"to make a payment, contact your community manager."* ADR-005 chose ACH, card, Apple/Google Pay and Pay-by-Zelle. What exists: `assessments.memo_code`, the `payment_method` enum, and W18 memo matching. **No resident payment UI exists, and no resident-facing Stripe exists.** |
| Submit and track ARC | ✅ | |
| Tickets / maintenance requests | ✅ | |
| Report a violation (concern) | ✅ | |
| Ask the governing documents | ✅ | W1 |
| Amenity booking, e-voting, directory, visitor/parking passes, statements/ledger download | ❌ | |
| Native app | ❌ (parked) | PWA only (parking lot, 2026-05-09). |

### 1.3 AI workflows (`packages/workflows/src`)

| ID | Name | Where it is used | Gate |
|---|---|---|---|
| W1 | Governing Docs Brain | `/ai/ask`, `/resident/ask`, W32 retrieval | Answers only, with citations |
| W3 | Violation Inspector | `/violations/new`, approval queue | Human approval before anything is sent |
| W18 | Bank Reconciliation Agent | Plaid webhook and sync, `/accounting/bank/queue` | **Approval layer D** (proposes; a board member posts) |
| W21 | Vendor Onboarder | `/vendor-onboard/[token]`, approval queue | Human approval |
| W22 | RFP Composer | `/rfps/new` | Draft only |
| W23 | Bid Comparator | `/rfps/[id]/comparison` | Advisory |
| W30 | State Law Brain | `/legal/ask`, weekly refresh job | Answers only, with a disclaimer |
| W31 | Comm Composer | Communications wizard | Draft only |
| W32 | Reply Drafter | Inbox thread | Draft only; quotes are hard-validated |
| W33 | Vendor Extractor | Inbox | Draft only |
| W34 | Vendor Request Composer | Inbox, including vision | Draft only |
| approvals | Approval layer (`proposeApproval` / `approveRequest`) | First user is W18 cash receipts | — |

Parked: W9 (reserves), W17, W19 (anomaly detection), W20 (budget-variance narrative), W24–W27, and voice. Also in flight: **B**, an autonomous self-healing ops loop (spec only, needs the Sentry DSN), and **F**, the law-to-bylaw pipeline (phase 0 of FL ingestion merged).

### 1.4 Half-built, or promised but not built

1. **Resident payments.** ADR-005's four rails, including Pay-by-Zelle as "the killer feature for self-managed boards", have no resident UI. W18 matches memo codes that residents are never shown.
2. **Marketing promises features the app doesn't have.** `apps/marketing/src/app/pricing/page.tsx` lists:
   - "Multilingual comms"
   - "Reserve Live"
   - "Board Copilot + multi-board access controls"
   - "ARC Recommender"
   - "Export is one-click in any plan"

   What exists is CSV export of 4 lists, not a full export. There is no reserve module and no multilingual sending.
3. **Dues-reminder packets** are rendered but nothing sends them on a schedule.
4. **Inbox gaps** listed in the parking lot: backfill progress isn't shown on `/inbox`, a broken mailbox never reaches a board that isn't logged in, and attachment retries have no controls.
5. **SMS** code exists (Vonage), but there are no production keys (parked).
6. **State coverage:**
   - Marketing says "launches in Georgia".
   - GA law is paraphrased; FL ingestion is phase 0.
   - The violation workflow has no state-specific procedure.
7. **Production observability** is wired but inert until a DSN is set.
8. **No product analytics in any app** (UX plan). We can't measure adoption.

### 1.5 What we charge

`apps/marketing/src/app/pricing/page.tsx`: **$4.99 per door per month, $200/mo minimum**, 10% off for annual billing, and a six-month free pilot.

For a 50-unit self-managed HOA that is **$249.50/mo**. PayHOA charges $65/mo for the same association (§2).

---

## 2. Competitor profiles

### 2.1 Platforms for management companies (incumbents)

#### Vantaca
- **Segment:** mid-size and large management companies. 550+ companies and about 6.5M doors. A poor fit for self-managed boards. ([airframe](https://www.airframe.ai/product/vantaca-com/analysis), [vantaca blog, vendor](https://www.vantaca.com/blog/vantaca-marks-the-next-frontier-of-community-living-at-cai-annual-2026))
- **Funding:** $300M+ at a $1.25B valuation, Oct 2025. ([WilmingtonBiz](https://www.wilmingtonbiz.com/technology/2025/10/15/vantaca_secures_300m_investment_to_fuel_growth/26930))
- **Pricing:** custom quotes only, no trial.
- **Features:**
  - Configurable "Action Items" workflow engine
  - Integrated accounting and banking
  - Violations and inspections, ARC, work orders
- **Resident app (Vantaca Home):** payments and auto-draft, balance and history, documents, service requests, AI-guided ARC submission, amenity booking, push, biometric login. ([vantaca, vendor](https://www.vantaca.com/blog/which-hoa-management-platform-offers-the-best-homeowner-portal-experience))
- **AI:**
  - Acquired **HOAi** (YC W22) in Nov 2024 ([vantaca](https://www.vantaca.com/blog/shaping-the-future-of-community-management-vantaca-acquires-hoai)).
  - **HOAi Fleet** agents for AP, AR, reporting and onboarding; the target is 90% of back-office work automated by the end of 2026.
  - **HOAi Voice:** the vendor claims 35% of calls at one client were fully resolved by AI.
  - **AI ARC review:** checks photos and documents against the guidelines and writes a letter with reasons.
  - **AI work-order routing.**
  - **IQ benchmarking** across customers.
  - Sources: [ARC/work orders, vendor](https://www.vantaca.com/ai-driven-work-order-assignment-and-arc-review), [Vision 2025](https://www.streetinsider.com/PRNewswire/Vantaca+Unveils+Next-Gen+AI-Powered+Intelligent+Community+Management+Ecosystem+at+Vision+2025/25589564.html)
- **UX:** reviewers praise how configurable it is and the delinquency visibility. Capterra 4.4. ([Capterra](https://www.capterra.com/p/230892/Vantaca/reviews))
- **Complaints:**
  - Bugs every day, and old bugs stay open while new features ship.
  - Steep learning curve; "click heavy".
  - Hard to find older messages.
  - Payment friction for homeowners.
  - Sources: [Capterra](https://www.capterra.com/p/230892/Vantaca/reviews), [airframe](https://www.airframe.ai/product/vantaca-com/analysis)

#### CINC Systems (CINCWeb, CINC Connect, Cephai)
- **Segment:** management companies. 1,000+ companies, 6M+ doors, 50k+ communities. Based in Duluth, GA. ([cincsystems.com](https://www.cincsystems.com/))
- **Pricing:** not public. Capterra shows "$250/user/month" plus custom pricing ([Capterra, seen in search snippet](https://capterra.com/p/143799/CINC-Systems/pricing/)).
- **Features:**
  - Accounting, direct bank integrations, online voting.
  - **Payables+** (Feb 2026): AI reads and codes invoices; payment through AvidXchange. ([techintelpro](https://techintelpro.com/news/ai/robotics-and-automation/cinc-systems-launches-payables-ai-ap-automation))
- **Resident app (CINC Homeowner, now CINC Connect).** Source: [App Store](https://apps.apple.com/us/app/id1583013999)
  - Homeowners: pay, see violations with photos, submit ARC with photos, switch between properties, **view their ledger**.
  - Board: view owner accounts, ARC and violations, past-due list.
- **AI:** **Cephai / Cephai+**, with skills for invoices, reconciliation, budgets, board packets, violations, communications and ARC. Its stated rule is *"intelligence recommends; people decide"*. ([yespress](https://yespress.io/cinc-systems.md), [aijourn](https://aijourn.com/?p=417695))
- **Complaints:** slow support, weak reporting and navigation, hard to learn. ([Capterra](https://capterra.com/p/143799/CINC-Systems/reviews/), [G2](https://g2.com/products/cinc-systems/reviews?page=4))
- **Data export (relevant: Madison Park's manager runs CINC):**
  - Homeowner lists export through an **Excel button**.
  - **Custom Reports** (choose a type, pick columns, export to Excel) is the documented route out.
  - An owner's balance links to their ledger.
  - No public API and no documented ledger CSV.
  - Source: a management company's CINC quick-reference guide ([barkanco PDF](https://www.barkanco.com/wp-content/uploads/2026/08/CINC-Quick-Reference-Guide.pdf)).
  - Today we bring Madison Park's aging data in through hand-written SQL seeds (`migrations/seed-madison-park-dues-aging.sql`, two update files).

#### AppFolio (community associations)
- **Segment:** property managers who mix rentals and HOAs. 50-unit minimum. ([lethub](https://www.lethub.co/blog/appfolio-pricing))
- **Pricing:** quote-only since 2024. Last published rates: Core $1.49/unit with a $298 minimum; the association rate was about $0.80/unit ([lethub](https://www.lethub.co/blog/appfolio-pricing)).
- **Features:** calendar, mobile violations and letters, ARC routed to the committee, board approvals, vendor portal. ([appfolio](https://www.appfolio.com/hoa/community-association-management))
- **Resident portal:** payments, ARC with attachments, maintenance, messaging, calendar.
- **AI (Realm-X):**
  - Assistant, Flows and Performers ([appfolio.com/ai](https://www.appfolio.com/ai)).
  - The **"New Realm-X"** (2026-09-29) is on all plans. It adds a phone Receptionist and a **connector for Anthropic's Claude** ([newsroom](https://www.appfolio.com/newsroom/appfolio-introduces-the-new-realm-x)).
  - None of it is HOA-specific.
- **Complaints:**
  - "Missing features" (145 mentions) and poor support (61) on [G2](https://www.g2.com/compare/appfolio-property-manager-vs-on-site-vs-buildium).
  - HOA governance (eVoting, ARC) is shallow ([ManageCasa, competitor](https://managecasa.com/articles/best-hoa-ai-software)).

#### Buildium (RealPage)
- **Segment:** small and mid-size property managers plus associations. Association pricing requires a call. ([buildium.com/pricing](https://www.buildium.com/pricing/))
- **Pricing (residential):** Essential $62/mo, Growth $192/mo, Premium $400/mo. Each EFT costs $1.35–2.35. Prices went up in Feb 2026 ([costbench](https://www.costbench.com/changelog/buildium-price-increase-2026-02/)).
- **Features:** accounting, violations, **eVoting**, ARC with committee voting, board approval of payables, free website. ([buildium](https://www.buildium.com/association-management-software-lp/))
- **Resident Center:** payments and autopay, calendar, amenity booking.
- **AI (Lumina):** "Write with Lumina" (EN/ES/FR), AI Bill Scan, and an AI Workforce of agents (Premium only). ([RealPage](https://www.realpage.com/news/realpage-introduces-lumina-ai-suite/), [ainora](https://ainora.lt/blog/buildium-ai-review-alternatives-2026))
- **Complaints:** cumbersome accounting, weak reporting and mobile app, fee increases mid-year that boards can't budget for. ([Capterra](https://capterra.com/p/47428/Buildium-Property-Management-Software/reviews/?page=2))

#### Enumerate (formerly TOPS [ONE] / TOPS Pro)
- **History:** rebranded from TOPS in May 2023 with Great Hill backing; bought Nabr in 2022 ([BusinessWire](https://markets.financialcontent.com/clarkebroadcasting.mycentraloregon/article/bizwire-2023-5-15-enumerate-launches-as-a-vertically-focused-saas-accounting-and-payments-leader-after-prior-growth-equity-investment-from-great-hill-partners)).
- **Segment:** management companies **and self-managed associations** ([goenumerate.com](https://www.goenumerate.com)).
- **Pricing:** third-party figure of $0.75/door with a **$375/mo minimum** ([softwareconnect](https://softwareconnect.com/reviews/enumerate-central/)).
- **Features:**
  - Central: HOA-specific accounting, payments, approvals.
  - Engage: communications, documents, chat.
  - FieldOps inspection app; automated collection letters and fines.
- **AI (Numa, May 2026):**
  - "Ask Numa" about delinquency and financial health
  - Homeowner Assist chat
  - Automated bank reconciliation
  - SmartBudget (upcoming)
  - Source: [Enumerate blog](https://goenumerate.com/blog/cai-annual-2026-recap-less-busy-work-more-community)
- **Complaints:** Capterra 3.8 from 126 reviews. "Outdated and clunky", too many clicks, support takes days, "stopped innovating". ([Capterra](https://www.capterra.com/p/38478/Enumerate/reviews?page=4))

### 2.2 Tools for self-managed boards

#### PayHOA (the leader for self-managed boards)
- **Size:** $27.5M Series A, 652k+ users ([TechCrunch](https://techcrunch.com/2024/05/15/meet-payhoa-a-profitable-and-once-bootstrapped-hoa-software-startup-that-just-landed-a-27-5m-series-a)).
- **Pricing:** flat tiers by unit count ([payhoa.com/pricing](https://www.payhoa.com/pricing)):
  - 0–25 units: $54/mo
  - 26–50 units: $65/mo
  - 51–100 units: $109/mo
  - 201–300 units: $219/mo
  - 401–500 units: $275/mo
  - Over 500 units: $0.55/unit
- **Fees on top:** ACH $2.45, card 3.5% + $0.50, mailed letters $1.05–1.25, bookkeeping from $199/mo.
- **Features:** unlimited admins, forms, violations, documents, messaging, surveys, website, invoicing, bank sync, vendors; online voting and autopay according to a competitor's review.
- **AI:** "Penny", a homeowner chatbot on the website. AI for bookkeeping, reconciliation, budgets and an admin assistant was **announced in Jan 2026 but not shipped** ([Capterra p.3](https://www.capterra.com/p/146693/PayHOA/reviews/?page=3)).
- **Ratings:** Capterra 4.7 from 586+ reviews. Praised for price, ease and support.
- **Complaints:** sources are [Capterra](https://www.capterra.com/p/146693/LegFi-com/reviews/) and [ManageCasa](https://managecasa.com/articles/best-self-managed-hoa-software).
  - Vendors can't be paid by ACH; paper checks take up to 12 days.
  - Bank sync is flaky.
  - Duplicate entries in reports.
  - Weak payables.
  - **No full general ledger, accrual or reserve accounting.**

#### HOA Express
- **Positioning:** a website builder first ([hoa-express.com/pricing](https://www.hoa-express.com/pricing)).
- **Pricing:**
  - Free up to 50 households.
  - Inform $15/mo; Engage $21/mo (both for 25 households, billed yearly). Engage adds email and text blasts (50 SMS a month), payments, forms, surveys and mailed letters.
- **AI and app:** no AI, no native app.
- **Ratings:** Trustpilot 4.7 ([Trustpilot](https://ie.trustpilot.com/review/hoa-express.com)).

#### FRONTSTEPS (with Caliber)
- **Segment and price:** mainly management companies; from $75, otherwise on request ([Capterra](https://www.capterra.ca/reviews/164415/frontsteps)).
- **Resident app:** **amenity reservations** with automatic or manual approval, visitor and parking passes, payments, ARC and violations ([frontsteps](https://frontsteps.com/products/mobile-app/)).
- **Ratings:** Capterra 3.7. Slow support, "features not working".

#### Condo Control
- **Segment:** condos and management firms; has a self-managed tier for 0–99 units.
- **Pricing:** Standard about $67/mo ([fitgap](https://us.fitgap.com/products/024300/condo-control)).
- **Add-ons:** **AI Assistant**, amenity booking, packages, violations, visitor logs, **e-voting and proxies**, virtual meetings ([pricing](https://www.condocontrol.com/pricing/)).
- **AI:** residents get answers to their own questions; drafts announcements; summarizes reserve studies and budgets ([condocontrol AI, vendor](https://www.condocontrol.com/solutions/ai/)).
- **Ratings:** Capterra 4.7. Complaints: outages, too many clicks, weak reports.

#### Smartwebs
- **Positioning and price:** heavy on violations and ARC; per door from about $0.40, quoted, with minimums and setup fees ([pricing](https://smartwebs.com/pricing/)).
- **Plans:** CORE covers violations, ARC, work orders, communications and native apps. MAX adds accounting.
- **Ratings:** Capterra 4.4. Complaints: hard for non-technical users ("letters require HTML"), limited on phones, no bulk download.

#### HOA Start
- **Pricing:** from $39, every feature on every plan ([hoastart.com/pricing](https://www.hoastart.com/pricing)).
- **Features:** payments, accounting, email/text/chat blasts, **voting**, violations, ARC, events, **amenity reservations**.
- **Ratings:** Capterra 4.9 ([Capterra](https://capterra.com/p/215897/HOA-Start/reviews/)).

#### HOALife
- **Focus:** enforcement of violations and ARC.
- **Pricing:** $199/$299 per month flat ([itqlick](https://www.itqlick.com/hoalife/pricing)), or $100/mo + $0.50 per property ([getapp](https://www.getapp.co.uk/software/187047/hoalife)).
- **AI:** pulls violation rules out of the governing documents and answers homeowner questions.

#### Smaller tools
- **EasyHOA:** from $39.99 plus a $299 setup fee ([GetApp](https://www.getapp.com/hoa-software/a/easy-hoa)).
- **ManageCasa:** from $45/mo, full general ledger, eVoting, "Minii AI" ([ManageCasa, vendor](https://managecasa.com/articles/best-hoa-ai-software)).
- **KindHOA** ([Capterra](https://www.capterra.ca/software/1094716/KindHOA)) and **HOA Ally** ([Capterra](https://www.capterra.ca/software/207695/hoa-ally)): free or low-cost tiers.

### 2.3 AI-first entrants, 2025–2026

| Product | Model | AI features | Pricing | Source |
|---|---|---|---|---|
| **HomeHerald** (homeherald.ai) | SaaS for self-managed boards, launched 2026 | CC&R chat that cites rules; **violation letters written from photos**; Dues Chaser (email, push and mail); an email agent that matches Stripe payments; amenity booking; iOS app | **Free up to 50 units** | [Product Hunt](https://www.producthunt.com/products/homeherald) |
| **GnomeOwner** | Volunteer boards of 5–100 homes | Q&A over governing documents with section citations; **50-state compliance calendar tied to statutes**; residents pay no fees (payments go to the HOA's own Stripe) | Free; $29 for 25 homes; $59 for 100; $99 for 250 | [toolradar](https://toolradar.com/tools/gnomeowner) |
| **HeyNeighbor AI** | Small HOAs | Chatbot over documents; CC&Rs rewritten in plain language; state compliance guides; **document audit that flags conflicts**; voting, payments, website | From $99 flat | [Capterra](https://www.capterra.com/p/10035315/HeyNeighbor-AI/) |
| **HOA-OS** | Boards | Agent suggests actions on overdue accounts and requests for the board to approve; newsletter generator | n/a | [Capterra (search snippet only)](https://www.capterra.ca/software/1099977/HOA-OS) |
| **Assembly HOA** | AI-native **management company** (YC S24) | "Atlas", a free copilot over governing documents | Service fee | [YC](https://www.ycombinator.com/companies/assembly-hoa) |
| **Aldara** | AI-backed management services (YC S22) | Back-office automation | n/a | aggregator page for YC data (unverified) |
| **TownSq** | Management companies, boards, residents | "TownSq AI" for faster replies and inbox management | n/a | [townsq](https://www.townsq.io/llms.txt) |

I found no seed round for an AI HOA company in 2024–2026 other than YC companies.

### 2.4 Statutes that turn features into table stakes

- **FL HOAs, §720.303(4) (HB 1203, 2024):**
  - From 2025-01-01, associations with **100+ parcels** must post official records on a website or app with an **owner-only login**.
  - The required records include governing documents, rules, budgets, financial reports, insurance, executory contracts and bids, and director certifications.
  - **Meeting notices and agendas must go up 14 days ahead** on a "Notices" page.
  - Sources: [flsenate 720.303](https://www.flsenate.gov/Laws/Statutes/2025/720.303), [Shumaker](https://www.shumaker.com/insight/client-alert-governor-desantis-signs-hb-1203-affecting-homeowners-associations-and-licensed-community-association-managers/)
- **FL HOA fines, §720.305(2):**
  - 14 days' notice of the hearing; hearing within 90 days before a 3-member committee.
  - Written notice within 7 days of the hearing; the fine is due 30 days or more after that notice.
  - Curing the violation beforehand means no penalty.
  - Carve-outs for trash cans and holiday decorations.
  - Source: [flsenate 720.305](https://www.flsenate.gov/Laws/Statutes/2025/720.305)
- **FL condos, §718.111(12)(g):** 25+ units must post within 30 days; the past 12 months of minutes and meeting recordings must be included ([flsenate 718.111](https://www.flsenate.gov/Laws/Statutes/2025/718.111)).
- **CA e-voting, AB 2159 (effective 2025):**
  - Electronic secret ballots for elections and amendments, **but not for assessment increases**.
  - A paper option must remain; the system must authenticate voters.
  - Source: [NNA](https://www.nationalnotary.org/knowledge-center/news/law-updates/ca-assembly-bill-2159)
- **CA electronic notice, Civ. Code §4040:** email notice requires the member's **written or email consent**, which the member can revoke ([public.law](https://california.public.law/codes/ca_civ_code_section_4040)).
- **CA fines, AB 130 (2025):** **$100 cap per violation** unless there is a documented health or safety impact; no late fees on fines ([Reuben](https://www.reubenlaw.com/tag/homeownersassociation/)).

---

## 3. Feature matrix

**Legend:** ✅ yes · 🟡 partial, add-on, or premium-only · ❌ no · ? unknown or not published.

The competitor cells come from the sources in §2. Where a vendor's site didn't list a feature, the cell is marked "?" rather than ❌.

| Capability | **Us** | PayHOA | HOA Start | HOA Express | Condo Control | Smartwebs | Enumerate | Buildium | AppFolio | CINC | Vantaca | HomeHerald | GnomeOwner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Public flat price, self-serve signup | 🟡 ($4.99/door, $200 min) | ✅ | ✅ | ✅ | 🟡 | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | ✅ | ✅ |
| Price for a 50-unit HOA, per month | **$249.50** | $65 | ~$39+ | free–$21 | ~$67 | quote | $375 min | $62+ | $298 min (50-unit min) | quote | quote | free | $59 |
| **Resident online payment (ACH/card)** | ❌ | ✅ | ✅ | ✅ | ✅ | 🟡 MAX | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Autopay | ❌ | ✅ | ? | ? | ? | ? | ? | ✅ | ? | ? | ✅ | ? | ✅ |
| Zelle with automatic reconciliation | 🟡 (W18 only) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 (email agent) | ❌ |
| Full general ledger / accrual / financial statements | ✅ | 🟡 | ✅ | ❌ | 🟡 integrations | 🟡 MAX | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ? |
| Bank feed + reconciliation | ✅ (Plaid + W18 + approvals) | 🟡 flaky | ? | ❌ | ❌ | 🟡 MAX | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ |
| AP: bill entry / AI bill scan | ✅ / ❌ | 🟡 | ? | ❌ | ❌ | 🟡 | ✅ | ✅ / ✅ | ✅ | ✅ / ✅ Payables+ | ✅ / ✅ | ❌ | ? |
| Pay vendors electronically | ❌ | ❌ | ? | ❌ | ❌ | ? | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ? |
| Budgets / budget vs actual | ✅ | 🟡 | ? | ❌ | 🟡 | 🟡 | ✅ (+AI) | ✅ | ✅ | ✅ (+AI) | ✅ | ❌ | ? |
| Reserve study / fund tracking | ❌ | ❌ | ? | ❌ | 🟡 AI summary | ? | ? | ? | ? | ? | ? | ❌ | ? |
| Collections stage tracking | ✅ (record only) | ❌ | ? | ❌ | ❌ | 🟡 | ✅ letters | ? | ? | ✅ | ✅ | 🟡 Dues Chaser | ? |
| Dues reminders sent automatically | ❌ | ✅ | ✅ | ✅ | ? | ? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Violations + letters | ✅ (AI draft, approval) | ✅ | ✅ | ❌ | 🟡 add-on | ✅ | ✅ | ✅ | ✅ mobile | ✅ | ✅ | ✅ AI from photo | ? |
| State-specific hearing/fine steps | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 calendar |
| Mobile inspection drive-by | 🟡 (PWA; photo upload) | ? | ? | ❌ | ? | ✅ | ✅ FieldOps | ? | ✅ | ✅ | ✅ | ✅ | ? |
| ARC: submit + review | ✅ | ✅ | ✅ | ❌ | ? | ✅ | ? | ✅ (+committee vote) | ✅ | ✅ | ✅ | ? | ? |
| ARC: AI check against guidelines | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 Cephai | ✅ | ❌ | ❌ |
| Q&A over governing documents with citations | ✅ (W1, board + resident) | 🟡 Penny | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | 🟡 general | 🟡 | ✅ | ✅ | ✅ |
| State-law Q&A with citations | ✅ (W30; GA, FL in progress) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 calendar |
| Shared email inbox + AI reply drafts | ✅ (W32) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | 🟡 | ✅ | 🟡 | ❌ |
| Human approval of AI actions | ✅ (approval layer D) | n/a | n/a | n/a | ? | ? | ? | ? | ✅ Flows | ✅ "people decide" | ✅ | ? | ? |
| Email blasts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SMS blasts | 🟡 (no keys) | ✅ | ✅ | ✅ (50/mo) | ? | ✅ | ? | ✅ | ✅ | ✅ | ✅ | ? | ? |
| Paper mail sent from the app | ❌ | ✅ | ? | ✅ | ? | ? | ? | ? | ? | ? | ? | ✅ | ✅ |
| Multilingual AI drafting | ❌ (marketed) | ❌ | ❌ | ❌ | ? | ❌ | ? | ✅ EN/ES/FR | ? | ? | ? | ? | ? |
| Meetings: minutes, AI summary, action items | ✅ | ❌ | ? | ❌ | 🟡 virtual | ❌ | ? | ? | ? | 🟡 board packets | ✅ | ? | ? |
| Board packet generation | ❌ | ❌ | ? | ❌ | ? | ? | ? | ? | ? | ✅ AI | ? | ? | ? |
| **E-voting / elections / surveys** | ❌ | ✅ | ✅ | ✅ surveys | ✅ add-on | ? | ? | ✅ | 🟡 | ✅ | ✅ | ? | ? |
| **Amenity booking** | ❌ | ❌ | ✅ | ❌ | ✅ add-on | ? | ✅ | ✅ | ? | ? | ✅ | ✅ | ? |
| Owner-only records portal (FL 720.303) | 🟡 (resident docs) | 🟡 website | ? | ✅ website | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ? | ? |
| Public HOA website | ❌ | ✅ | ? | ✅ | ? | ? | ? | ✅ | ? | ? | ? | ? | ? |
| Resident ledger / statement download | ❌ | ? | ? | ? | ? | ? | ? | ✅ | ? | ✅ | ✅ | ? | ? |
| Visitor / parking passes | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Maintenance tickets | ✅ | ✅ forms | ✅ | ❌ | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ✅ | ? | ? |
| Vendor onboarding + COI | ✅ (W21) | 🟡 | ? | ❌ | ❌ | ? | ? | ✅ | ✅ portal | ✅ | ✅ Vendor | ❌ | ? |
| RFP + AI bid comparison | ✅ (W22/W23) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Leasing caps / waiting list | ✅ | ❌ | ? | ❌ | ? | ? | ? | ✅ (rentals) | ✅ | ? | ? | ❌ | ? |
| Native iOS/Android app | ❌ (PWA) | ✅ | ✅ mobile | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ iOS | ? |
| AI phone answering | ❌ (parked) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Import from another system | 🟡 CSV units only | ? | onboarding | ? | ? | ? | Onboard Assist AI | ? | ? | n/a | AI onboarding | ? | ? |
| Full data export | 🟡 (4 list CSVs) | ? | ? | ? | ? | ❌ no bulk | ? | ? | ? | Excel reports | ? | ? | ? |

---

## 4. Gap analysis

### 4a. Table-stakes gaps we must close

These are things every serious competitor has, from $0 HOA Express up to Vantaca. A board evaluating us will hit them in the first demo.

1. **Residents can't pay online.** This is the largest gap by far. Every product in the matrix except us has resident payments, and ADR-005 already chose the rails.
   - The cheapest first step needs no new account: a **Pay-by-Zelle screen** that shows the memo code W18 already matches. `assessments.memo_code` exists, and the Zelle recipient can live in `associations.compliance_settings` jsonb, so it needs no migration.
   - Stripe ACH/card comes next. It needs Stripe keys and has money risk.
2. **Dues reminders are not sent automatically.** The `dues-reminders` packets exist, but no job sends them.
   - Every self-managed tool has this, and HomeHerald built its marketing around "Dues Chaser".
   - It sends email to residents, so it must ship behind a per-org test mode that keeps all mail inside the org.
3. **Voting, elections and surveys.** PayHOA, HOA Start, Buildium, CINC, Vantaca and Condo Control all have it. California's AB 2159 now permits electronic secret ballots under specific rules.
   - A non-binding **survey/poll** is the low-risk first slice.
   - Binding elections need a legal spec per state.
   - Note: "resident social features (forums, polls)" is in the parking lot as out of scope for v1. This report recommends lifting *polls* out of that item, because it is a gap boards ask about, not a social feature.
4. **Amenity booking.** HOA Start, Buildium, Vantaca, Enumerate, Condo Control and HomeHerald have it. It needs a migration.
5. **An owner-only records page and a "Notices" page.** FL §720.303(4) requires a password-protected owner portal for associations of 100+ parcels, with specific record categories and 14-day meeting notices.
   - We already have the portal and documents. What's missing is a **checklist of the statutory record categories** and a **notices feed with the 14-day rule enforced**.
   - Most of it can be built on existing documents and meetings data.
6. **Resident statement / ledger view.** CINC and Vantaca show homeowners their ledger. Ours shows a balance but not a running ledger or a downloadable statement.
7. **Paper mail and SMS for residents who don't read email.** PayHOA, HOA Express and HomeHerald send physical letters. Both channels need an external account and are outbound, so they go later and behind test mode.
8. **Getting data out of the management company we're replacing.** Our one real customer exports from CINC (Excel), and today the import is hand-written SQL.
   - A **CINC homeowner list + aging report importer** (xlsx/csv → units, owners, opening balances) would remove founder labour from every onboarding.
   - It turns a parked item, "white-glove migration", into a product feature.
9. **Full data export.** Marketing promises one-click export; we have 4 CSVs. Fixing it is cheap and closes a trust gap.

### 4b. Differentiators we can win on

1. **State-law–aware enforcement.** Nobody in the matrix encodes state procedure into the violation workflow, not even Vantaca.
   - We have W30 (statutes with citations), W3 (violation drafting) and the approval layer.
   - The next step is a **per-state violation procedure engine**: notice, hearing window, fine caps, cure, and carve-outs (FL §720.305; CA $100 cap). W3 letters would then cite the statute and refuse non-compliant steps.
   - This is defensible because it combines our ingestion pipeline with verified quotes; a chatbot can't fake it.
2. **"AI proposes, the board approves" as a product, not a principle.** CINC says "intelligence recommends; people decide"; Vantaca is heading toward 90% autonomy. For volunteer boards that carry personal fiduciary liability, a **single approval inbox** listing every AI-proposed action has three properties: one click approves, every decision is audited, and every action is reversible until posted. That is the selling point.
   - Today the approval layer has one consumer (W18), and W3 and W21 have their own queues.
   - Unifying them is mostly UI work.
3. **Treasurer-grade accounting at a self-managed price.** PayHOA's most common complaints are the ones we already solved:
   - no full GL, accrual or reserves
   - flaky bank sync
   - duplicate entries (our 0061 index prevents double posting)

   Our accounting is closer to Enumerate's or Buildium's. That only wins if the **price** reaches self-managed range (see insight 1 in §5).
4. **Pay-by-Zelle with automatic matching.** None of the competitors has it; HomeHerald's Stripe-matching email agent is the nearest. Self-managed boards already take Zelle. Once residents can see the memo code, our matching is a 1-day finish on a feature no competitor markets.
5. **Inbox-first operations.** Boards live in Gmail. We are the only self-managed option that ingests the board's mailbox and drafts quote-validated replies (W32) and vendor work orders (W34). Vantaca's HOAi does this for management companies at enterprise prices.
6. **RFP + bid comparison (W22/W23).** No competitor in the scan has it. It isn't something a board buys on, but it demos well and saves real money on every big project.
7. **Governing-document conflict audit (sub-project F).** HeyNeighbor sells a "document audit that flags conflicts". F does the same with verbatim statutes and approved drafts. Ship F's *finding* step (informational) before its *drafting* step.

### 4c. UX patterns worth adopting

1. **Flat, published pricing with a self-serve trial.** The best-reviewed tools publish prices (HOA Start, PayHOA, HOA Express); the worst-reviewed sell through quotes.
2. **A guided resident path to "pay" in two taps from home.** Vantaca and CINC put Pay as the primary action on the resident home screen. Ours has no Pay action at all.
3. **"Simple beats configurable" for volunteers.** Vantaca's top complaint is configuration burden and being click-heavy; Smartwebs's is "letters require HTML".
   - Keep AI drafts editable as plain text.
   - Never require template syntax.
   - Default every setting from the association's state.
4. **AI-guided submission.** Vantaca's ARC intake asks follow-up questions so applications arrive complete. Our resident ARC form could use W1 to check the request against the guidelines *before* it is submitted.
5. **One approvals inbox** with counts in the sidebar, instead of one queue per module.
6. **First-run setup checklist** with a progress bar: connect bank, import owners, upload governing docs, invite board, send the first announcement. Onboarding friction is the main reason for the "hard implementation" complaints (Enumerate, Vantaca).
7. **Explain empty and failed states in board language.** Phase-1 work already made these truthful; the next step is a recommended action on each empty state ("No bank connected → Connect bank").
8. **Search older messages and records easily.** A recurring Vantaca complaint. Our ⌘K palette could search entities (owners, units, violations, threads), not just navigation.

---

## 5. Strategic insights

1. **Our price is set for management companies, while our product and pitch are for self-managed boards.**
   - $4.99/door with a $200 minimum is 3–4× PayHOA for a 50-unit HOA ($249.50 vs $65), and about 4× GnomeOwner. HomeHerald is *free* up to 50 units.
   - The marketing (`/hoa`: "AI for volunteer boards") targets the segment that pays least and compares prices most.
   - Either reprice for self-managed boards, around $1/door with a $49–79 floor (in PayHOA's range, with our accounting and AI as the reason to switch), or deliberately target small management companies and treat the self-managed board as an add-on seat.
   - This is the owner's decision; BL-001 in `docs/backlog.md` models it.
2. **The gap that loses deals is basic, not AI.** Every competitor down to the free tier lets residents pay; we don't, and we don't send reminders either. Our AI depth (11 workflows, approval layer, state law) is real and largely unmatched in the self-managed tier, but a board can't switch to a product its residents can't pay through.
   - The good news is that most of the payment loop already exists: W18 memo matching, `memo_code`, the `payment_method` enum, and ADR-005.
   - Closing the gap with Pay-by-Zelle is days of work, not weeks, and needs no new account.
3. **"State-law–aware and board-approved" is the position that is open.**
   - The enterprise vendors are racing toward autonomous back-office agents for management companies (Vantaca's 90% target, CINC Payables+, AppFolio Performers).
   - The self-managed AI entrants (HomeHerald, GnomeOwner, HeyNeighbor) all converge on the same document Q&A chatbot, which is becoming a commodity.
   - No one combines verbatim statutes, per-state violation procedure, and an auditable approval layer for volunteer boards who personally carry fiduciary risk.
   - We have the parts: W30 and F ingestion, W3, approval layer D, and quote validation. The backlog turns them into one enforcement workflow and one approvals inbox. FL first, because the official source exists and FL's statutes create hard, checkable requirements (§720.303, §720.305).
