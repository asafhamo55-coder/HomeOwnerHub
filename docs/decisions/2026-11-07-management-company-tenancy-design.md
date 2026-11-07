# Management companies as customers: tenancy design

**Date:** 2026-11-07 · **Status:** Proposed, needs owner decisions (section 0) · **Scope:** design only, no product code, no migration applied. Everything below was checked against the code at the tip of `claude/quality-oracle` on 2026-11-07. File and line references are to that tip.

---

## 0. One-page summary

**The ask.** A management company (for example Homeside) that runs tens or hundreds of HOAs must be able to sign up, put its staff in the system, and onboard new HOAs under its account. Many self-managed HOAs and many management companies must live side by side. HomeownerHub is never in an HOA's money flow.

**Recommendation: keep every HOA as its own tenant, and add a management company as a new kind of account linked to HOAs by an agreement (option B in section 2). Ship it in two steps: first a "Homeside-ready" step with no new tables, then the real manager role and agreements once we have learned from Homeside.**

In plain words:

- An HOA stays exactly what it is today: its own workspace, data, billing and bank connection. Nothing changes for a self-managed HOA.
- A management company is a new account type with staff, a portfolio page and a list of HOAs it manages.
- The link is a recorded **management agreement** (pending, active, ended). An active agreement gives assigned staff a **manager** seat inside the HOA. Ending the agreement removes the seats.
- The HOA owns its records the whole time. Switching companies, or going back to self-managing, moves nothing.

**An earlier draft said this needs "no policy changes". That was wrong and is withdrawn.** A new `manager` role is not free: database policies and app code check "admin or board" in about 30 places (inventory in section 11.1). Mapping `manager` into the existing board helper would hand managers every board power, including adding and removing board members and the second signature on money approvals. The design now uses a separate helper, `auth_manager_can(org, area, level)`, driven by a **per-agreement responsibility matrix** (13 areas, levels none, view, prepare, act) and a fixed security floor, plus a generated test that checks every policy and app role check per area and level.

**Step one (Phase 0, no new tables): Homeside-ready.** Lift the 20-organization cap and add the searchable switcher (being built on `claude/org-switcher-scale`); the platform admin creates each HOA organization by hand; each HOA's board invites Homeside staff using the existing roles; each HOA pays its own subscription; a free-text "managed by" line goes in the footer. **The cost, stated plainly: until the manager role ships, Homeside staff hold board powers in each HOA, and a per-HOA split of responsibilities is not possible.** An HOA that wants a narrower split can invite Homeside staff as `board` only where it is comfortable with that; otherwise it waits for step two. That is acceptable for one trusted customer onboarded by hand, and it teaches us what a manager really needs before we build it. Company-pays billing waits until a customer asks (section 7).

### Decisions the owner must make (ranked)

| # | Decision | My recommendation |
|---|---|---|
| 1 | **Hand-onboard Homeside first with board powers (Phase 0), or build the manager role first?** | Hand-onboard first. Fast, no migration, and the risk is one known customer for a limited time. Per-HOA splits of responsibility are only possible from step 2 (section 3.2). |
| 2 | **Approve the capability areas, levels, presets and the security floor** (section 3.2): 13 areas, levels none, view, prepare, act; four presets; five things that stay board-only. | Approve as written, then adjust areas after Homeside's first HOAs. |
| 3 | **May the board reduce the matrix alone, or does every change need both sides?** | The board can always reduce alone and immediately; any increase needs both sides. |
| 4 | **Should residents see the agreed matrix?** | No. The board sees it, with its history. |
| 5 | **Leaving rights.** Can an HOA end the relationship alone, instantly? Can the company? What does the company hand back? | Either side, one button, no approval from the other. Departing-company checklist and export (section 11.5). |
| 6 | **Handover.** Immediate cut-off, or a read-only period of up to 30 days chosen by the board? | Immediate by default, optional board-chosen read-only handover. |
| 7 | **Inngest capacity.** The job runner's free tier allows 50,000 runs a month and mail sync alone uses about half. Gate onboarding of 100 HOAs on measured headroom, or pay for a bigger plan? | Gate on measurement; plan the upgrade before the 20th HOA (section 11.4). |
| 8 | **Company-pays billing now or later?** | Later, when a customer asks. The unique `stripe_customer_id` and the webhook's customer lookup make it a real project (section 7). |
| 9 | **Overlap.** May one HOA have two companies active at once? | No. One active company per HOA (section 11.7). |
| 10 | **Lawyer gate.** Must a lawyer approve the signature wording and attestation before the agreement flow launches? | Yes, a hard gate on Phase 4. |
| 11 | **Timeout for an unconfirmed company-created HOA.** | 30 days to confirm, then it freezes (section 11.7). |
| 12 | **Role precedence** when someone is both company staff and a resident or board member of a managed HOA. | Highest of their own roles in that HOA, with the audit trail showing the capacity they acted in (section 11.7). |

**Not our business: what the company charges the HOA.** Management fees and how a company prices a heavier or lighter split are between them. HomeownerHub does not bill, mediate or even see them; the agreement has only an optional free-text "service notes" field for the parties' own reference. Our subscription stays per HOA.

Smaller open questions are in section 9.

---

## 1. What exists today (verified)

### 1.1 The organization type and the schema

| Fact | Evidence |
|---|---|
| `orgs.organization_type` exists, CHECK in `self_managed_hoa`, `management_company`, `landlord`, default `self_managed_hoa`. Its own comment says a single org "can host multiple Associations (CAM use case)". | `migrations/0004_v1_schema_phase2a.sql:27-32` |
| `associations.organization_id` points to the org. Comment: a management company org "may have many associations; a self-managed organization has exactly one". Nothing in the database enforces the "exactly one"; the index is a plain index. | `migrations/0004_v1_schema_phase2a.sql:34-52` |
| `units.association_id` ties units to an association. 42 migration files reference `association_id`. | `migrations/0004...` and 41 others |
| The value `management_company` is never read or written by app code. The only app touches of `organization_type` are the platform admin tenant badge and the platform-admin tenant creator, which hard-codes `self_managed_hoa`. | `apps/hoa/src/app/admin/tenants/[id]/page.tsx:63`, `apps/hoa/src/lib/platform-admin.ts:1000` |

So the multi-association shape exists as a promise in the schema that the app never kept.

### 1.2 Where the app assumes one association per organization

- `getPrimaryAssociation()` is documented as "management-company orgs aren't yet supported here" (`apps/hoa/src/lib/vendors.ts:91-93`). It delegates to `getPrimaryAssociationResult` (`apps/hoa/src/lib/primary-association.ts:16`), which calls `readPrimaryAssociation`, which does `.eq('organization_id', orgId).order('name').limit(1)` (`apps/hoa/src/lib/association-setup.ts:77-95`). That is "first association by name".
- 110 files and 214 lines reference `getPrimaryAssociation` across `apps` and `packages` (tests included). A further `limit(1)` pattern appears in 69 files under `apps/hoa/src`, not all of them about associations.
- `association-setup.ts:211` reads "any association for this org" as a yes/no check during setup.
- Money, dues, letters, voting and the like are keyed `organization_id` plus `association_id`. Under one-association-per-org the two are interchangeable, which is why nothing has had to choose.

### 1.3 `hub_type`, and whether `apps/pm` overlaps

