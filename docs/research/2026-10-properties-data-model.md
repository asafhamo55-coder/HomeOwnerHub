# Properties module: data-model audit and target model

Date: 2026-10-17. Read-only audit of the migrations, `packages/db` types, `apps/hoa/src` and `packages/jobs`, plus schema-only queries against the **local** Supabase. Local data is empty (1 org, 1 unit, 0 properties), so this audit says nothing about production row counts. The local DB **already has 0063 applied**. Production does **not** have it yet (cycle-log: "0063 apply (Asaf)" is still pending).

Short version: the properties module is hard to make good because **there is no single "property" record and no "person" record.** One lot lives in two tables. Its owner is stored in three or four places, and each feature reads a different one. Its children are split between the two tables by FK. Every page has to bridge the two at runtime, through a link that is nullable, not unique, and was matched by address. Changing the UI cannot fix this. The model has to converge first.

---

## 1. Current model, with the problems marked

```
                      orgs ──< associations (lease_cap_pct, total_units [unused])
                       │              │
       ┌───────────────┘              │ association_id (nullable!)            [P7]
       │                              │
 ┌─────▼──────────────────┐   bridge  ┌▼──────────────────────────────┐
 │ hoa_properties  (0000)  │◄─────────┤ units  (0004)                  │
 │  org_id   (NO assoc)[P7]│ legacy_  │  organization_id, association_id
 │  address  (1 free text) │ hoa_prop │  address_line1/2, city, state, │
 │  unit_number            │ erty_id  │  postal_code, unit_number,     │
 │  owner_name  ◄──[P2]    │ nullable │  lot_number, sq_ft, beds, notes│
 │  owner_email ◄──[P2]    │ NOT uniq │  legacy_pm_property_id         │
 │  owner_phone ◄──[P2]    │ addr-    │  NO deleted_at            [P4] │
 │  tenure (enum) ◄─[P6]   │ matched  │  NO tenure, NO custom fields   │
 │  notes, deleted_at      │ [P4]     └──┬─────────────────────────────┘
 └──┬──────────────────────┘             │
    │ FK property_id                     │ FK unit_id
    ├─< property_residents (0017)  [P2][P5][P10]   ├─< ownerships (owner_name/email/phone text,
    │     full_name,email,phone,role(owner|tenant│        owner_user_id→profiles, pct, valid_from/to) [P2][P5]
    │     |family|other), is_primary (not excl.) ├─< tenancies (tenant_* text, lease dates, status) [P6]
    │     moved_out_at AND deleted_at           ├─< assessments ─< payments            (money)
    ├─< property_events (0017) "immutable" [P9] ├─< payment_plans, payment_methods, zelle matches
    ├─< lease_waiting_list (0017)          [P6] ├─< collection_cases
    ├─< hoa_violations (SET NULL)          [P1] ├─< inbox_threads, inbox_sender_aliases
    └─< hoa_dues (legacy, superseded)      [P1] ├─< communication_threads, communication_recipients
                                                 ├─< tickets, arc_requests, resident_violation_reports
   inbox_threads.resident_id ─► property_residents  └─< resident_communication_preferences (user|unit, no person) [P5]

 hoa_property_list_v (0039→0051): FROM hoa_properties, LATERAL first unit by created_at,
   per-row laterals over assessments+payments, violations, inbox_threads, waiting list,
   org filter via auth.uid() subquery.                                          [P8]
 property_bridge_gaps (0028): ops view, both-direction gaps.
 profiles(id=auth.users, full_name, email): a third copy of name/email for portal users. [P2]
 pm_properties: third property table (PM app), also bridged into units.     (out of scope)
```

**FK census (local schema, `pg_constraint`):**

| Keyed by `hoa_properties.id` | Keyed by `units.id` |
|---|---|
| property_residents, property_events, lease_waiting_list, hoa_violations, hoa_dues | ownerships, tenancies, assessments, payments, payment_plans, payment_methods, zelle_inbound_matches, collection_cases, inbox_threads, inbox_sender_aliases, communication_threads, communication_recipients, tickets, arc_requests, resident_violation_reports, resident_communication_preferences |

