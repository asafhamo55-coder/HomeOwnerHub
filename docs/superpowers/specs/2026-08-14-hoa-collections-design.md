# HOA Collections — system of record

**Date:** 2026-08-14
**Migration:** `0047_collections.sql` (+ `verify-0047-collections.sql`)
**Status:** schema designed and verified; UI pending type regeneration

## Problem

Madison Park's collections process lives entirely in CINCSystems and PDF
aging reports. HomeownerHub holds the balances but none of the workflow.

Nothing records that Kaur is at "Lien Letter", that Wilson is with Dorough
& Dorough presuit, that the board authorised suit on 5/29/26, or that as of
7/21/26 the manager is waiting on a board decision about a Final Notice to
Kaur. That last one is an open question addressed to the board, sitting in
a PDF, invisible to the app.

Until that data has a home, the product shows what residents owe but cannot
run collections, and CINCSystems stays the system of record.

## Scope

**System of record.** Track the stage an account is at, who the attorney
is, and an immutable dated trail of what was done and when. Nothing is
sent from HomeownerHub.

This was a deliberate choice over two larger options (email-only notices,
and a full notice pipeline with certified mail and § 44-3-234 compliance
gating). See "Deliberately not built".

## What the real data looks like

Every escalation step in the CINC aging report creates a dated,
dollar-valued charge, and **the charge's date is the action date**, not a
billing-cycle date — the $175.00 lien filing fee is dated 2026-06-09
because that is when the lien letter went out.

The ladder, reconstructed from the fee history and dated notes in
`seed-madison-park-dues-aging.sql` and
`update-madison-park-dues-aging-2026-07-21.sql`:

| Stage | Evidence |
|---|---|
| delinquent | `late_fee` assessments only |
| collection letter | Collection Letter Fee $40 (2020), $45 (2024), $55 (2026) |
| collection processing | Collection Processing Fee $185 (2025) |
| 30-day lien warning | "4/9/2026 - 30 Day warning of lien letter sent to owner-gg" |
| lien letter | "6/9/26- Lien Letter sent to owner.-ms"; Lien Filing Fee $155, $175 |
| board authorises suit | "5/29/26- Board authorized the attorney to proceed with lawsuit." |
| attorney presuit | "6/1/26- D&D sent dvl to owner for $5,595.71.ms"; Legal Fee $185.11, $193.47 |

Note formats are irregular: dates appear as both `4/9/2026` and `6/9/26`;
author initials trail as `-gg`, `.-ms`, `.ms`, or are absent; dollar amounts
are embedded in prose. The note's amount is a **point-in-time snapshot** —
Wilson's demand letter says $5,595.71 while the account total is $5,678.58.
It must be stored, not recomputed.

## Design

### Two tables

`collection_cases` — one case per **unit**, not per owner.

Two independent reasons agree. `0004_v1_schema_phase2a.sql:57` states the
architectural rule: service requests, violations, and ARC history attach to
the unit, "not the owner — fixes the Vantaca complaint". And under
O.C.G.A. § 44-3-232 the lien attaches to the **lot**, surviving a change of
ownership. Owner-level rollup already exists for correspondence: dues
reminder packets group by owner email across units.

References `units(id)` **directly**, not legacy `hoa_properties` — see
"Learned from violations" below.

Status ladder: `monitoring → collection_letter → lien_warning →
lien_letter → board_authorized_suit → attorney_presuit → suit_filed`, plus
terminal `resolved` / `written_off`. A partial unique index enforces one
live case per unit, so "the collections status of this property" is never
ambiguous, while historical closed cases accumulate freely.

`collection_events` — the dated trail, **append-only**.

No `updated_at`, no `deleted_at`, and RLS grants only SELECT and INSERT.
There is deliberately no UPDATE or DELETE policy, so the trail is immutable
by construction rather than by convention. If a lien is challenged, this is
the evidence that notices went out when the association says they did.
Correcting a mistake means adding a `note` event, never editing history.

Columns mirror how the manager already writes notes: `occurred_on` (the
action date), `actor_initials` (the `-ms` / `-gg` convention), `amount` (the
quoted snapshot), and `communication_id`, set only when an action was
carried out through this app's comms system — NULL for everything today.

### Assessment categories

`assessment_type` gains `lien_filing`, `collection_legal`,
`collection_letter`, `collection_processing`.

O.C.G.A. § 44-3-234 requires the notice preceding foreclosure to itemise
the amount due by principal, interest, late fees and attorneys' fees.
Before this change every collection cost was crammed into `'special'`,
indistinguishable from a roof assessment, so **the statutory breakout was
not derivable from the data**.