- `orgs.hub_type` is a different axis from `organization_type`: it picks the product (`hoa`, `eviction`, `pm`). `getCurrentOrg` only ever returns orgs whose `hub_type` is `hoa` (`apps/hoa/src/lib/orgs.ts:173-194`). Onboarding creates `hub_type: 'hoa'`, `plan: 'free'` (`apps/hoa/src/app/onboarding/actions.ts:56-64`) and then makes the signer the `admin` (`:70-75`).
- `apps/pm` is a landlord rent and property app: its onboarding inserts `hub_type: 'pm'` (`apps/pm/src/app/onboarding/actions.ts:37`), and its libraries are `rent.ts`, `properties.ts`, `billing.ts`, `orgs.ts` (`apps/pm/src/lib/`). It manages rental units for a landlord. **It does not overlap with managing HOAs for associations**, and both it and eviction are hidden behind `OTHER_HUBS_ENABLED = false` (`docs/decisions/2026-10-19-hide-pm-eviction.md`). The owner has also said to work on `apps/hoa` only. This design adds nothing to `apps/pm` and does not reuse its org shape. The name "pm" (property manager) is misleading here; a management company for HOAs is a different customer.

### 1.4 Membership, switching, and a hidden ceiling

- `org_members` has `(org_id, user_id, role)`; roles today are `admin`, `board`, `resident`, `cpa`, `attorney` (`migrations/0071_m6_roles.sql:147-151`; app type `apps/hoa/src/lib/roles.ts:3`). Professional roles require an expiry (`0071:164-167`), which is a good precedent for time-boxed access.
- All row-level security hangs off `auth_org_ids()` and helpers `auth_is_admin`, `auth_is_board_or_admin`, `auth_role_in_org` (`migrations/0070_tenant_isolation.sql:121-195`). They ignore suspended or archived orgs. `tenant_fk_same_org()` (`0070:345`) stops a child row pointing at a parent in a different org.
- An organization switcher already exists, driven by the cookie `hoa_active_org_id` (`apps/hoa/src/lib/orgs.ts:28`, `apps/hoa/src/app/actions/set-active-org.ts`, `apps/hoa/src/components/layout/OrgSwitcher.tsx`).
- **Hidden ceiling:** the membership read is `.limit(MEMBERSHIP_LIMIT)` with `MEMBERSHIP_LIMIT = 20`, oldest first (`apps/hoa/src/lib/orgs.ts:56`). `getCurrentOrg` and `getUserHoaOrgs` choose from that list, so a user in more than 20 orgs cannot select the 21st (the cookie is "ignored" when the org is not in the list, `orgs.ts:186-191`). A manager of 100 HOAs would hit this immediately. Fixing it is a prerequisite in every option (task T1).

### 1.5 Billing

- Billing lives on the org row: `plan`, `stripe_customer_id`, `stripe_sub_id`, `doors_count` (`apps/hoa/src/lib/billing.ts:140`; webhook "updates orgs.plan / stripe_customer_id / stripe_sub_id", `packages/billing/src/webhook.ts:38`). `stripe_customer_id` is unique where not null (`migrations/0070_tenant_isolation.sql:72`, item 10).
- One plan, priced by home count (`docs/decisions/2026-11-01-one-plan.md`): 1-50 homes $59/month ($590/year), 51-100 $109 ($1,090), 101-200 $169 ($1,690), 201-400 $249 ($2,490), 401+ $0.65 per home ($6.50 per home/year). 30-day free trial, no card. Stripe uses volume tiers, quantity equals homes (`packages/billing/src/pricing-v2.ts` header). No volume or multi-community discount exists. Add-ons and founding discounts were explicitly "not decided".
- Estimated variable cost is about $2 to $5 per community per month under 150 homes and under $15 at 400 (same decision doc), so a portfolio discount is affordable; it is a business call, not a cost constraint.

### 1.6 Professionals, and the third-party access precedent

M6 (migration 0071) built outside access: CPA and attorney roles, time-limited, with their own area `apps/hoa/src/app/(pro)/pro`. They read no `orgs` or `associations` row directly and see the org name through `pro_org_info()` (`0071` header; `apps/hoa/src/lib/orgs.ts:77-90`). Invites go through `pro-invite` (`apps/hoa/src/app/pro-invite/[id]/page.tsx`). This proves the pattern the design reuses: **an outside party gets a membership row with a role and an end date inside the HOA's tenant, and the HOA controls it.** A management company is the same idea with a bigger role and a company behind it.

### 1.7 Stripe Connect

`docs/decisions/2026-10-31-online-dues-payments-design.md` section 1.2: one Standard Connect account **per association**, direct charges, the association is merchant of record, the treasurer onboards it, table `association_stripe_accounts` unique on `association_id`. Section 1.3 says the treasurer holds the EIN and bank details, "not the property manager and not us". The design below keeps that exactly.

---

## 2. Question 1: the tenancy model

### The three options

**A. The company is one org holding many associations (the existing database shape).**
One tenant row, many `associations` under it. Staff are `org_members` of the company org.

**B. Each HOA stays its own org; a company entity is linked by agreement. (Recommended.)**
The company is a new entity with its own staff. A `management_agreements` row links company to HOA org. An active agreement plus an assignment gives a staff member a `manager` seat (an `org_members` row) in that HOA org.

**C. Hybrid.** Company holds the HOA orgs it created (A-like) but a board can "claim" the org out. Rejected below as a worse version of B.

### Comparison against your factors

| Factor | A: one org, many associations | B: HOA = own org, agreement link | C: hybrid |
|---|---|---|---|
| **HOA leaves or switches companies and keeps all data** | Hard. Every row is in the company's tenant. Leaving means a data migration that rewrites `organization_id` on dozens of tables, under live use. | **Trivial.** Data never moved. End the agreement, seats disappear. A new company links in. | Hard for company-created HOAs, easy for claimed ones. Two paths to test and explain. |
| **Board's own access next to the manager's** | The board are residents or board members of the company's tenant. They share a tenant with 99 other HOAs' managers, so isolation between HOAs depends on new association-level rules. | **Natural.** Board are `admin` or `board` in their own org, manager is `manager` in the same org. Today's role model. | As A until claimed. |
| **Per-HOA billing vs company billing** | Billing is on the org row, so one subscription for the whole company, with no per-HOA record. Hard to price per HOA and impossible to hand an HOA its own bill later. | Each HOA keeps its own subscription record. Company-pays is a payer setting on top. HOA can take over its bill without data change. | Mixed. |
| **RLS complexity and isolation** | Every policy is `org_id = ANY(auth_org_ids())` (`0070`). A company staff member in the company org would see all 100 HOAs, and "only my assigned HOAs" needs a second layer on every table. Migration 0070 and 0081 were large, careful efforts to make exactly this single layer trustworthy; A would reopen all of it. | **Org scoping needs no change** (a manager is a member of exactly the HOA orgs they are assigned to, so `auth_org_ids()` scopes them), but **role checks do**: a separate `auth_manager_can(org, area, level)` helper driven by a per-agreement responsibility matrix, opted in table by table (sections 3.2 and 11.1). | As A plus extra. |
| **Stripe Connect per association** | One org, many accounts. Doable (the design already allows it, section 1.2) but every payments code path must pick an association first. | One org, one association, one account. Matches the design as written. | Mixed. |
| **State-law records ownership (association owns its records)** | Records sit in the company's tenant. Easy to argue the company owns them, and a contract dispute traps the HOA's records. | **Records sit in the association's own tenant**, which is the legal truth. The company is a delegate. | Ambiguous. |
| **Reporting across many HOAs** | Easy: one tenant, query all. | Needs a cross-tenant read for the portfolio page (section 5). One RPC and an index. | Mixed. |
| **Code that assumes one association per org** | 110 files must learn which association. Each miss is a possible cross-HOA leak or a wrong answer. | **Zero changes.** Each HOA org still has exactly one association. | As A. |
| **Existing self-managed customers** | Unaffected only if the new picker defaults well. Risky. | **Unaffected by construction.** | Unaffected. |

