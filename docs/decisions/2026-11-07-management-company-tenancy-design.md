# Management companies as customers: tenancy design

**Date:** 2026-11-07 · **Status:** Proposed, needs owner decisions (section 0) · **Scope:** design only, no product code, no migration applied. Everything below was checked against the code at the tip of `claude/quality-oracle` on 2026-11-07. File and line references are to that tip.

---

## 0. One-page summary

**The ask.** A management company (for example Homeside) that runs tens or hundreds of HOAs must be able to sign up, put its staff in the system, and onboard new HOAs under its account. Many self-managed HOAs and many management companies must live side by side. HomeownerHub is never in an HOA's money flow.

**Recommendation: keep every HOA as its own tenant, and add a management company as a new kind of account that is linked to HOAs by an agreement (option B in section 2).**

In plain words:

- An HOA stays exactly what it is today: its own workspace, its own data, its own billing, its own bank connection. Nothing about a self-managed HOA changes.
- A management company is a new account type. It has staff, a portfolio page, and a list of HOAs it manages.
- The link between a company and an HOA is a recorded **management agreement** (pending, active, ended). An active agreement gives the company's assigned staff a "manager" seat inside that HOA's workspace. Ending the agreement removes those seats in one step.
- The HOA owns its records the whole time. Switching companies, or going back to self-managing, moves nothing, because the data never lived in the company.

**Why this and not "one company org holding many associations".** The database was drawn for that second shape (`migrations/0004_v1_schema_phase2a.sql:27-36`), but the application was not. 110 files call `getPrimaryAssociation`, which silently picks the first association by name (`apps/hoa/src/lib/association-setup.ts:77-95`). Making a company hold many HOAs inside one tenant means touching every one of them, and every missed spot is a cross-HOA data leak. Option B keeps "one organization has exactly one association" true, so those 110 files do not change. It also makes "an HOA leaves its manager and keeps everything" a non-event, and it keeps Stripe Connect one account per association with the HOA as merchant of record, as already designed.

