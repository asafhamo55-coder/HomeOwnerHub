# Properties module: product research and backlog

**Date:** 2026-10-17. **Scope:** `apps/hoa` only. **Author:** PM pass, research only. No code was changed.
**Why now:** the owner is very unsatisfied with Properties. This doc says what the module has to do for the business, what it does today (with file references), and what to build, in order.

---

## 0. The headline finding

**The app has two property records, and the Properties screens write to the one the rest of the product doesn't read.**

| What | Keyed on | Source |
|---|---|---|
| `/properties` list, 360 detail, new/edit forms, CSV export | `hoa_properties` (flat `owner_name/email/phone`) | `lib/properties/index.ts:44-157`, `properties/export/route.ts:61` |
| Residents on the 360 page | `property_residents.property_id → hoa_properties` | `migrations/0017…:87`, `lib/property-residents.ts` |
| Violations | `hoa_violations.property_id → hoa_properties` | `properties/[id]/page.tsx` |
| Dues and assessments, payments, ledger | `units` | `lib/assessments.ts:88-104` ("Add units before generating assessments.") |
| Announcements and audiences (`everyone`, `owners_only`, `late_on_dues`…) | `units` + `ownerships` + `tenancies` | `lib/communications/audience.ts:23-34, 228-240` |
| Resident portal access ("units you own") | `ownerships` | `lib/resident.ts:118`, `lib/members.ts:373-400` |
| ARC, tickets, inbox matching | `units` | `docs/SCHEMA_MAP.md`, `migrations/0028…` header |
| Roster import | `units` / `ownerships` / `tenancies` only | `app/admin/import-units/actions.ts` (platform-admin only) |

The only bridge is `units.legacy_hoa_property_id`. Migrations 0005 and 0028 set it as a one-time backfill, and `migrations/mirror-units-to-hoa-properties.sql` copies the other way by hand. **Nothing keeps the two in sync at runtime**: there's no trigger and no dual-write in `createProperty` or `updateProperty`. The code admits this in `lib/dashboard/setup-checklist.ts:195` ("/properties writes hoa_properties, the CSV import writes units. Either counts.").

What this means for a board:

1. **A board that onboards itself by following the setup checklist breaks dues.** The "Add your properties" step goes to `/properties/new`, which writes only `hoa_properties`. The next step, "Set up dues", then fails with "Add units before generating assessments." Those homes also never get announcements and can't be linked to the portal: `members.ts:380` logs "no units row … /resident link skipped" and carries on.
2. **Editing an owner's email on the property page doesn't change who gets mail.** `updateProperty` patches `hoa_properties.owner_email`, but audiences read `ownerships.owner_email`. The board sees one email, and the notice goes to another (or to nobody).
3. **A sale overwrites history.** Changing the owner name edits the row in place. No `ownerships` row is closed, and the `ownership_changed` event kind exists (`lib/property-events.ts:14`) but nothing ever emits it.
4. **The owner is stored in three places that can disagree:** `hoa_properties.owner_*`, `ownerships`, and `property_residents (role=owner)`.

Each feature on top of this (list view, severity, collections, waiting list) is well built, but they sit on a split foundation. That's the most likely source of the owner's dissatisfaction: the screens look finished, but what you do on them doesn't carry through to the rest of the product.

---

## 1. Personas and jobs-to-be-done

Every job below either starts from a property or owner record, or depends on one.

### Board treasurer
- T1 "Is 14 Oak current? What do they owe, and since when?" (balance, oldest unpaid, plan or collections status)
- T2 "Who is 90+ days delinquent?" Feeds collections, FL voting suspension, and the reminder skip rules.
- T3 "Prepare an estoppel or resale certificate for a closing next week" (FL §720.30851, CA §4525/§4530).
- T4 "Record a sale: the old owner leaves, the new owner arrives, and the balance stays with the lot." Assessments run with the parcel. FL §720.3085(2)(b) makes the buyer jointly and severally liable.
- T5 "Import our roster and opening balances from a spreadsheet, or from CINC, when we leave the management company."
- T6 "Export the roster and the aging for the auditor or the attorney."