### Why not C

C exists to make company-led onboarding feel simple, but that simplicity is available in B: the company can create the HOA org itself (section 4.2) and the org is still the HOA's. A hybrid means two kinds of HOA in production forever.

### The one real cost of B, and the answer

B's cost is the cross-tenant read for a portfolio dashboard, plus switching between many orgs. Both are bounded problems (sections 5 and 8) and neither touches the money or the records.

### Details that matter in B

1. **Where does `organization_type = 'management_company'` go?** I recommend **not** reusing the `orgs` table for the company. `orgs` is the HOA tenant (`hub_type='hoa'`, `getCurrentOrg` filters on it, billing columns, unique customer id). Making a company an `orgs` row would put it in the HOA switcher and in every `orgs`-keyed query. The company is a new table, `management_companies`. The dormant `organization_type='management_company'` value stays unused (a note in migration 0083 documents that, no destructive change). Decision D1 is where you can override this.
2. **Access is materialized as `org_members` rows.** When an agreement is active and a company staff member is assigned to the HOA, a row `(org_id = HOA, user_id = staff, role = 'manager', source_agreement_id = agreement)` exists. Org scoping then works without edits, but role checks do not: see section 11.1. Seats are bound to their agreement (section 11.2) and ending the agreement or assignment deletes the row in the same transaction.
3. **Fail closed.** Because the seat is a real row, a bug in the new company tables cannot widen access: no row, no access. The reverse bug (seat not removed) is controlled by the foreign key, check constraint and trigger in section 11.2; the nightly sweep is only an alarm.

---

## 3. Question 2: roles and permissions

### 3.1 The people

| Who | Where they live | In the HOA they have |
|---|---|---|
| **Company admin** | Company staff, flagged admin | A `manager` seat in **every** HOA with an active agreement (automatic) |
| **Company manager** | Company staff | A `manager` seat only in the HOAs assigned to them |
| **HOA board member** | The HOA's own org, role `admin` or `board`, as today | Unchanged |
| **Resident** | HOA org, `resident`, as today | Unchanged |
| **CPA or attorney** | HOA org, M6 roles, as today | Unchanged |

Company roles live in `management_company_members` (role `admin` or `manager`); a person can be staff in one company.

### 3.2 What a manager can see and do: a responsibility matrix agreed per agreement

HOAs and companies split the work differently, and the split is negotiable. Some boards hand over everything; others keep violations and the money and want only help with communications. So there is **no single fixed manager table**. Each management agreement carries its own **responsibility matrix**, agreed by the board and the company, versioned and audited.

**Capability areas.** Based on the real areas of the app (`apps/hoa/src/app/(dashboard)/`):

| # | Area | Covers (app sections) |
|---|---|---|
| 1 | `dues_collections` | dues, late fees, collection cases |
| 2 | `accounting_books` | accounting, invoices, bank import, journal entries, fiscal periods |
| 3 | `payments` | online payments and refunds (only exists when M8 is on) |
| 4 | `violations_fines` | violations, hearings, fines |
| 5 | `arc_reviews` | architectural review requests |
| 6 | `communications` | announcements, email, SMS, mailed letters, inbox, community board |
| 7 | `meetings_voting` | meetings, minutes, events, polls, ballots, elections |
| 8 | `amenities_bookings` | amenities and reservations |
| 9 | `vendors_workorders` | vendors, RFPs, service tickets, tasks, insurance certificates |
| 10 | `documents_records` | governing documents, records, records requests |
| 11 | `compliance_legal` | compliance deadlines, state registrations |
| 12 | `resident_directory` | people, properties, units, ownership, leases |
| 13 | `reports` | board reports, analytics, exports |

**Levels.** For each area the company's level is one of:

| Level | Meaning |
|---|---|
| `none` | The area is invisible to the company. |
| `view` | The company can read it, change nothing. |
| `prepare` | The company drafts; the board **releases**. The company can create proposals (a draft letter, a proposed fine, a proposed payment, a draft invoice) but nothing takes effect or leaves the system until a board member releases it. Proposals use the existing approvals inbox (`approval_requests`, migration 0060) and its "can only be inserted as proposed" rule. |
| `act` | The company acts directly. |

Levels are ordered: `act` includes `prepare` includes `view`. A missing cell means `none`, so an area added to the app later starts closed.

**Presets.** The two sides start from a preset and adjust any cell. A preset is a starting point only; the agreement stores the resulting cells, not the preset name.

| Preset | dues | books | payments | violations | arc | comms | meetings | amenities | vendors | docs | compliance | directory | reports |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Full service** | act | act | prepare | act | act | act | act | act | act | act | act | act | act |
| **Shared (company prepares, board approves)** | prepare | prepare | prepare | prepare | prepare | prepare | prepare | act | prepare | prepare | prepare | act | act |
| **Financial only** | act | act | prepare | none | none | view | none | none | view | view | none | view | act |
| **Advisory / view only** | view | view | none | view | view | view | view | view | view | view | view | view | view |

Money-moving areas (`payments`, and the payment steps inside `dues_collections` and `accounting_books`) are capped at `prepare` in every preset; a board that wants `act` there chooses it deliberately, and the second signature stays with the board in all cases (floor below).

**Who agrees, and who may change it.**
- The matrix is set together: one side proposes, the other accepts, and only then does it take effect (version 1 at agreement start).
- **The board can reduce the company's levels alone, immediately, at any time.** Nothing the company has queued under a reduced level is lost: pending proposals stay for the board to release or discard.
- **Any increase needs both sides to accept.** The company can also reduce its own levels alone.
- Every version is stored with who proposed it, who accepted it, and when. The board sees the matrix and its history in Settings; the company admin sees the same.

**The security floor: no matrix can override it.** These stay board-only whatever the cells say:

1. Bank and Stripe account details: Connect onboarding, payout destination, the Plaid bank link and any change to them.
2. The board roster and roles: adding, removing or changing board members, officer titles, and who is an admin.
3. The second signature on money: a manager can never be the approver or second signer of a money action, and cannot release their own proposal.
4. Ending the agreement (the company may end from its own side, but cannot end it on the board's behalf) and approving any increase to the matrix on the board's behalf.
5. Granting outside professionals (CPA or attorney) access.

Also fixed: the HOA's own subscription and card (unless company-pays is later built), and the audit log, which nobody can edit. The floor is enforced in code and policies, not by cells in the matrix, so there is no cell to misconfigure.

**What a managed HOA's board sees:** the matrix, its history, and everything managers did. **Residents do not see the matrix** (recommended; the board sees it).

**Enforcement summary.** The helper `auth_manager_can(org, area, level)` reads the matrix of the agreement that issued the manager's seat (section 11.1). Without the matrix, a seat grants nothing.

### 3.3 Assignment

- Company admin assigns staff to HOAs from the HOA's row in the portfolio, or from the staff member's page. Many managers per HOA are allowed (a primary manager plus a backup).
- One **primary contact** per HOA is named; letters and the "Managed by" line show them (section 6).
- Assignment writes the seat; unassigning deletes it. Leaving the company (staff removed) deletes all their seats.
- The HOA board sees, in Settings, a plain list: "People from Homeside who can work on your community: Jane Rivera (primary), Tom Okafor." Each has a Remove button, and the board can end the whole agreement.

### 3.4 Audit trail

- Every action in an HOA by a manager is attributable to a named person **and** the company. The seat carries `source_agreement_id`; the existing audit log gets an `acting_company_id` and `acting_role` (`manager`) filled in by the same helper that writes actor today (migration 0083 adds the columns; the writer change is task T6).
- Events always logged: agreement created, accepted, ended (by whom, why); seat granted, removed; a manager signing in to an HOA for the first time; permission-sensitive actions (sending a mailed letter, changing roster, exporting data).
- The board sees these in Settings, Activity, filtered "Management company". The company admin sees their staff's activity across HOAs.
- A manager cannot delete or edit audit rows (same rule as every role).

---

## 4. Question 3: onboarding

### 4.1 A company signs up

1. New page `Sign up as a management company` (separate from the HOA sign-up, so an HOA board member is never asked a question that is not theirs).
2. Fields: company name, your name, work email, roughly how many HOAs you manage. Email verification as today.
3. Creates `management_companies` row and makes the signer `admin`. No HOA, no billing yet.
4. Lands on the empty portfolio with one big button: **Add your first community**. A second button: **Invite my team**.
5. Invite team: email invites with role admin or manager (same invite machinery pattern as `join` and `pro-invite`). Staff do not need to be assigned to anything to sign in.
6. Gating: a flag (M17, section 7) plus an allow-list in the early phase so Homeside can be onboarded by hand before public launch. Platform admin tooling (`apps/hoa/src/app/admin/tenants`) gets a Companies tab.

### 4.2 The company adds a new HOA (company-led)

A short wizard, each step skippable and resumable:

1. **Name and basics:** HOA name, state (Georgia first), number of homes, type (HOA, condo, co-op). Creates a new `orgs` row (`hub_type='hoa'`, `organization_type='self_managed_hoa'`, because as an HOA tenant it is its own tenant) with its one `associations` row, the same way onboarding does today (`apps/hoa/src/app/onboarding/actions.ts:56`, then association setup). Creates an **active agreement** and assigns the creator.
2. **Attestation:** "We have a signed management agreement with this association." Recorded with date and person. This is a statement by the company, not verified by us.
3. **Roster import:** the existing importers (`apps/hoa/src/app/admin/import-units`, `(dashboard)/properties/import`) run in the context of the HOA once the manager has entered it. The wizard just links to them with the HOA already selected.
4. **Invite the board:** the existing member invite flow; the email says "Homeside has set up a community workspace for Creek Valley HOA. You are being invited as president." The first board person to accept becomes `admin` of the HOA org and the board confirms the agreement (decision 11 and section 11.7).
5. **Assign managers.**

Until the board confirms, the HOA is marked "pending board confirmation": a manager can load data but cannot turn on online payments, cannot mail letters, and cannot invite a CPA or attorney. Payments are the line the owner insists on; this keeps an unconfirmed claim of authority from ever reaching money.

Bulk onboarding of 50 HOAs: a CSV (name, state, homes, board contact email) creates them in one go, after the single-HOA wizard is proven. It is a later task (T20).

### 4.3 An existing self-managed HOA accepts a company

1. HOA admin: Settings, Management company, **Invite a management company**. Types the company's name or email, or pastes a company code.
2. Or the company starts it: it types the HOA's admin email. The HOA admin gets an email.
3. The HOA admin sees a plain-language screen: "Homeside will be able to: [the list from 3.2]. Homeside will not be able to: change your bank account, add or remove board members, or end this agreement. You can remove them any time." One green **Accept** button.
4. On accept, agreement becomes `active`, the company admin picks which staff to assign.
5. Nothing else changes for the board. Their data, bills and bank connection are untouched.

### 4.4 Ending the relationship

Either side, one button, no approval from the other: HOA Settings, Management company, **End this agreement**; or company side, the HOA row, **Stop managing**.

- Default (decision 6): all `manager` seats for that agreement are removed immediately, in one transaction.
- Optional read-only handover for up to 30 days, chosen by the HOA board only (the manager seats become read-only with an end date, mirroring the CPA and attorney expiry).
- HOA keeps everything; nothing is copied or deleted. The board can export everything with the existing data export (`apps/hoa/src/lib/data-export/`).
- If the company was paying (section 5): the HOA gets a clear banner and a 30-day grace to add a card before the normal billing-failure path starts (decision D2 follow-up, question Q3).
- The history stays: "Managed by Homeside from 2026-03-01 to 2026-11-07" is kept in the agreement row and shown to the board.
- The company keeps no copy of HOA data. Its own working notes about an HOA are out of scope in v1 (question Q6).

---

## 5. Question 4: the experience

### 5.1 Company portfolio dashboard

One page, `/portfolio`, shown to company staff on sign-in.

- A table of HOAs: name, state, homes, assigned manager, and four counters that answer "where do I need to look today": overdue dues, open violations, items waiting on a manager, subscription or payments status.
- Default sort is **needs attention first**. Search box on top. Filter by manager ("My communities").
- Click an HOA, and the app sets the active organization (the existing cookie mechanism) and opens that HOA's normal dashboard.
- A thin bar at the top of every HOA page for a manager: "Creek Valley HOA, working as Homeside. Back to portfolio." It makes the context obvious and prevents a manager sending a notice to the wrong community.
- A company admin also gets Staff, Agreements, Billing tabs.

**How the numbers are produced.** A `SECURITY DEFINER` function `company_portfolio_summary(p_company uuid)` returns one row per HOA, joining only HOAs with an active agreement for that company and only for a caller who is a staff member. It uses indexed counts, not a fan-out of 100 separate page loads. It reads existing tables; no data is copied, so it cannot go stale. If it ever gets slow at several hundred HOAs, the answer is a small cached summary table refreshed on a schedule (a budgeted daily job, because the Inngest Hobby plan has a 50,000 executions per month cap), not a redesign.

### 5.2 The HOA switcher

- Today's switcher (`OrgSwitcher.tsx`) lists up to 20 orgs. For company staff it becomes a **search box** ("Type a community name") with "Recent" at the top.
- For a person in only one org it does not appear, as today. A board member never sees it.
- Selection still goes through `setActiveOrg` (`apps/hoa/src/app/actions/set-active-org.ts`), which verifies membership, so the cookie cannot be forged into another HOA.
- Prerequisite (T1): resolve the active org by direct lookup of the cookie's org when it is not in the first page of memberships, and page the list. This fixes the 20 limit for everyone.

### 5.3 Keeping the 70-year-old board member's experience unchanged

This is a hard constraint, not a nice-to-have (`feedback_older_users_ux`). Concretely:

- No new screen appears for board members, no new menu item, no new question in sign-up. The management company section exists only inside Settings, under a heading that is shown but quiet if there is no company.
- If a company manages them, the only visible change is one line in the footer and in Settings: "Managed by Homeside" with the manager's name and phone, and the activity list in Settings.
- Their link, register, use path is unchanged. Residents see nothing different except letters and emails carry the manager's contact line (section 6).
- Every management feature ships behind the flag and a UI hide switch (the `OTHER_HUBS_ENABLED` pattern, `packages/ui/src/hubs.ts`), so self-managed HOAs are verifiably byte-for-byte the same while the flag is off.

---

## 6. Question 6: communications and branding

Rule: **the HOA is the sender; the company is the contact.** The association is the legal party that notifies owners.

- **Email "From" name:** the HOA name, as now (`apps/hoa/src/lib/email/sender-name.ts` builds the display name from the association; the address stays the single verified domain from `EMAIL_FROM`). We do not change the sending address, which also protects deliverability while the Madison Park Gmail issue is open.
- **Email body and footer:** HOA logo and name on top as now. Footer line: "Creek Valley HOA, managed by Homeside. Questions: Jane Rivera, 555-0100." The line is added by the shell (`apps/hoa/src/lib/email/shell.ts`) only when an active agreement exists.
- **Reply-to:** the HOA's own reply address as today. Optional, behind a setting: replies route to the primary manager's inbox in the shared mailbox (`settings/mailbox`).
- **Mailed letters and PDFs:** HOA name and address block as the letterhead, as in `apps/hoa/src/lib/mailed-letters/`; a "Managed by" line in the footer. Statutory notices are signed by the association's officer or "on behalf of the association" per the HOA's choice. This needs lawyer review per state (question Q5).
- **SMS:** sign-off stays the HOA name, within the 279-character limit; no company name added unless the board turns it on.
- **Company brand:** appears only on manager-facing screens (portfolio, staff, billing), using the website brand and Royal purple, never replacing the HOA's identity on anything a resident sees. An optional company logo may be shown in the "Managed by" line.
- **Residents** see the HOA, the manager's contact, nothing else. Their login, link and screens are the HOA's.

---

## 7. Question 5: billing

### Current facts

See 1.5. One plan sized by homes, $59 to $249 per month by band, then $0.65 per home beyond 400, annual at ten times monthly, 30-day free trial. Stripe customer and subscription are per HOA org.

### Options

| Option | How it works | Pro | Con |
|---|---|---|---|
| **HOA pays** | Unchanged. Each HOA runs its own checkout. | Zero change, HOA fully independent, easy exit. | The company has 100 cards to chase. Poor fit for companies. |
| **Company pays** | The company's Stripe customer pays one subscription per managed HOA. One invoice line per HOA. | What companies expect. One bill. | Needs a payer concept, and an exit path when the agreement ends. |
| **Both (recommended)** | HOA pays by default; the company can switch a given HOA to "company pays". | Matches how real contracts differ, no forced choice. | Slightly more settings. |

### Recommendation: HOA pays now, company-pays later

- **Company-pays is deferred until a customer asks.** It is the one part of this design that touches shared billing infrastructure: `orgs.stripe_customer_id` is unique where not null (`migrations/0070_tenant_isolation.sql:72`) so many HOAs cannot share one company customer on `orgs`, and the webhook finds the org by customer id (`packages/billing/src/webhook.ts` near `:224`), so it needs a second lookup by subscription id. Until then every HOA pays itself, which is also what Phase 0 does. The plan below is what we would build when asked.
- Keep one subscription **per HOA**, each priced on its own home count, so the existing price tables, trial, webhook and "doors" logic are unchanged.
- Add a payer on the HOA: `self` (default) or `company`. For `company`, the subscription is created on the company's Stripe customer.
- Because `orgs.stripe_customer_id` is unique and would be shared by many HOAs under a company customer, company-paid subscriptions do **not** write the company's customer id into `orgs`. The company's customer id lives on `management_companies`; the HOA org keeps only `stripe_sub_id` and a `billing_payer` marker. This is verified work for the billing owner: the webhook (`packages/billing/src/webhook.ts`) matches events to an org by customer id today (`:224` area), so it needs a second lookup by subscription id. Treated as task B2 and a risk R3.
- Company billing page: one table, one row per HOA with its plan band, price and renewal date; one total; invoices from Stripe.
- **Volume pricing (only when company-pays is built):** a percentage off per HOA by the number of active company-paid HOAs, implemented as a Stripe coupon or a second price table applied at checkout, not by changing the band prices. Illustrative only: 10 HOAs, 10 percent off; 25, 15 percent; 50 and above, 20 percent. At about $2 to $5 variable cost per community (one-plan doc), a 20 percent cut on the lowest band ($59) still leaves a wide margin. The numbers are yours to set; the prices have never been proven with paying customers (one-plan doc, "Costs we accept"), so I recommend keeping the discount modest until real customers exist.
- Trial: each new HOA gets its own 30-day trial from creation, consistent with today. A company may prefer one trial for the whole portfolio; that is question Q2.
- **Never in the money flow.** Subscription billing is HomeownerHub's own fee. HOA dues and fees are paid by residents straight into the association's own Stripe Standard account. The company pays HomeownerHub for software only. Neither HomeownerHub nor the company touches HOA funds through us.

---

## 8. Question 7: migration and rollout plan

### 8.1 Migrations (applied by Asaf, by hand)

Numbering: the last applied migration is `0082_money_integrity.sql` (flag M16, `packages/db/src/m16.ts`). `0080` and flag `M15` are reserved by the unbuilt vendor bill pay design (`docs/backlog.md:2083`, `docs/backlog.md:2509`: "There is no M15"). I leave them alone. Next free numbers are **0083** and **M17**. Re-check when work starts, because parallel sessions also add migrations.

| Migration | Flag | Contents | Phase |
|---|---|---|---|
| none | none | Phase 0 needs no migration at all and cannot express per-HOA splits. | 0 |
| `0083_management_companies.sql` | **M17** | Tables `management_companies`, `management_company_members` (role `admin` or `manager`), `management_agreements` (status `pending`, `active`, `ended`; initiated by; attestation date and person; started, ended, ended by, reason; `board_confirmed_at`; `confirm_by`; `handover_until`), `management_assignments`, `agreement_responsibilities` and `agreement_responsibility_changes` (11.8), and a free-text `service_notes` on the agreement. `org_members.role` CHECK gains `manager`; `org_members.source_agreement_id` with the bindings in 11.2; `org_members.access_expires_at` is reused for manager seats. New helper `auth_manager_can(org, area, level)` and the per-area policy changes in 11.1 (`auth_is_board_or_admin` itself is **not** edited). Guard trigger and policies so only service-role agreement functions create or delete manager seats. Actor-name snapshot columns (11.5). Audit columns `acting_company_id`, `acting_role`. `company_portfolio_summary()` (11.3). Verify script `verify-0083-management-companies.sql` in the style of `verify-0082-money-integrity.sql`. | 2 |
| `0084_company_billing.sql` | **M18** | **Deferred until a customer asks** (section 7). Company Stripe customer id, `orgs.billing_payer`, grace columns. | 5 |
| `0085_portfolio_rollup.sql` | **M19** (optional) | Cached summary table, only if the live function is measured slow at 300 HOAs. | 6 |

**Rollback story for 0083.** Applying is additive (new tables, a widened CHECK, nullable columns), and flag M17 stays false until verified. If it must be undone before any company exists: drop the new tables and functions, remove the `manager` value from the CHECK (no rows hold it), drop the added columns. That is a prepared `rollback-0083.sql` committed beside the migration and rehearsed in CI against the ephemeral database. Once real manager seats or agreements exist, rollback is no longer a drop: first end every agreement (the trigger removes the seats), export the agreement history, then run the rollback. The migration is idempotent so a half-applied run can be re-run.

### 8.2 Feature flags (M-flag style)

New files `packages/db/src/m17.ts` (and `m18.ts`, `m19.ts` later), each a single exported boolean with no imports, defaulting `false`, flipped to `true` in a one-line commit after the owner confirms the migration is applied and verified (exact pattern of `m16.ts`, `m14.ts`). Every code path that reads a new column or table checks the flag first. A UI hide switch `MANAGEMENT_COMPANIES_ENABLED` in `packages/ui`, next to `hubs.ts`, keeps the feature invisible until launch, with an allow-list for Homeside. Phase 0 needs neither: it uses only existing roles and features.

### 8.3 Phased rollout

Each phase ships on its own and changes nothing for existing self-managed HOAs.

| Phase | Ships | Migration | Visible to |
|---|---|---|---|
| **0. Homeside-ready, no new tables** | Lift the 20-org cap and the lazy searchable switcher (branch `claude/org-switcher-scale`). Platform admin creates each HOA org by hand (existing `apps/hoa/src/app/admin/tenants` tooling). Board invites Homeside staff with existing roles. Each HOA pays itself. Free-text "managed by" footer line. 300-org fixture and measurements. | none | Homeside and its HOAs only |
| **1. Groundwork** | Permission module (default-deny), role inventory and generated test harness, flags. | none | no one |
| **2. Core tenancy** | Tables, `manager` role, per-area policies, seat bindings, audit, verify and rollback scripts. Manager replaces the borrowed board powers for Homeside's staff. | **0083** | allow-listed companies |
| **3. Company signup, add-an-HOA, portfolio** | Company sign-up, add-HOA wizard, staff invites, assignment, portfolio, "working as" bar. | none | allow-listed companies |
| **4. Agreements for existing HOAs** | Invite and accept, board confirmation and timeout, end agreement, handover, leaving checklist, board release, "managed by" lines. **Gated on lawyer approval.** | none | managed boards |
| **5. Company-pays billing (deferred)** | Only when a customer asks. | **0084** | companies |
| **6. Scale** | Bulk CSV onboarding, rollup if needed, platform admin Companies tab. | 0085 optional | companies |

---

## 9. Question 8: risks and open questions

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | A stale `manager` seat leaves a former company with access. | The control is the database: seat bound to its agreement by foreign key with cascade, check constraint and the end-of-agreement trigger (11.2). The nightly sweep is only an alarm that pages if the control failed. |
| R2 | A manager is allowed an action reserved for the board (roster, bank, second signature). | Separate helper `auth_manager_can`, per-area and level opt-in, generated test over every policy and role check (11.1), security floor in code (3.2). |
| R3 | Company-paid subscriptions break the unique `stripe_customer_id` and the webhook lookup. | Deferred (section 7). |
| R4 | The 20-membership ceiling hides orgs. | Phase 0, with 25, 150 and 300 org tests (11.3). |
| R5 | A company claims an HOA it does not manage. | Attestation, board confirmation before payments, mailed letters or pro invites, 30-day timeout (11.7), platform-admin freeze. |
| R6 | A manager acts in the wrong HOA. | Persistent "working as" bar, searchable switcher with recents. |
| R7 | Email deliverability at volume on one sending domain (a Gmail rejection is under investigation). | Sending address unchanged by this design. |
| R8 | Inngest Hobby cap (50,000 runs a month). | Section 11.4: measured table and a go/no-go gate. |
| R9 | Portfolio slow or leaky at hundreds of HOAs. | Section 11.3. |
| R10 | Legal: delegated authority and notices differ by state (Georgia first). | Lawyer review is a hard gate before Phase 4. |
| R11 | Resident data exposure to company staff. | Seats per HOA only, portfolio function returns no resident data (11.3), audit visible to the board. |
| R12 | Departing staff or company leaves live OAuth, Plaid or Stripe links, and author names vanish from rows. | Section 11.5. |
| R13 | Phase 0 gives Homeside board powers. | Accepted knowingly for one hand-onboarded customer (decision 1); ends when Phase 2 ships. Their staff are named in an owner-visible list. |

### Smaller open questions

1. Trial: a free 30 days per HOA as today, or one trial for the whole company portfolio?
2. Is there a read-only company role (for example an accountant at the company), or only admin and manager?
3. Does a company get a named support contact? Affects how Homeside is onboarded.
4. Should company staff be able to keep private notes about an HOA that the HOA cannot see? Not in v1 unless wanted.
5. Volume discount tiers (illustrative only: 10, 15, 20 percent at 10, 25, 50 HOAs), needed only when company-pays is built.
6. How many days of grace a company-paid HOA gets to add a card after the company leaves (suggest 30), again only when company-pays is built.

---

## 10. Phased implementation plan

Sizes: S under half a day, M about a day, L two to three days. Follow the repo rules: a builder, a tester and an independent reviewer per task; run `pnpm typecheck`, `pnpm test:unit` and the `apps/hoa` build before pushing; migrations go to the owner to apply, then the flag flips.

### Phase 0: Homeside-ready (no migration)

| ID | Task | Files | Size |
|---|---|---|---|
| T1 | Lift the 20-org cap: resolve the active org by a direct `.eq('org_id', cookieOrg)` read and page the list. Tests at 25, 150, 300. (In flight on `claude/org-switcher-scale`; confirm it covers `getUserHoaOrgs` and `getMembershipRole`.) | `apps/hoa/src/lib/orgs.ts`, `apps/hoa/src/lib/orgs.test.ts`, `apps/hoa/src/app/actions/set-active-org.ts` | M |
| T2 | Lazy searchable switcher and recents. | `apps/hoa/src/components/layout/OrgSwitcher.tsx` | M |
| T3 | Audit of RLS-only list queries without an org filter (the 69 `limit(1)` files and list pages), fixed where a multi-org user would see mixed rows. | `apps/hoa/src/app/**`, `apps/hoa/src/lib/**` (inventory first) | L |
| T4 | 300-org test fixture and a measurement of `auth_org_ids()` with 300 elements. | `tests/integration/` fixture, a note in this doc | M |
| T5 | Free-text "managed by" footer line in email and letters, settable by the board. | `apps/hoa/src/lib/email/shell.ts`, `apps/hoa/src/lib/mailed-letters/`, settings page | M |
| T6 | Inngest usage table measured from the dashboard; go/no-go sheet. | this doc, `docs/owner-actions.md` | S |
| T7 | Runbook for the platform admin to create and hand over an HOA org, a list of Homeside staff holding board powers, and the rule that a narrower split means inviting staff as `board` only where the HOA is comfortable, otherwise waiting for Phase 2. | `docs/` runbook, `apps/hoa/src/app/admin/tenants/` | S |

### Phase 1: Groundwork (no migration)

| ID | Task | Files | Size |
|---|---|---|---|
| T8 | Default-deny permission module and the role inventory as data. | `apps/hoa/src/lib/roles.ts`, `apps/hoa/src/lib/management/permissions.ts` (new) and test | M |
| T9 | Flag files and UI hide switch, all false. | `packages/db/src/m17.ts`, `packages/ui/src/` | S |
| T10 | Generated test: enumerate every policy and every role check, assert the manager result for every area and level (11.1). Runs "red" against today's tree to list what must be opted in. | `tests/integration/role-matrix.test.ts` (new) | L |

### Phase 2: Core tenancy (migration 0083, flag M17)

| ID | Task | Files | Size |
|---|---|---|---|
| T11 | Migration 0083, verify and rollback scripts. | `migrations/0083_management_companies.sql`, `migrations/verify-0083-management-companies.sql`, `migrations/rollback-0083.sql` | L |
| T12 | Per-area policies using `auth_manager_can` on the opted-in tables only, plus the `prepare` propose function over `approval_requests`. | in 0083 | L |
| T13 | App guards: `Role`, `getCurrentUserRoleInOrg`, `requireBoardOrAdmin`, and the guards named in 11.1 learn `manager` explicitly. | `apps/hoa/src/lib/auth.ts`, `roles.ts`, the files in 11.1 | L |
| T14 | Seat integration tests: invites, queued sends, concurrent grant, cascade on end, expiry (11.2). | `tests/integration/management-seats.test.ts` | L |
| T15a | Responsibility matrix: presets, versioning, propose and accept, board-alone reduce, pure `managerCan`, per-request cache. | `apps/hoa/src/lib/management/responsibilities.ts` (new) and test, `apps/hoa/src/lib/management/presets.ts` | L |
| T15 | Audit writers, actor-name snapshots, type regeneration only after 0083 is applied (see the `gen:types` footgun). | audit writer (find first), `packages/db/src/database.types.ts` | M |

### Phase 3: Company, add-an-HOA, portfolio

| ID | Task | Files | Size |
|---|---|---|---|
| T16 | Company sign-up and record creation (allow-listed). | `apps/hoa/src/app/(auth)/management-signup`, `apps/hoa/src/lib/management/companies.ts` | M |
| T17 | Staff invites and assignment, primary contact. | `apps/hoa/src/lib/management/staff.ts`, `apps/hoa/src/app/(portfolio)/staff/` | M |
| T18 | Add-an-HOA wizard (creates org, association, active agreement, attestation). | `apps/hoa/src/app/(portfolio)/communities/new/`, `apps/hoa/src/app/onboarding/actions.ts` (extract shared create) | L |
| T19 | Roster import and board invite from the wizard. | `apps/hoa/src/app/admin/import-units/actions.ts`, `(dashboard)/properties/import/` | M |
| T20 | Portfolio page on `company_portfolio_summary`, "working as" bar. | `apps/hoa/src/app/(portfolio)/portfolio/page.tsx`, `apps/hoa/src/lib/management/portfolio.ts` | L |

### Phase 4: Agreements for existing HOAs (gated on lawyer approval)

| ID | Task | Files | Size |
|---|---|---|---|
| T21 | Invite a company, plain-language accept screen, from either side. | `apps/hoa/src/app/(dashboard)/settings/management/`, `apps/hoa/src/lib/email/` | L |
| T22 | End agreement, read-only handover, invite and pending-send revocation, departing-company checklist and export (11.5). | `apps/hoa/src/lib/management/agreements.ts`, settings page | L |
| T23 | Board confirmation gate and 30-day timeout; board release for owner-facing actions (11.6, 11.7). | `settings/online-payments/`, `lib/mailed-letters/config.ts`, `lib/professionals/guard.ts` | L |
| T23a | Matrix screen for board and company: presets, per-cell edit, pending changes, history. | `apps/hoa/src/app/(dashboard)/settings/management/responsibilities/` | L |
| T24 | Board activity view; "managed by" lines now driven by the agreement. | `settings/activity/`, `lib/email/shell.ts` | M |

### Phase 5 (deferred) and Phase 6

| ID | Task | Files | Size |
|---|---|---|---|
| T25 | Company-pays billing, only when asked: 0084, webhook lookup by subscription id, company billing page, discount. | `migrations/0084_company_billing.sql`, `packages/billing/src/webhook.ts`, `checkout-v2.ts`, `pricing-v2.ts` | L |
| T26 | Bulk CSV onboarding. | `apps/hoa/src/app/(portfolio)/communities/import/` | L |
| T27 | Platform admin Companies tab and freeze switch. | `apps/hoa/src/app/admin/tenants/`, `lib/platform-admin.ts` | M |
| T28 | Rollup table (0085) only if measured slow. | `migrations/0085_portfolio_rollup.sql` | M |

**Total:** 30 tasks: 15 large, 12 medium, 3 small. Phase 0 alone is roughly one to two weeks and needs no owner migration step.

---

## 11. Hardening added after the architecture review

### 11.1 Making `manager` safe, per area and level (replaces "RLS works unchanged")

**Rule.** Never map `manager` into `auth_is_board_or_admin`. The separate helper is now **`auth_manager_can(org, area, level)`**: true when the caller holds a manager seat in `org` (unexpired, agreement active) and the matrix of the agreement that issued the seat gives the company at least `level` in `area`. Each opted-in policy names its area and level, for example `violations_fines` + `view` for reads and `violations_fines` + `act` for direct writes. A table not opted in behaves as today, so a manager is denied.

**Why.** Mapping a manager in would give them the `org_members` write policies at `migrations/0071_m6_roles.sql:187-208` (add and remove board members and professionals) and the second sign-off on money approvals (`0071` around line 66). Both sit in the security floor (3.2) and are never reachable from any cell.

**How `prepare` works.** Tables mostly have no draft state, so SQL policies grant a manager `view` and `act` only. `prepare` is delivered by a `SECURITY DEFINER` propose function that stores the proposal in `approval_requests` (migration 0060) tagged with area, agreement and author; a board member's release executes it. The release check refuses a releaser who is a manager. Raising a level from `prepare` to `act` therefore changes which path a manager's request takes, nothing else.

**Reading the matrix.** `auth_manager_can` is a `STABLE` function doing one indexed lookup from `org_members.source_agreement_id` to `agreement_responsibilities` (11.8), so it is evaluated once per statement. In the app, the matrix is loaded once per request in the same React `cache` pattern as `membershipRows` in `apps/hoa/src/lib/orgs.ts`, and every guard calls a pure `managerCan(matrix, area, level)`.

**Inventory of places that must be reviewed (from the architecture review; line numbers are the reviewer's and are re-checked in task T10):**

| Kind | Where |
|---|---|
| Inlined `role IN ('admin','board')` in migrations | `0012:228-255`, `0040:134`, `0045:197`, `0046:182`, `0051:195`, `0070:190`, `0071:949`, `0071:233`, `0071:1051` |
| Policies on `org_members` writes | `0071:187-208` (must exclude `manager`; floor) |
| App guards | `lib/auth.ts` `getCurrentUserRoleInOrg` (about lines 27-30) and `requireBoardOrAdmin` (about 57); `lib/approvals-inbox/model.ts:317`; `lib/community-board/rules.ts:26`; `lib/ga-registration/model.ts:357`; `lib/contact-updates/apply.ts:70`; `lib/board-in-app-notify.ts:23`; `lib/communications/audience.ts:714` |

**Generated test (task T10).** A test reads the live catalog (`pg_policies`, function bodies) and the TypeScript guards, enumerates every policy and every role check, and, for a `manager`, asserts the result **for every area and level combination**: allowed exactly where the opt-in file maps that check to an area and a level at or below the one tested, denied otherwise, and always denied for floor items. A new policy or guard that mentions a role without a mapping line fails CI. Fixtures cover each preset and each single-cell change.

**Who creates and removes seats.** Only service-role agreement functions create or delete `manager` rows. The 0071 insert and update policies exclude `manager`, and a guard trigger rejects any manager insert, update or delete not coming from those functions, even from `admin`. Matrix changes also go only through service-role functions, never through direct table writes.

### 11.2 Binding each seat to its agreement

- `CHECK (role <> 'manager' OR source_agreement_id IS NOT NULL)`.
- `source_agreement_id` is a foreign key to `management_agreements` with `ON DELETE CASCADE`.
- The grant function takes `SELECT ... FOR UPDATE` on the agreement row so a seat cannot be granted while the agreement is ending.
- Manager seats carry their own expiry in `access_expires_at`, the pattern from `0071:156-157`; the read-only handover is the same column with a shorter date and a read-only flag.
- Ending an agreement, in the same transaction, deletes the seats, revokes invites the manager created, and cancels pending sends (queued emails, letters and scheduled communications) authored by those seats.
- The end-of-agreement trigger is the control. The nightly sweep is only an alarm that reports any seat without an active agreement.
- Integration tests: invites created by a manager are dead after the end; a queued send is cancelled; two concurrent grants against an ending agreement end with no seat; cascade removes seats when an agreement row is deleted.

### 11.3 Scale for 300 organizations

- Resolve the active org with a direct `.eq('org_id', cookieOrg)` rather than scanning a capped list (T1).
- A lazy, searchable switcher (T2) that loads names on demand.
- Measure `auth_org_ids()` with a 300-element result and every policy using `= ANY(auth_org_ids())`; record numbers in this doc (T4). If slow, cache the id array per request.
- Audit list queries that depend on RLS alone with no `org_id` filter. With one org per user that was invisible; with 300 a missing filter returns rows from many HOAs mixed together. The 69 files containing `.limit(1)` are the first sweep (T3).
- A 300-org fixture in the integration suite.
- **Portfolio summary function:** `company_portfolio_summary()` returns rows only for HOAs where the caller's company has an active agreement **and** the caller is assigned (or is a company admin), and returns counts and statuses only: no resident names, addresses, balances per person or message text.

### 11.4 Inngest Hobby budget

The plan allows 50,000 runs a month and at the limit every job stops, including dues reminders and late fees (`docs/releases/2026-10-30-0745-background-job-schedule.md`). Baseline from the cron declarations in `packages/jobs/src` (starts only, before event-driven runs and any per-org fan-out):

| Schedule | Jobs | Runs a month |
|---|---|---|
| every 5 minutes | `communications-scheduled`, `mailbox-sync` (first) | 17,280 |
| every 15 minutes | `mailbox-attachments` | 2,880 |
| every 30 minutes | `mailbox-reconcile`, `mailbox-sync` (second), `mailbox-reply-embeddings` | 4,320 |
| every 4 hours | `plaid-sync` | 180 |
| daily (13 jobs: digest, late fees, pm late fees, dues reminders, autopay, billing renewal, band sync, poll results, vendor COI, recurring entries, eviction reminders, wizard draft reminders, AI spend alert) | | about 390 |
| weekly | `weekly-analytics`, `state-law-refresh` | about 9 |
| **Cron starts total** | | **about 25,000** |

That matches the release note ("usage drops to about half"). What I did not trace, and task T6 must measure from the Inngest dashboard: whether the mailbox and digest jobs fan out one run per org, whether steps count as executions, and how many event-driven runs come on top. Until measured, the table shows only headroom of roughly 25,000 runs. Rule: **do not onboard past 20 HOAs, and gate 100 HOAs, on measured headroom or an upgraded plan.** Any new job must add its row to this table before it ships.

### 11.5 Leaving: people, rows and connections

- **Actor-name snapshots.** Author foreign keys are `ON DELETE SET NULL` (see `0007`), so when a manager leaves their name vanishes from rows they wrote. Rows authored by a manager seat store a snapshot of the actor's display name and company at write time.
- **Departing-company checklist** shown to both sides at the end of an agreement: open items the company still owns, scheduled and queued sends cancelled, invites revoked, connections to transfer or revoke, and the export below.
- **Export on leaving:** the HOA gets the existing data export (`apps/hoa/src/lib/data-export/`) plus the agreement history. The company gets an export of its own activity log for the HOA.
- **Company-level assets** (templates, vendor lists, letterhead) are **copy-on-use or out of scope**: when a manager uses a company template in an HOA it is copied into the HOA and belongs to it; nothing is shared by reference, so nothing is lost or leaked when the agreement ends.
- **Connections made in a manager's session** (Gmail OAuth for the shared mailbox, Plaid bank links, Stripe Connect prompts): each connection records who created it. At the end of an agreement the list is shown and each is revoked or transferred to a board member. Stripe Connect and bank details are blocked to managers by design, so those stay with the treasurer; mailbox OAuth and Plaid are the ones to check.

### 11.6 Board release for owner-facing manager actions

Letters, fines and notices that change an owner's position (violation fines, mailed letters, collection steps) need a **board release** from a board member before they go out, when sent by a manager. Releases are logged. Whether this is on by default or a per-HOA setting is part of decision 2; this is now simply the `prepare` level (section 3.2): wherever the matrix says `prepare`, owner-facing items wait for board release; where it says `act`, the board has chosen to let the company send directly. Recommended preset default: `prepare` for violations, fines, collections and letters.

### 11.7 Rules for edge cases

- **Role precedence.** If company staff are also a resident or board member of a managed HOA, they hold the highest of their own roles there, and the audit trail records the capacity (`manager`, `board`, `resident`) of each action.
- **Overlap.** One active management company per HOA. A second invitation is refused until the first agreement ends; a switch is end-then-start, never two at once.
- **Unconfirmed company-created HOA.** `confirm_by` is 30 days after creation. If the board has not confirmed by then, the HOA is frozen: managers lose write access (the board, if any has joined, keeps it), a notice goes to the company admin, and the platform admin can review. Online payments and mailed letters stay off in the meantime.
- **Lawyer review as a gate.** Phase 4 does not launch until a lawyer has approved the attestation text, the "on behalf of the association" signature wording and the accept screen for Georgia.
- **The dormant `organization_type='management_company'`.** The company is its own table, so this value is **unused and left alone** (dropping a CHECK value gives no benefit and risks the platform-admin badge at `apps/hoa/src/app/admin/tenants/[id]/page.tsx:63`). Migration 0083 documents it as reserved and unused.

---

### 11.8 Data model for the matrix, and pricing between the parties

**Choice: one row per agreement and area, plus an append-only change log, not a jsonb blob.**

- `agreement_responsibilities (agreement_id, area, level)`, primary key `(agreement_id, area)`, `CHECK` on the 13 area names and on the four levels. The current state. No row means `none`.
- `agreement_responsibility_changes (id, agreement_id, version, area, old_level, new_level, status, proposed_by, proposed_by_side, accepted_by_board, accepted_by_company, applied_at)`, append-only (no update or delete policy; status moves `pending` to `applied` or `declined` through service-role functions). `management_agreements.matrix_version` increments on each applied change.
- A board reduction (and a company self-reduction) writes a change and applies it in one transaction; an increase stays `pending` until both sides have accepted.

**Why rows.** The database itself enforces valid areas and levels (a typo in jsonb silently grants or denies nothing); `auth_manager_can` is a single indexed lookup in the hot path of every policy; each change is naturally one auditable line ("board reduced violations from act to view") rather than a diff of two documents; and adding an area is a deliberate migration, so a new app feature starts closed. The cost is more rows (13 per agreement, trivial) and a service-role function for writes. A jsonb column would be shorter to write but loses all four properties.

**What the parties charge each other is theirs.** HomeownerHub does not bill, mediate or display the company's management fee or how it varies with the split. The agreement has an optional free-text `service_notes` field for the parties' reference only; nothing reads it. Our own subscription is per HOA as in section 7.

---

## Appendix: facts that could not be settled from the code

- The role-check inventory in 11.1 and the Inngest fan-out question in 11.4 come from the architecture review and a cron scan; task T10 re-verifies every line number, and task T6 measures actual Inngest usage.
- The exact audit-log writer location was not traced; task T6 starts there.
- Whether the matching of Stripe events to orgs depends only on customer id is inferred from `webhook.ts:224`; task T21 must confirm it.
- `docs/` and `apps` contain no prior mention of Homeside or management company onboarding beyond the schema comment, so the Homeside contract terms (who signs, who pays) are an owner input.