The URL `/properties/[id]` takes the left-hand id. Almost everything a board acts on (money, mail, tickets, ARC, collections) hangs off the right-hand id. The recent PropertyRail bug (07160ec, `/properties/${unitId}` → 404) belongs to the same class as everything below.

**Which code reads and writes which side:**

| Concern | Source of truth actually used | Where |
|---|---|---|
| List, search, `has_owner` / `is_incomplete`, ⌘K owner hits, CSV export | `hoa_properties.owner_*` | `lib/properties/list.ts`, `lib/search/records.ts:199`, `properties/export/route.ts`, view 0051 |
| "Edit property" owner fields | writes `hoa_properties.owner_*` only | `lib/properties/index.ts` `updateProperty` |
| Announcements / owners_only / tenants_only audiences | `ownerships` (active), `tenancies` (active) | `lib/communications/audience.ts:232-237` |
| Dues reminders (job + packets) | `ownerships.owner_email` | `packages/jobs/src/dues-reminders/run.ts:522`, `lib/dues-reminders/packets.ts:149` |
| Portal access + resident RLS | `ownerships.owner_user_id` ∪ `property_residents.email` = JWT email | `auth_resident_unit_ids()` (0061), `auth_resident_property_ids()` (0063), `lib/resident.ts:118-189` |
| Inbox sender → property | `property_residents.email`, then `hoa_properties.owner_email`, then `units` address | `lib/properties/resolve.ts:149-297` |
| Residents card on the detail page | `property_residents` | `lib/property-residents.ts` |
| Tenure, lease cap % | `hoa_properties.tenure`, only for **bridged** units | `lib/leases.ts:113-160` |
| Member invite | writes property_residents + ownerships + tenancies (service role, best effort, warnings only) | `lib/members.ts:330-420` |
| CSV import | writes units + ownerships + tenancies only | `app/admin/import-units/actions.ts` |
| Create property | writes hoa_properties only | `lib/properties/index.ts` `createProperty` |

`resolve.ts` calls itself "the ONLY module permitted to know that a property is modelled by two tables". In practice **13 files** reference `legacy_hoa_property_id` directly: resident.ts, resident-dashboard.ts, members.ts, leases.ts, audience.ts, inbox/match.ts, inbox/queries.ts, inbox/resident/actions.ts, violation-drafts.ts, dashboard/queries.ts, data-export/tables.ts, properties/[id]/page.tsx and resolve.ts itself. The seam has not held.

---

## 2. Top 10 structural problems, ranked by how much they block a good properties UX

### P1. One lot, two primary keys, children split by FK
- **What:** a lot is a `hoa_properties` row *and* a `units` row. Five child tables point at the first and sixteen at the second (see the census above).
- **What it costs:**
  - The detail page cannot show dues, mail, collections, tickets or ARC unless a bridge exists.
  - Every new feature has to pick a side.
  - The ID-confusion bug class has no guard. Both ids are bare `string` / `uuid`.
- **Refs:** 0000, 0004, 0005, 0017; `properties/[id]/page.tsx:169-178`; 07160ec.

### P2. The owner lives in three or four places, and each feature reads a different one
- **Where the owner lives:**
  - `hoa_properties.owner_name/email/phone`
  - `ownerships.owner_name/email/phone` (+ `owner_user_id`)
  - `property_residents` rows with `role='owner'`
  - `profiles.full_name/email` for portal users
- **What breaks:**
  - **A board member who fixes an owner's email on the property page has not changed where dues reminders or announcements go.** Those read `ownerships`.
  - Portal access keys off a fourth rule.
  - Adding an "owner" on the Residents card (`addResident`) writes only `property_residents`, so that person gets no dues reminders and is not in `owners_only`.
  - The list's "missing owner" flag reads the inline text column, so a lot with co-owners in `ownerships` / `property_residents` can still be flagged incomplete.
  - `mirror-units-to-hoa-properties.sql` concatenates co-owners into one string (`'A · B'`) in `hoa_properties.owner_name`. The inline column cannot represent more than one owner.