### Board president or secretary
- P1 "Who owns 14 Oak, and how do I reach them?" Phone, email, and a **mailing address** if they live off-site.
- P2 "Send a notice to every owner in Phase 2", or on one street or in one building.
- P3 "Annual meeting: who's eligible to vote, how many votes do we need for quorum, and did we mail notice to every owner's address of record?" (FL §720.306: one vote per parcel and quorum by voting interests; CA §5105/§5115: voter list and ballot mailing.)
- P4 "An owner asked to inspect the official records. Give them the roster without the protected fields." (FL §720.303(4)/(5), CA §5200-§5220 membership list with opt-out.)
- P5 "Who has consented to electronic notice?" Under FL ch. 720, electronic notice requires the owner's consent, and the roster must keep the consenting addresses and numbers. CA §4040(b) requires the owner's consent for electronic individual delivery.
- P6 "Send the annual request asking owners to confirm their address for notices" (CA §4041).

### Community manager (small management company)
- M1 Find any owner or lot in under five seconds (⌘K), across several associations.
- M2 Keep the data clean: duplicates, homes with no owner, homes with no email, homes not linked to a unit.
- M3 Track tenants for FL/CA rental rules: lease caps and the waiting list, tenant contact, lease dates, and FL §720.306(1)(h) grandfathering by acquisition date.
- M4 See one lot's full story before a call: dues, violations, ARC, tickets, mail, documents, history.
- M5 Bulk actions: select 30 lots, then message them, tag them, or export them.

### Owner or resident (portal)
- R1 "Update my phone, mailing address and notice preference myself."
- R2 "See my lot's balance, statement, violations and ARC" (partly shipped: BL-006/BL-010).
- R3 "I sold my house. Stop emailing me." Or: "I just bought. Give me access."
- R4 "Register my tenant", where the documents require it.

### Statutory hooks that depend on owner records (verify the exact subsections against official text before quoting in product, per BL-054 practice)
| Obligation | FL ch. 720 | CA Davis-Stirling |
|---|---|---|
| Owner roster with mailing addresses and parcel ID | §720.303(4) official records | §5200 records; §5220 membership list (owner opt-out) |
| Electronic-notice consent kept with the roster | §720.303(4); e-addresses protected from member inspection (§720.303(5)) | §4040(b) consent for electronic delivery; §4055 |
| Annual address solicitation | n/a | §4041 (mailing address, alternate address, whether the home is rented) |
| Estoppel or resale package | §720.30851 (10 business days, fee caps CPI-indexed) | §4525/§4528/§4530 |
| Voting eligibility and quorum | §720.306; §720.305(2) suspension at 90+ days delinquent | §5100-§5145 (voter list, inspector of elections) |
| Rental rules | §720.306(1)(h) amendments apply to owners who acquire later | §4740/§4741 |

**We store none of the following:** mailing address, parcel ID, consent, voting interest, or acquisition date (except `ownerships.valid_from`, which nothing writes on a sale).

---

## 2. Capability map

Legend: ✅ supported well · 🟡 supported poorly · ❌ missing.