Eight Madison Park rows were reclassified. Amounts and dates are untouched,
so AR stays at $9,475.88. The $49.50 Gate Opener charge deliberately stays
`'special'` — it is a genuine special assessment and serves as the
discriminator proving the reclassification targeted collection costs rather
than every `'special'` row.

Result:

| Category | Total | Rows |
|---|---|---|
| regular | $6,160.20 | 5 |
| late_fee | $982.60 | 9 |
| fine | $1,250.00 | 1 |
| collection_legal | $378.58 | 2 |
| lien_filing | $330.00 | 2 |
| collection_letter | $140.00 | 3 |
| collection_processing | $185.00 | 1 |
| special | $49.50 | 1 |
| **Total** | **$9,475.88** | **24** |

This migration does **not** ship a view asserting the four-way statutory
mapping. Deciding which bucket counts as "attorneys' fees" under
§ 44-3-234 is a legal conclusion, and `PROJECT_FOUNDATION.md:308` requires
GA attorney review before legal output ships. The categories make the
mapping possible; a lawyer confirms it.

## Learned from `hoa_violations`

Violations model the same shape — a legally-constrained escalation with
notices and cure periods — and are the cautionary tale rather than the
template:

1. **No history table at all.** The only note is a scalar
   `resolution_note`, overwritten on every save and set to NULL when
   leaving a terminal status; `fine_start_date` is wiped the same way, so
   open→fined→resolved loses the fine start date entirely.
2. **The app enum drifted from the DB CHECK.** `fined` and `dismissed`
   exist in TypeScript and are not valid database values, and no migration
   widens the constraint.
3. **`property_id` points at legacy `hoa_properties`**, so every
   unit-scoped consumer hops through `units.legacy_hoa_property_id` —
   duplicated in four places today.
4. **A single org-wide RLS policy** with no board/resident split; resident
   visibility is enforced only in app queries.

All four are avoided here.

## Verification

`verify-0047-collections.sql` returns PASS/FAIL per check. Run after
applying. All 11 checks passed against a scratch Postgres 16 loaded with
the real Madison Park migrations.

Behavioural tests, run as an **unprivileged role** (superusers bypass RLS,
which would have made these vacuous):

| Test | Result |
|---|---|
| Board reads events | 1 row |
| Board `UPDATE` on events | `UPDATE 0`, note unchanged |
| Board `DELETE` on events | `DELETE 0`, row intact |
| Resident (same org) reads cases / events | 0 / 0 |
| Second open case on one unit | rejected by unique index |
| New case after closing the first | accepted |
| Madison Park AR after reclassification | $9,475.88 |

**The append-only block is silent.** RLS denies by matching zero rows, not
by raising — a board user running an UPDATE gets `UPDATE 0` and no error,
and PostgREST reports success. An "edit this note" feature built against
this table would pass code review and do nothing in production. This is
recorded in the migration.

## Deliberately not built

- **Sending.** The `mail` channel is accepted by the schema but `send.ts`
  marks it failed ("mail channel not yet implemented"), so certified mail —
  which § 44-3-234 requires, with return receipt plus a first-class copy —
  has no delivery path. `collection_events` records that a letter went out;
  it does not claim to have sent it.
- **AI letter drafting.** `PROJECT_FOUNDATION.md:308` requires a GA
  attorney review gate before any Bar B legal output.
- **The § 44-3-221 POA Act applicability gate** (whether the declaration
  opts in, and its recording date). Only load-bearing once something
  *computes* a legal deadline. Nothing here does — every date is one a
  human recorded. **Required before any cure-expiry or
  foreclosure-eligibility math is added.**
- **Deadline computation** generally: no `cure_expires_at`, no
  `foreclosure_eligible_date`. § 44-3-234's 30 days runs from the date of
  mailing, and this system does not mail.
- **`payment_plans` wiring.** The table exists (`0006_accounting.sql:376`)
  and is unused. `payment_plan_agreed` is available as an event type so the
  trail can record one, without pretending the plan is managed here.

## Remaining work

1. Apply `0047_collections.sql`, then run `verify-0047-collections.sql`.
2. Regenerate types (`pnpm gen:types`) — only after the migration is
   confirmed applied, per `CLAUDE.md` §3.
3. UI: a 7th `collections` tab on the property detail route (tabs are
   query-param driven, so this is additive), a status badge on Overview and
   in `WhoOwesPanel`, and a collections reason-pill on the properties list.
4. Seed Madison Park's known cases: Kaur at `lien_letter`, Wilson at
   `attorney_presuit` with Dorough & Dorough, plus their dated events from
   the aging report notes.