- **Refs:** table above; `migrations/mirror-units-to-hoa-properties.sql`; `migrations/backfill-owners-as-residents.sql`.

### P3. Write paths create only half a lot
- **Create property:** `createProperty` inserts `hoa_properties` only, with no units row. A hand-added lot can never carry assessments, mail, tickets or collections, and stays `is_incomplete` (has_unit_link = false) forever.
- **CSV import:** inserts `units` / `ownerships` / `tenancies` only. The lots stay invisible on `/properties` until someone runs `mirror-units-to-hoa-properties.sql` and `backfill-owners-as-residents.sql`. Both are manual and hardcoded to the pilot org's id.
- **Edit property:** `updateProperty` changes `hoa_properties.address` but not `units.address_line1`. The two drift, and that silently breaks `normalize_address` bridging and `resolvePropertyByAddress` inbox matching.
- **Delete property:** `deleteProperty` soft-deletes `hoa_properties`, but `units` has no `deleted_at`. The unit stays live in audiences, dues and lease stats.
- **CINC import:** BL-031 will inherit all of this.

### P4. The bridge is nullable, not unique, and matched by address
- **The column:** `units.legacy_hoa_property_id` has no unique constraint. 0028's comment explicitly allows N units to one property.
- **Two readers disagree on N units:**
  - the view picks the first unit by `created_at`, so dues and mail from the other units are dropped from the list;
  - the detail page uses `.maybeSingle()`, which errors on two or more rows, so the page shows "couldn't load" for dues, mail and collections.
- **How it was populated:**
  - 0005 joined `associations` on org only, so an org with two associations got **duplicate units per property**;
  - 0028 re-matched by normalized address and leaves ambiguous matches NULL;
  - `normalize_address()` must stay byte-identical to a TS twin, and needs a REINDEX on every change.
- **Gaps:** `property_bridge_gaps` reports them, but nothing prevents new ones (see P3).

### P5. There is no Person entity
- **People are text columns, repeated per row.** Someone who owns three lots is three unrelated strings. You cannot answer "show everything for this owner", merge duplicates, or update one email everywhere.
- **Missing contact data:**
  - no **mailing address**. Absentee or investor owners matter for statutory notices and collections letters; 0047 notes "this system does not mail";
  - no **contact consent** per person and channel. `resident_communication_preferences` is keyed by `user_id` or `unit_id`, so a non-portal owner cannot record an SMS opt-in or an electronic-notice consent;
  - no preferred name, language per person, or emergency contact.
- **Missing constraints:**
  - `is_primary` is not exclusive (no partial unique);
  - `ownership_pct` can sum to anything;
  - two open ownerships for the same person on the same unit are allowed;
  - `property_residents` has two "gone" flags (`moved_out_at` and `deleted_at`) with separate indexes.
- **No custom fields** anywhere (parcel number, gate code, pet, vehicle, parking space). Today these end up in `notes`. The CSV import already put occupancy into `units.notes` as text, which `backfill-tenure-from-units-notes.sql` then parses with ILIKE.

### P6. Tenant and lease status is recorded three ways
- **Where it lives:**
  - `hoa_properties.tenure` (manual enum)
  - `tenancies` (dated leases on units, used by `tenants_only` comms)
  - `property_residents.role='tenant'` (shown on the detail page)
- **What breaks:**
  - None of them derives from the others. A lot can be "owner_occupied" with an active tenancy and a tenant resident.
  - The lease-cap % (a governing-document compliance number) counts `tenure` over **bridged units only** (`leases.ts:113`), so unbridged lots drop out of the denominator.
  - `lease_waiting_list` is keyed to `hoa_properties`, but stamped with `getPrimaryAssociation()` (the alphabetically first association).
- **Nullability mismatch:** code treats `tenure` as nullable everywhere, but the column is `NOT NULL DEFAULT 'unknown'`. As written, `backfill-tenure-from-units-notes.sql` would fail on its own `ELSE NULL`.