| Job | State | Evidence |
|---|---|---|
| P1 Who owns X / how to reach | 🟡 | 360 Owner card shows a single name, email and phone from `hoa_properties` (`[id]/page.tsx` OverviewTab). There's no mailing address and only one owner fits. Import concatenates several owners with " · " (`mirror-units-to-hoa-properties.sql`). |
| T1 Is the lot current | ✅/🟡 | Severity, balance and days overdue come from `hoa_property_list_v` (0051). The list shows the balance, and the Dues and Collections tabs work. They show nothing for a property with no unit link. There's no "good standing" label, and the export has no balance. |
| T2 90+ delinquent list | 🟡 | You can sort by balance, but there's no aging filter. Collections lives in its own module. |
| T3 Estoppel / resale | ❌ | No code (grep for "estoppel" or "resale" finds only a lease-cap template). |
| T4 Record a sale | ❌ | Only an in-place edit (`updateProperty`). It closes no ownership and emits no `ownership_changed`. Old owner portal access isn't revoked. |
| T5 Import roster | 🟡 | `app/admin/import-units` is **platform-admin only**, expects one legacy CSV layout (`tenant_id`, `occupancy_type`…), writes units only, and has no column mapping. BL-031 CINC is blocked on a sample file. The board can only add properties one at a time. |
| T6 Export | 🟡 | `properties/export/route.ts`: address, owner, tenure, notes. It has no balance, residents, mailing address or tenants. The "Needs attention" and "Waiting list" views export **every** home (only tenure filters are forwarded, `PropertiesHeader.tsx:44-49`), and there's no audit row. The full zip export (BL-011) exists in `/settings/data`. |
| P2 Notice to Phase 2 / a street | ❌ | Audience kinds are everyone, owners, tenants, late, violations, specific units and specific residents (`audience.ts:23`). There's no phase, street or tag field on `units` or `hoa_properties`. |
| P3 Voting eligibility / quorum | ❌ | No voting, ballot or quorum code. E-voting is ❌ in the competitor matrix (`2026-10-competitors.md:60`). |
| P4 Records-request roster | ❌ | No roster report and no protected-field redaction. |
| P5 E-notice consent | ❌ | BL-020 (M1) not built. |
| P6 Annual address solicitation | ❌ | — |
| M1 ⌘K find | ✅/🟡 | `lib/search/records.ts:204` matches address, unit and `owner_name`. It doesn't match owner email or phone, residents, tenants or prior owners. |
| M2 Data quality | 🟡 | The "Incomplete" chip exists (`is_incomplete`, which covers missing owner, missing tenure and missing unit link), but nothing on the page fixes an incomplete row, and there's no duplicate detection. `normalize_address` exists (0028) but only the inbox uses it. |
| M3 Tenants / rental rules | 🟡 | Tenure flag, lease cap and waiting list are good (`TenureSelector`, `lib/leases.ts`). But the tenure flag (`hoa_properties.tenure`), `tenancies` and `property_residents(role=tenant)` are three separate records. |
| M4 One lot's full story | 🟡 | The 360 page has Overview, Residents, Mail, Violations, Dues, Collections and History. It has **no ARC, tickets, documents, or announcements sent**. |
| M5 Bulk actions | 🟡 | `bulkSetPropertyTenure` exists (`lib/properties/index.ts:395`). There's no bulk select, message or tag in the list. |
| R1 Owner updates own contact | ❌ | `/resident/account` is read-only (email display). |
| R3 Sold / bought | ❌ | Depends on T4. |
| Add a home | 🟡 | `/properties/new` takes address, unit, owner and notes. It doesn't create a unit, so dues and announcements break (§0). |
| Owner-portal impersonation | ✅ | `EnterPortalButton` (admin, signed token, S-01). |
| Residents CRUD | ✅/🟡 | `lib/property-residents.ts` (board-gated, events logged). An owner added here doesn't become an `ownership`. |

---

## 3. Integration gaps

| Module | Connection today | Gap |
|---|---|---|
| Dues / ledger | Through `units.legacy_hoa_property_id` → `assessments` | Breaks for any property created in-app. Balance doesn't follow a sale, because there's no sale. |
| Violations | `hoa_violations.property_id` (hoa_properties) | Works. Letters need an owner **mailing** address for absentee owners, and we have none. Mailed letters (BL-032) depend on it. |
| ARC / tickets | `units` | Not shown on the 360 page. |
| Communications | `ownerships`/`tenancies` on `units` | They ignore the email the board edits on `/properties`. There's no segment audience, and consent isn't respected (BL-020). |
| Documents | Org-level only | No per-lot file (deed, closing docs, ARC approvals, estoppels). |
| Meetings / voting | None | No voter list, quorum math or notice-mailing proof per owner. |
| Resident portal | `ownerships` | Owners added through `/properties` or the residents form aren't linked. There's no self-service contact update. |
| ⌘K | `hoa_property_list_v` | Owner name only. |
| Setup checklist | Counts either table | Hides the split: both steps go green while dues will fail. |