**What it costs.** One new set of tables, one new role (`manager`), a portfolio page, a company-aware organization switcher (today's switcher quietly stops at 20 organizations, section 1.4), and a company billing option. 26 tasks over 6 phases (0 to 5), each phase shippable alone, and the first customer-visible phase needs one migration.

### Decisions the owner must make

| # | Decision | My recommendation |
|---|---|---|
| D1 | **Tenancy shape.** Each HOA its own tenant, linked to a company by agreement (B), or one company tenant holding many associations (A)? | **B.** |
| D2 | **Who pays.** The HOA pays its own subscription by default, with an option for the company to pay for the HOAs it manages. Or company-pays only? | **Both, HOA pays by default**, company-pays as a switch per HOA. |
| D3 | **Company volume discount.** Is there one, and from how many HOAs? | **Yes, a percentage off per HOA by portfolio size** (illustrative 10 / 15 / 20 percent at 10 / 25 / 50 HOAs). Numbers need your call. |
| D4 | **What happens when an agreement ends.** Immediate loss of access, or an optional short read-only handover? | **Immediate by default**, with a board-chosen read-only handover of up to 30 days. |
| D5 | **Who may start the link.** Can a company create an HOA and add the board later (company-led), with the board confirming afterwards? | **Yes**, with a signed-agreement attestation from the company and a confirmation step for the board. Until the board confirms, the company cannot turn on online payments or send mailed letters. |

Full list of open questions is in section 9.

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
| **RLS complexity and isolation** | Every policy is `org_id = ANY(auth_org_ids())` (`0070`). A company staff member in the company org would see all 100 HOAs, and "only my assigned HOAs" needs a second layer on every table. Migration 0070 and 0081 were large, careful efforts to make exactly this single layer trustworthy; A would reopen all of it. | **No policy changes.** A manager is a member of exactly the HOA orgs they are assigned to, so `auth_org_ids()` already scopes them. Two helper functions get a `manager` mapping. | As A plus extra. |
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
2. **Access is materialized as `org_members` rows.** When an agreement is active and a company staff member is assigned to the HOA, a row `(org_id = HOA, user_id = staff, role = 'manager', source_agreement_id = agreement)` exists. All 22+ policies and the helpers that read membership then work without edits. Ending the agreement or the assignment deletes the row in the same transaction.
3. **Fail closed.** Because the seat is a real row, a bug in the new company tables cannot widen access: no row, no access. The reverse bug (seat not removed) is guarded by a database trigger on agreement end, plus a nightly check that reports any `manager` seat whose agreement is not active (cheap, single query, no Inngest cost beyond a daily run).

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

### 3.2 What each can see and do (inside one HOA)

"Manager" means a company staff seat. The aim: a manager can run day-to-day operations like a board officer, but cannot take decisions that belong to the association itself.

| Area | Board admin | Board member | Manager (company) | Company admin outside any HOA |
|---|---|---|---|---|
| Residents, units, violations, ARC, tickets, announcements, vendors, calendar | full | as today | **full** | nothing (portfolio totals only) |
| Accounting: read books, enter invoices, reconcile | full | as today | **full** | none |
| Approve money above the dual-control amount | full | per role | **cannot be the only approver** (needs a board sign-off; the dual-control rule in 0071 already supports this) | none |
| Letters, email, SMS to residents | full | as today | **full** (sent as the HOA, section 6) | none |
| Stripe Connect onboarding, bank details, payout changes | treasurer or admin | treasurer | **blocked** (per `docs/decisions/2026-10-31-online-dues-payments-design.md` 1.3) | none |
| Governing documents, board roster, officer titles | full | read | read; edit only if board allows | none |
| Invite or remove board members | full | none | **blocked** | none |
| Invite CPA or attorney | full | none | **blocked** | none |
| End or change the management agreement | full | none | **blocked** | can end from the company side |
| HOA subscription and card | full | none | only if company is the payer | billing for company-paid HOAs |
| Voting, polls | as today | as today | run and tally; cannot vote | none |
| Board-only items (for example vendor insurance reminders, which are board-only by decision `docs/decisions/2026-10-20-vendor-coi-reminders-board-only.md`) | yes | yes | **no, unless the board ticks "share with manager"** | none |

Anything not listed defaults to **blocked for manager** until deliberately opened; that default is the safe direction. The permission table lives in one pure TypeScript file so tests can pin it, in the same style as `apps/hoa/src/lib/roles.ts`.

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
4. **Invite the board:** the existing member invite flow; the email says "Homeside has set up a community workspace for Creek Valley HOA. You are being invited as president." The first board person to accept becomes `admin` of the HOA org and the board confirms the agreement (D5).
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

- Default (D4): all `manager` seats for that agreement are removed immediately, in one transaction.
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

### Recommendation (D2)

- Keep one subscription **per HOA**, each priced on its own home count, so the existing price tables, trial, webhook and "doors" logic are unchanged.
- Add a payer on the HOA: `self` (default) or `company`. For `company`, the subscription is created on the company's Stripe customer.
- Because `orgs.stripe_customer_id` is unique and would be shared by many HOAs under a company customer, company-paid subscriptions do **not** write the company's customer id into `orgs`. The company's customer id lives on `management_companies`; the HOA org keeps only `stripe_sub_id` and a `billing_payer` marker. This is verified work for the billing owner: the webhook (`packages/billing/src/webhook.ts`) matches events to an org by customer id today (`:224` area), so it needs a second lookup by subscription id. Treated as task B2 and a risk R3.
- Company billing page: one table, one row per HOA with its plan band, price and renewal date; one total; invoices from Stripe.
- **Volume pricing (D3):** a percentage off per HOA by the number of active company-paid HOAs, implemented as a Stripe coupon or a second price table applied at checkout, not by changing the band prices. Illustrative only: 10 HOAs, 10 percent off; 25, 15 percent; 50 and above, 20 percent. At about $2 to $5 variable cost per community (one-plan doc), a 20 percent cut on the lowest band ($59) still leaves a wide margin. The numbers are yours to set; the prices have never been proven with paying customers (one-plan doc, "Costs we accept"), so I recommend keeping the discount modest until real customers exist.
- Trial: each new HOA gets its own 30-day trial from creation, consistent with today. A company may prefer one trial for the whole portfolio; that is question Q2.
- **Never in the money flow.** Subscription billing is HomeownerHub's own fee. HOA dues and fees are paid by residents straight into the association's own Stripe Standard account. The company pays HomeownerHub for software only. Neither HomeownerHub nor the company touches HOA funds through us.

---

## 8. Question 7: migration and rollout plan

### 8.1 Migrations (applied by Asaf, by hand)

Numbering: the last applied migration is `0082_money_integrity.sql` (flag M16, `packages/db/src/m16.ts`). `0080` and flag `M15` are reserved by the unbuilt vendor bill pay design (`docs/backlog.md:2083`, `docs/backlog.md:2509`: "There is no M15"). I leave them alone. Next free numbers are therefore **0083** and **M17**. Re-check the numbers when work starts, because parallel sessions also add migrations.

| Migration | Flag | Contents | Needed by phase |
|---|---|---|---|
| `0083_management_companies.sql` | **M17** | Tables `management_companies`, `management_company_members` (role `admin` or `manager`), `management_agreements` (status `pending`, `active`, `ended`; initiated by; attestation date and person; started, ended, ended by, reason; `board_confirmed_at`; `handover_until`), `management_assignments` (agreement, staff member, primary flag). `org_members.role` CHECK gains `manager`; `org_members.source_agreement_id`. Helper function changes: `manager` counts in `auth_is_board_or_admin` for the operations in 3.2 only (the blocked actions stay `auth_is_admin`). Trigger: ending an agreement deletes its seats. RLS for the new tables. Audit columns `acting_company_id`, `acting_role`. `company_portfolio_summary()`. Idempotent like the others. A matching `verify-0083-management-companies.sql` in the style of `verify-0082-money-integrity.sql`. | Phase 1 |
| `0084_company_billing.sql` | **M18** | `management_companies.stripe_customer_id` (unique), `orgs.billing_payer` (`self` default or `company`), `management_companies.discount_tier` view or function, grace-period columns. Verify file. | Phase 4 |
| `0085_portfolio_rollup.sql` | **M19** (optional) | Only if `company_portfolio_summary()` proves too slow: a cached summary table plus refresh function. Skipped if the live function is fast enough. | Phase 5, only if needed |

Both required migrations are additive: new tables, one widened CHECK, new nullable columns. No existing row changes, so self-managed customers cannot be affected by applying them. CI replays them against the ephemeral database, and the integration suite runs "objects present, flag false", like every other M flag.

### 8.2 Feature flags (M-flag style)

New files `packages/db/src/m17.ts`, `m18.ts` (and `m19.ts` if needed), each a single exported boolean constant with no imports, defaulting `false`, flipped to `true` in a one-line commit after the owner confirms the migration is applied and verified (exact pattern of `m16.ts`, `m14.ts`). Every code path that reads a new column or table checks the flag first. Plus a UI hide switch, `MANAGEMENT_COMPANIES_ENABLED`, in `packages/ui` next to `hubs.ts`, so even with the migration applied the product stays invisible until the owner chooses to launch. An allow-list lets Homeside in first.

### 8.3 Phased rollout

Each phase ships on its own and changes nothing for existing self-managed HOAs.

| Phase | Ships | Migration | Customer-visible |
|---|---|---|---|
| **0. Groundwork** | Fix the 20-membership ceiling, make active-org resolution direct, add the permission table as a pure module. | none | No (bug fix for large multi-org users) |
| **1. Core tenancy** | Tables, `manager` role, RLS helpers, audit columns, verify script, flag M17. No screens. | **0083** | No |
| **2. Company signup, create-an-HOA, switcher, portfolio v1** | Company sign-up, add-HOA wizard, staff invites, assignment, searchable switcher, portfolio, "Working as" bar. Allow-listed. | none (uses 0083) | Only allow-listed companies (Homeside) |
| **3. Agreements for existing HOAs** | Invite and accept for self-managed HOAs, board confirmation, end agreement, handover, activity list, "Managed by" lines and email footer. | none | Boards of managed HOAs only |
| **4. Company billing** | Company-pays, company billing page, volume discount, grace on exit. | **0084** | Companies |
| **5. Scale and polish** | Bulk CSV onboarding, portfolio rollup if needed, reports, company admin tools in platform admin. | 0085 optional | Companies |

---

## 9. Question 8: risks and open questions

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | A stale `manager` seat leaves a former company with access. | Seat is a real row removed by a database trigger on agreement end; nightly check lists any seat without an active agreement; integration test ends an agreement and asserts zero access. |
| R2 | A manager is wrongly allowed an action reserved for the association (bank, board changes). | Default-deny permission table in one pure module with a test per row; helpers keep `auth_is_admin` for reserved actions. |
| R3 | Company-paid subscriptions break the unique `stripe_customer_id` and the webhook's lookup. | Keep the company customer id off `orgs`; add subscription-id lookup in `webhook.ts`; webhook tests extended in `packages/billing/src/webhook.test.ts`. Build the billing phase last. |
| R4 | The 20-membership ceiling (1.4) silently hides orgs. | Phase 0, with a test at 25 and 150 memberships. |
| R5 | A company claims an HOA it does not manage. | Attestation recorded, board confirmation required before payments, mailed letters, or professional invites; the first board accept proves a real person at the association. Platform admin can freeze an agreement. |
| R6 | A manager acts in the wrong HOA. | Persistent "working as" bar, searchable switcher with recents, confirmation text on bulk sends naming the HOA. |
| R7 | Email deliverability at volume (hundreds of HOAs, one sending domain) while a Gmail rejection is under investigation. | Sending address unchanged in this design; revisit per-company sending domains separately. |
| R8 | Inngest Hobby cap (50,000 executions a month) with hundreds of HOAs, since every cron runs per org. | Budget each new job before it ships; keep the nightly seat check to one run for all orgs, not one per org. |
| R9 | Portfolio dashboard slow at several hundred HOAs. | Indexed counts in one function; cached summary table only if measured slow (0085). |
| R10 | Legal: delegated authority and notices differ by state (Georgia first). | Lawyer review of the letter signature wording and the agreement attestation before Phase 3 launches. |
| R11 | Privacy of residents' data across a company's staff. | Seats are per HOA; the audit trail is visible to the board; no company-wide resident search in v1. |

### Open questions for the owner

1. **Q1 (D1).** Confirm option B (HOA stays its own tenant). The cost is a portfolio query and a switcher; the gain is that nothing existing changes.
2. **Q2.** Trial: a free 30 days per HOA as today, or one trial for the whole company portfolio?
3. **Q3.** When a company-paid HOA leaves, how many days of grace to add a card (I suggest 30)?
4. **Q4 (D3).** Discount tiers and whether they apply to monthly and yearly alike.
5. **Q5.** Do you want a lawyer to review the "on behalf of the association" signature wording and the attestation text before Phase 3 (recommended)?
6. **Q6.** Should the company be able to keep private notes about an HOA that the HOA cannot see? Not in v1 unless you want it.
7. **Q7.** Is there a read-only company role (for example an accountant at the company), or only admin and manager?
8. **Q8.** Does a company get its own support level or a named contact? Affects how Homeside is onboarded.
9. **Q9.** Should the dormant `organization_type='management_company'` value be removed later, or left alone? Left alone is safe.
10. **Q10.** Homeside timing: do you want them onboarded by hand through Phase 2 before the public sign-up opens (recommended)?

---

## 10. Phased implementation plan

Sizes: S under half a day, M about a day, L two to three days. Follow the repo rules: a builder, a tester and an independent reviewer per task; run `pnpm typecheck`, `pnpm test:unit` and the `apps/hoa` build before pushing; migrations are given to the owner to apply, then the flag flips.

### Phase 0: Groundwork (no migration)

| ID | Task | Files | Size |
|---|---|---|---|
| T1 | Remove the 20-org ceiling: page the membership list and resolve the active org by direct lookup of the cookie's org. Tests with 25 and 150 memberships. | `apps/hoa/src/lib/orgs.ts`, `apps/hoa/src/lib/orgs.test.ts` (new or extended), `apps/hoa/src/app/actions/set-active-org.ts` | M |
| T2 | Pure permission module: roles, the 3.2 table, default-deny. | `apps/hoa/src/lib/roles.ts`, `apps/hoa/src/lib/management/permissions.ts` (new) and test | M |
| T3 | Flag files and UI hide switch, all `false`. | `packages/db/src/m17.ts`, `m18.ts`, `packages/ui/src/` (new management switch next to `hubs.ts`) | S |

### Phase 1: Core tenancy (migration 0083, flag M17)

| ID | Task | Files | Size |
|---|---|---|---|
| T4 | Migration 0083: tables, role, trigger, RLS, audit columns, summary function. Verify script. | `migrations/0083_management_companies.sql`, `migrations/verify-0083-management-companies.sql` | L |
| T5 | Integration tests: seat granted on assign, removed on end, manager blocked from reserved actions, no cross-HOA read, two companies side by side. | `tests/integration/management-companies.test.ts` (new) | L |
| T6 | Writers for the audit columns; regenerate DB types by hand-adding then checking (see the repo footgun on `pnpm gen:types`, only after 0083 is applied). | `apps/hoa/src/lib/audit*` (find writer), `packages/db/src/database.types.ts` | M |
| T7 | Extend `Role` and the membership read for `manager`. | `apps/hoa/src/lib/roles.ts`, `apps/hoa/src/lib/auth.ts`, `apps/hoa/src/lib/orgs.ts` | M |

### Phase 2: Company, add-an-HOA, switcher, portfolio

| ID | Task | Files | Size |
|---|---|---|---|
| T8 | Company sign-up and company record creation (allow-listed). | `apps/hoa/src/app/(auth)/` new `management-signup`, `apps/hoa/src/lib/management/companies.ts` | M |
| T9 | Staff invites and role assignment. | `apps/hoa/src/lib/management/staff.ts`, `apps/hoa/src/app/(portfolio)/staff/` | M |
| T10 | Add-an-HOA wizard (creates org, association, active agreement, attestation). Reuses onboarding logic. | `apps/hoa/src/app/(portfolio)/communities/new/`, `apps/hoa/src/app/onboarding/actions.ts` (extract shared create) | L |
| T11 | Link roster import and board invite into the wizard. | `apps/hoa/src/app/admin/import-units/actions.ts`, `apps/hoa/src/app/(dashboard)/properties/import/` | M |
| T12 | Searchable switcher and "working as" bar. | `apps/hoa/src/components/layout/OrgSwitcher.tsx`, new `WorkingAsBar.tsx`, layout | M |
| T13 | Portfolio page using `company_portfolio_summary`. | `apps/hoa/src/app/(portfolio)/portfolio/page.tsx`, `apps/hoa/src/lib/management/portfolio.ts` | L |
| T14 | Assignment UI (admin assigns staff to HOAs, primary contact). | `apps/hoa/src/app/(portfolio)/communities/[id]/` | M |

### Phase 3: Agreements for existing HOAs

| ID | Task | Files | Size |
|---|---|---|---|
| T15 | Invite a company from HOA Settings, accept screen in plain language, from either side. | `apps/hoa/src/app/(dashboard)/settings/management/` (new), email template under `apps/hoa/src/lib/email/` | L |
| T16 | End agreement from both sides, optional read-only handover, seat removal check. | `apps/hoa/src/lib/management/agreements.ts`, settings page | M |
| T17 | Board confirmation gate: block online payments, mailed letters, pro invites until confirmed. | `apps/hoa/src/app/(dashboard)/settings/online-payments/`, `apps/hoa/src/lib/mailed-letters/config.ts`, `apps/hoa/src/lib/professionals/guard.ts` | M |
| T18 | Activity view for the board (management company filter). | `apps/hoa/src/app/(dashboard)/settings/activity/` | M |
| T19 | "Managed by" line in email footer, letters, and Settings. | `apps/hoa/src/lib/email/shell.ts`, `apps/hoa/src/lib/mailed-letters/`, tests | M |

### Phase 4: Company billing (migration 0084, flag M18)

| ID | Task | Files | Size |
|---|---|---|---|
| T20 | Migration 0084 and verify script. | `migrations/0084_company_billing.sql`, verify file | M |
| T21 | Company-pays checkout, payer switch per HOA, webhook lookup by subscription id. | `packages/billing/src/checkout-v2.ts`, `packages/billing/src/webhook.ts` and tests, `apps/hoa/src/lib/billing.ts` | L |
| T22 | Company billing page and volume discount. | `apps/hoa/src/app/(portfolio)/billing/`, `packages/billing/src/pricing-v2.ts` (discount helper, band prices untouched) | L |
| T23 | Exit grace when a company-paid HOA leaves. | `packages/billing/src/billing-status.ts`, `apps/hoa/src/components/billing/BillingStatusBanner.tsx` | M |

### Phase 5: Scale and polish

| ID | Task | Files | Size |
|---|---|---|---|
| T24 | Bulk CSV onboarding of HOAs. | `apps/hoa/src/app/(portfolio)/communities/import/` | L |
| T25 | Platform admin Companies tab and freeze switch. | `apps/hoa/src/app/admin/tenants/`, `apps/hoa/src/lib/platform-admin.ts` | M |
| T26 | Nightly stale-seat check; rollup table if measured slow (0085). | `apps/hoa/src/lib/management/seat-check.ts`, optional `migrations/0085_portfolio_rollup.sql` | M |

**Total:** 26 tasks, 8 large, 17 medium, 1 small. Roughly 5 to 7 weeks of one agent team working in parallel on disjoint files, with the owner steps being two or three migration applies and two flag flips.

### Owner actions this will create (for `docs/owner-actions.md`, when built)

Apply 0083 (then flip M17), apply 0084 (then flip M18), choose D1 to D5 now, approve the allow-list for Homeside, and (if company billing is wanted) create the discount coupons in Stripe.

---

## Appendix: facts that could not be settled from the code

- Whether `auth_is_board_or_admin` can be extended without touching other callers is assumed from its role in `0070`/`0071`; the migration author must read its current body in `0012` and `0071` before editing.
- The exact audit-log writer location was not traced; task T6 starts there.
- Whether the matching of Stripe events to orgs depends only on customer id is inferred from `webhook.ts:224`; task T21 must confirm it.
- `docs/` and `apps` contain no prior mention of Homeside or management company onboarding beyond the schema comment, so the Homeside contract terms (who signs, who pays) are an owner input.