### P7. `hoa_properties` has no association
- **What:** properties are org-scoped only. `units.association_id` is nullable. Multi-association management companies cannot filter `/properties` by community, and the lease cap and waiting list depend on a guessed "primary" association (`lib/vendors.ts:83 getPrimaryAssociation`).
- **Unused counter:** `associations.total_units` is never read by the app.

### P8. The list and detail pages do heavy work, and search is narrow
- **Per-row cost:** `hoa_property_list_v` runs five lateral subqueries per property, including `assessments` → per-assessment `payments` SUM and two `IN (SELECT units …)`.
- **Full evaluation:** the default sort is `severity_rank` and the default filter is `needs_attention`, both computed columns. So every page load evaluates every property, not just 50.
- **Query counts:**
  - `/properties` runs the list plus **4 `count: exact` queries** on the same view;
  - `/properties/[id]` runs the side list, the 4 counts and a stats read: **6 full evaluations** before its own tabs load.
- **Not indexable:** none of the filter flags can be indexed, because they are computed.
- **Search:**
  - ILIKE over `address`, `unit_number`, `owner_name`, `owner_email` of `hoa_properties` only. The trigram GIN indexes exist (0039), but co-owners, tenants, residents, phone numbers, lot numbers and `units` address parts cannot be searched;
  - no ranking;
  - ⌘K searches the same four inline columns.
- **Row caps:**
  - `loadLeaseStats` reads all units of an association in one unpaged request (1000-row cap; BL-053 missed this one);
  - it then sends `.in('id', allPropertyIds)` as a GET query string, which overflows the URL at a few hundred lots.
- **Types:**
  - `hoa_property_list_v`, `lease_waiting_list` and others are cast `as never` (61 casts across `lib/properties`, `leases.ts`, `property-residents.ts`, `resident.ts`);
  - column renames are not type-checked;
  - footgun §3 (regen wipes unapplied-migration types) makes this worse.

### P9. History is not trustworthy, and there are two timelines
- **Not immutable:**
  - `property_events` is documented as immutable, but 0063 still grants board/admin UPDATE and DELETE;
  - events are written by app code on a best-effort basis, and failures are only `console.error`'d (`lib/properties/index.ts`);
  - no trigger writes events.
- **Missing events:** owner changes via `updateProperty`, CSV import, member invite and ownership rows write **no event**. Ownership history exists separately in `ownerships.valid_from/to`, so the "timeline" and the true ownership history disagree.
- **Wrong key for a durable record:** events are keyed to `hoa_properties`. The 0004 design intent ("history attaches to the unit, not the owner") is half-implemented.

### P10. Privacy and integrity guards are weak at the data layer
- **Until 0063 is applied in prod:**
  - every signed-in resident can read every neighbour's `hoa_properties.owner_*`, `units` and `ownerships`;
  - `property_residents` reads are org-wide (0041 `org_read`), so the whole HOA's names, emails and phones are exposed through PostgREST.
- **After 0063:**
  - portal identity is still **email string equality** on `property_residents` / JWT email. Editing a resident's email silently grants or revokes portal access and RLS reach;
  - residual: a resident reads their own row in full, board `notes` included.
- **Cross-tenant integrity:** nothing ties a child's `organization_id` to its parent's, so `property_residents.org ≠ hoa_properties.org` and `units.org ≠ associations.org` are both possible.

---

## 3. Target model

One durable lot record. People are first-class. Every relationship is dated. History is append-only. List signals are precomputed.