---

## 4. Positioning

**Why Properties sells.** Every competitor demo opens on the homeowner list, because it's the first screen a treasurer evaluates: is my data in, is it right, can I trust the balance? Our edge is that **one lot record knows everything**: balance, aging, violations with cure clocks, collections stage, lease-cap position, mail threads, and AI drafts, ranked by what needs action. Nobody in the matrix ranks lots by severity. That's the story, and it's only true once §0 is fixed.

**Marketing angles, once delivered:**
- "Move your roster in ten minutes. Upload the CINC or spreadsheet export and we map it, preview it and import it." (Kills the "hard implementation" objection; research §4.)
- "Statute-ready owner records: FL roster, e-notice consent, estoppels in 10 business days." (Compliance angle, consistent with `/legal/compliance`.)
- "Record a sale in one step. The balance stays with the lot, the old owner loses access, and the new owner gets an invite."
- "Every home, one screen, ranked by what needs you."

**Claims that are false or stale today** (add to the BL-042 truth pass):

| Claim | Where | Reality |
|---|---|---|
| "15 min Onboarding" and "Onboarding Agent: shipped" | `apps/marketing/src/app/hoa/page.tsx:36`, `src/lib/workflows.ts:21` | Only documents take 15 minutes. A board can't import its own roster (platform-admin only), and in-app properties don't support dues. |
| "Every outbound email auto-translated to each resident's preferred language" | `hoa/page.tsx:102` | No language preference on any owner or resident record (BL-025 not built). |
| "Your roster, GL, and history can come over when you are ready" | `demo/page.tsx:260` | True only with founder help. |
| "A full one-click export … is on our roadmap" | `pricing/page.tsx:147`, `privacy/page.tsx:29` | **Understated.** BL-011 shipped `/settings/data`. Update the copy. |

---

## 5. Prioritized backlog (PR-01 … PR-14)

Effort: S ≤ 1 agent-day, M 1–3 days, L 3+ days. Migration means the owner applies the SQL by hand (`feedback_migrations_applied_by_asaf`).

### PR-01: One property record. Every home has a unit and a current ownership. **M · migration: yes (backfill + view)**
- **Value:** whatever the board does on Properties carries through to dues, announcements and the portal. It fixes §0 points 1, 2 and 4.
- **Acceptance:**
  - `createProperty` creates `hoa_properties` + `units` (with `legacy_hoa_property_id`) + an `ownerships` row when an owner is given. It runs in one RPC/transaction, and a failure leaves nothing behind.
  - `updateProperty` owner fields write the **current ownership row**. `hoa_properties.owner_*` becomes a read mirror, or the view reads from `ownerships`.
  - A backfill SQL links every unlinked `hoa_properties` row (`has_unit_link = false`) to a new or matched unit via `normalize_address`, and reports counts only.
  - An integration test proves that a property created in-app gets an assessment from `/dues` generate and appears in the `everyone` audience.
  - The setup checklist counts linked units, not "either table".
  - Pre-req: BL-007 write-path inventory (0063 is already applied).

### PR-02: Board self-service roster import (CSV/XLSX, column mapping, dry run, CINC preset). **L · migration: no (after PR-01)**
- **Value:** onboarding without the founder. It absorbs BL-031 and backs the "15 min" claim.
- **Acceptance:**
  - `/properties/import` is board/admin, not platform-admin.
  - Upload xlsx/csv, auto-map columns (with a CINC preset when a sample arrives), and edit the mapping.
  - The dry run shows create/update/skip counts and row-level errors by row number. **No PII in logs.**
  - Commit writes units, ownerships (several owners per lot) and tenancies, and is idempotent on re-import (match on `normalize_address` + unit).
  - Opening balances are optional and become a JE proposal in `/approvals`.
  - An audit row records who imported what (counts).

### PR-03: Record a sale (ownership transfer). **M · migration: no (`ownerships.valid_from/valid_to`, `source`)**
- **Value:** the most common change to an owner record, done correctly and with history.
- **Acceptance:**
  - A "Record sale" action on the 360 page takes a closing date and the new owner(s).
  - It closes the prior ownership (`valid_to = closing − 1`), inserts the new one (`source = 'sale'`), and emits `ownership_changed` with counts and ids.
  - The outstanding balance stays on the unit, and the panel says so.
  - The prior owner's portal ownership ends, so they can no longer see the unit (integration test).
  - It offers to invite the new owner, and resets tenure to "unknown" with a prompt.
  - The History tab shows prior owners.

### PR-04: Owner contact record: multiple owners, mailing address, preferred channel, language, e-notice consent. **M · migration: yes (joins BL-020 in M1)**
- **Value:** reach absentee owners, satisfy FL/CA consent rules, and make the multilingual claim true.
- **Acceptance:**
  - `ownerships` (or an `owner_contacts` table) gains mailing address lines, an off-site flag, preferred language, and e-notice consent with timestamp, source and an append-only log.
  - The 360 page shows each co-owner.
  - Audiences skip email for owners without consent where state rules require it (CA §4040, FL ch. 720), and flag those owners for mail.
  - Integration test on the consent log being append-only.

### PR-05: Account standing on the list and the detail page. **S · migration: no (view already has the inputs)**
- **Value:** the treasurer's #1 question answered at a glance.
- **Acceptance:**
  - A standing pill (Current, Past due N days, On payment plan, In collections (stage), 90+ days) on the list row and the Owner card.
  - A new filter chip, "90+ days".
  - The CSV export includes balance, days overdue and standing.
  - The pill uses the same view columns, so the list and the panel can't disagree (unit test).

### PR-06: Export and bulk actions match the list. **S · migration: no**
- **Value:** the export button exports what you see, and the board can act on 30 homes at once.
- **Acceptance:**
  - The export honours every filter chip (attention, incomplete, waiting) and the search.
  - Columns: owners, mailing address, residents count, balance and standing.
  - Audit row first (BL-011 pattern).
  - The list gets checkboxes plus "Message selected" (a `specific_units` audience pre-filled in the composer), "Set tenure" and "Export selected".

### PR-07: Segments (phase, street, building, custom tags) and segment audiences. **M · migration: yes**
- **Value:** "send notice to all owners on Phase 2."
- **Acceptance:**
  - `units` gains a `section` and a `tags text[]`. Import maps them.
  - The list filters by segment.
  - New audience kind `segment`. Recipient preview count before sending.
  - It goes through the BL-004 guard.

### PR-08: Data-quality fixer for the "Incomplete" view. **S · migration: no**
- **Value:** a clean roster in an afternoon. Today "Incomplete" lists problems but fixes nothing.
- **Acceptance:**
  - Each incomplete row shows why (no owner, no email, no unit link, possible duplicate via `normalize_address`) with an inline fix: link or merge, add owner, set tenure.
  - The count drops as fixes land.
  - Duplicate merge moves residents, violations and threads (integration test).

### PR-09: Property 360 shows everything. **M · migration: no**
- **Value:** one screen before every phone call.
- **Acceptance:**
  - New tabs or sections: ARC requests, tickets, announcements sent to this lot (from communication recipients), and per-lot documents (an upload tagged to the unit, using a storage prefix, no schema change).
  - Each tab pages and shows LoadFailed on error, like the existing tabs.

### PR-10: Owner self-service in the portal ("My home & contact"). **M · migration: no (after PR-04)**
- **Value:** owners keep their own data current. It answers CA §4041 annually at zero board effort.
- **Acceptance:**
  - `/resident/account` lets the owner edit phone, mailing address, language and e-notice consent.
  - Email changes and co-owner adds go to `/approvals` for the board.
  - Consent changes log immediately.
  - RLS integration test: an owner can edit only their own contact rows.