```
associations ──< units  (CANONICAL LOT; id is the URL id)
                  association_id NOT NULL, address parts, unit_number, lot_number,
                  parcel_id, tenure_override (nullable), custom_fields jsonb,
                  deleted_at, legacy_hoa_property_id UNIQUE (until contract)
                  │
                  ├─< unit_people   (one table for every person↔lot relationship)
                  │     person_id, role (owner|tenant|occupant|agent|emergency),
                  │     is_primary (partial-unique per unit+role while current),
                  │     ownership_pct (owners), valid_from, valid_to, source
                  │     ── ownerships / tenancies / property_residents become this
                  │        (or stay as typed tables carrying person_id; see Phase M1)
                  ├─< leases (= tenancies + lease detail) → unit_people(tenant)
                  ├─< unit_events   (append-only: no UPDATE/DELETE policy; trigger-fed)
                  ├─  unit_rollups  (1 row/unit: balance, oldest_due, open_viol,
                  │                  past_cure, threads_needing_reply, on_waiting_list,
                  │                  severity_rank, needs_attention, is_incomplete,
                  │                  search tsvector incl. all current people)
                  └─< every child FK (violations, waiting list, dues, inbox…) → units.id

people  (org-scoped contact, deduped)
  organization_id, user_id → profiles (nullable; portal link is an FK, not email),
  full_name, email, phone, mailing_address (line1/2, city, state, postal, country),
  language, deleted_at
  └─< contact_consents (person_id, channel email|sms|voice|mail|portal|e_notice,
                        status, source, captured_at, evidence)

custom_field_defs (association_id, key, label, type, options, required, sort)
```

**Derived, not stored:**
- tenure = `leased` if there is an active lease, else `owner_occupied` if a current owner has the unit as their mailing address, else `tenure_override`, else `unknown`;
- "the owner" on the list = the primary current owner from `unit_people`, plus a count of co-owners.

**RLS** keeps 0063's shape:
- board/admin get everything;
- a resident sees their own units through `people.user_id = auth.uid()`, which replaces the email match;
- `people` contact columns are visible to the board and to that person only.

---

## 4. Phased plan: expand → backfill → switch reads → contract

Rules that apply to every phase:
- The owner applies each **[SQL]** step himself in the Supabase editor, as **one idempotent `DO $$ … $$` block**, with a pre-check and a verify query that print **counts only**.
- Dependent code ships after he confirms the apply.
- After each apply, run `pnpm gen:types` and diff **columns**, not table names (CLAUDE.md footgun §3).
- **[CODE]** phases can ship now.

### Phase C0: code-only, ship now (no schema change)
1. **Typed ids.** Brand `UnitId` and `LegacyPropertyId` in `resolve.ts`. Route every `/properties/…` href through one `propertyHref(...)` helper that accepts either id and resolves it. Make `/properties/[id]` accept a unit id and redirect to the legacy id. This ends the 07160ec bug class.
2. **One unit-lookup rule.** Replace the detail page's `.maybeSingle()` unit lookup with the view's rule (first unit by `created_at`). Surface "N units linked" when there is more than one, instead of "couldn't load".
3. **Make writes whole:**
   - `createProperty` also inserts a `units` row in the chosen association, with `legacy_hoa_property_id` set (board can insert units under 0063);
   - `updateProperty` mirrors address and unit number to the unit, and owner edits also close or open an `ownerships` row and upsert the primary-owner `property_residents` row;
   - `deleteProperty` and `addResident(role=owner)` make the matching ownership change.

   This is app-level dual-write. It is a stopgap, not the fix.
4. **Import writes both sides.** `import-units` writes both sides plus the residents, which retires the two hardcoded org scripts.
5. **Cheaper counts.** Collapse the 4 chip counts into one cached read (`unstable_cache`, short TTL, keyed by org). Drop them from the detail page or reuse the list page's.
6. **Wider search.** Search also matches `property_residents` and `ownerships` names and emails (two extra trigram-friendly reads, union of ids, then `.in('id', …)` on the view).
7. **Lease stats.** Page the units read in `loadLeaseStats` and chunk its `.in()`. Show "N lots not linked; excluded from lease %" instead of silently dropping them.
8. **Divergence diagnostic.** Add a "contact sources disagree" badge on the detail page, comparing `hoa_properties.owner_email` with `ownerships` and the primary owner resident. Add a service-role script that reports divergence **counts only**.

### Phase M1 [SQL]: expand (additive; prod keeps working)
One DO block, schema only, no data change. It adds:
- `units`: `deleted_at`, `tenure_override`, `tenure_updated_at/by`, `custom_fields jsonb DEFAULT '{}'`, `parcel_id`;
- `people`, `contact_consents`, `custom_field_defs`, each with RLS in the 0063 shape;
- nullable `unit_id` (+ index) on `hoa_violations`, `property_residents`, `property_events`, `lease_waiting_list`;
- nullable `person_id` on `ownerships`, `tenancies`, `property_residents`;
- a trigger that fills `unit_id` from `property_id` through the bridge on insert or update (and the reverse), so old writers keep both columns in step;
- an org-consistency trigger (child org = parent org) on those tables;
- an append-only policy on `property_events`: drop the UPDATE and DELETE policies.

**Pre-check:** count of `units.legacy_hoa_property_id` duplicates, and of orgs with more than one association.

### Phase M2 [SQL]: backfill (one DO block per step; each re-runnable)
1. **Bridge both directions:**
   - create a unit (in the org's association, or flag it when ambiguous) for every live `hoa_properties` row without one;
   - create a `hoa_properties` row for every HOA unit without one.
2. **De-duplicate the 0005 cross-association units:** report first, and the owner decides. Then add a `UNIQUE` partial index on `units(legacy_hoa_property_id)`. This step is gated: it aborts with a count if duplicates remain.
3. **Backfill `unit_id`** on the four child tables from the bridge.
4. **Backfill `people`:** one per distinct (org, lower(email)) across ownerships, tenancies, property_residents and `hoa_properties.owner_*`. Rows with no email get one person each. Then set `person_id`, and `people.user_id` from `ownerships.owner_user_id` / `profiles.email`.
5. **Copy `hoa_properties.tenure`** into `units.tenure_override`.

**Verify:** per-org counts of unbridged units, NULL `unit_id`, NULL `person_id`, and people with more than one email source. Counts only.

### Phase C1 [CODE]: switch reads (after M2 is verified)
- `/properties/[id]` is keyed by `units.id`, and legacy ids redirect.
- The detail page reads people through `unit_people` / ownerships + `person_id`, and shows co-owners, mailing address, consents and custom fields.
- Audiences, dues reminders, the inbox matcher and portal identity all read `people`. Portal identity uses `people.user_id`, not email.
- `resolve.ts` becomes the only bridge reader again (temporary).

### Phase M3 [SQL]: rollups and the new list surface
- `unit_rollups` table, maintained by triggers on assessments, payments, hoa_violations, inbox_threads and lease_waiting_list (plus a nightly reconcile job).
- `unit_list_v` (security_invoker, board-only like 0051) over `units` + rollups + primary owner, with a `tsvector` / trigram search column over the address and all current people.
- Indexes on `(organization_id, association_id, severity_rank, address)` and on the boolean flags.

### Phase C2 [CODE]: switch the list
- `/properties` reads `unit_list_v`: one query plus one grouped count (`count … FILTER`), with an association filter and full-person search. Retire `hoa_property_list_v` reads.
- Writes go to `units`, `people` and `ownerships` only. Old columns are kept up to date by the M1 triggers.

### Phase M4 [SQL]: contract (only after a release cycle with zero reads of the old columns)
1. A trigger that rejects writes to `hoa_properties.owner_*` / `tenure`. Freeze first, so a straggler fails loudly.
2. Make `unit_id NOT NULL` on the four child tables, then drop their `property_id` and the `hoa_properties` FKs.
3. Replace `hoa_properties` with a compatibility **view** over `units`, then drop it.
4. Drop `hoa_dues`, `property_bridge_gaps`, `normalize_address` indexes that are no longer needed, and `legacy_hoa_property_id`.

Each step is its own DO block with a "refuse if any NULL / any reader" pre-check.

**Recommended order of value:** C0.1–C0.4 this cycle (they fix the user-visible lies in P2 and P3). Then M1 + M2, which carry most of the risk and are entirely additive. C1 and M3/C2 deliver the UX the owner wants: search by any person, association filter, a fast list, co-owners, mailing address, consent and custom fields. M4 is cleanup and can wait.