### PR-11: Estoppel and resale certificate. **L · migration: yes (`estoppel_requests`: requester, due date, fee, status, PDF)**
- **Value:** a revenue and compliance feature. Management companies charge for these, and FL requires 10 business days.
- **Acceptance:**
  - The board creates a request from the 360 page.
  - It pre-fills the statutory fields from the ledger (regular assessment, paid-through date, balance, pending special assessments, open violations, collections status).
  - Shows a due date counted in association-local business days (BL-043 helper) and a fee cap per state.
  - Renders a PDF for board approval (the AI never sends it).
  - FL fields are verified against official §720.30851 text. CA (§4525/§4528) is marked "verify" until confirmed (BL-054 rule).

### PR-12: Statutory owner roster and voter list. **M · migration: no (after PR-04)**
- **Value:** answer an owner's records request, and run the annual meeting.
- **Acceptance:**
  - A printable roster: lot, parcel ID, owners, mailing address.
  - A "for member inspection" variant that redacts the FL-protected fields (e-addresses, phone) and honours CA §5220 opt-outs.
  - A voter list with one vote per parcel, flagging FL §720.305(2) suspension candidates (90+ days delinquent, board action required) and quorum math from the governing-doc percentage.
  - It's the foundation for e-voting (BL-023 and later).

### PR-13: Tenant registry unified with leases. **M · migration: maybe (view)**
- **Value:** FL/CA rental rules from one source.
- **Acceptance:**
  - Setting tenure to Leased requires or creates an active `tenancies` row (tenant contact, lease start and end). Ending it closes the tenancy.
  - The tenure flag is derived from it, or checked against it by a unit test.
  - Lease-cap math reads tenancies.
  - Grandfathering uses the ownership acquisition date from PR-03.

### PR-14: ⌘K finds people, not just owner names. **S · migration: no**
- **Value:** "type a phone or email, land on the home."
- **Acceptance:**
  - Search also matches owner email and phone, residents, active tenants and prior owners (labelled "former owner").
  - Board only (residents still get 403).
  - Unit tests on grouping.

### Summary table

| ID | Item | Effort | Migration | Depends on |
|---|---|---|---|---|
| PR-01 | One property record | M | yes | BL-007 inventory |
| PR-02 | Board roster import (+CINC) | L | no | PR-01 |
| PR-03 | Record a sale | M | no | PR-01 |
| PR-04 | Owner contact + consent | M | yes (M1 with BL-020) | PR-01 |
| PR-05 | Account standing | S | no | — |
| PR-06 | Export + bulk actions | S | no | — |
| PR-07 | Segments + audiences | M | yes | PR-01 |
| PR-08 | Data-quality fixer | S | no | PR-01 |
| PR-09 | 360 shows ARC/tickets/comms/docs | M | no | PR-01 |
| PR-10 | Portal self-service contact | M | no | PR-04 |
| PR-11 | Estoppel / resale certificate | L | yes | PR-03, PR-05 |
| PR-12 | Statutory roster + voter list | M | no | PR-04 |
| PR-13 | Tenant registry unified | M | maybe | PR-03 |
| PR-14 | ⌘K people search | S | no | — |

---

## 6. Build first

1. **PR-01, one property record.** Everything else is built on sand until this is fixed. Today a self-onboarded board can't generate dues for the homes it typed in, and an edited owner email doesn't change who gets notices. It's the cheapest way to make the existing screens trustworthy, and it removes the "either table counts" workaround from the setup checklist. It needs an owner-applied migration, so start it first and ship the app change behind the backfill.
2. **PR-02, board self-service import.** This is the onboarding gate and the sales story ("15 minutes"). It turns founder SQL into a product feature and makes a marketing claim true. It also exercises PR-01's write path at scale, which is the best test of it.
3. **PR-03, record a sale.** It's the most frequent real-world change to an owner record. Today it silently destroys history and leaves the old owner with portal access to the new owner's ledger, which is a privacy defect. It needs no migration, the schema has supported it since 0004, and it unlocks estoppels (PR-11) and FL rental grandfathering (PR-13).

**Quick wins to run alongside** (S, no migration): PR-05 standing pill, PR-06 export fidelity, and the marketing copy fixes in §4.
