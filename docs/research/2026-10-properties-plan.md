# Properties module: the plan (2026-10-17)

This plan combines four research tracks:
- competitors: [2026-10-properties-competitors.md](2026-10-properties-competitors.md)
- product and jobs to be done: [2026-10-properties-product.md](2026-10-properties-product.md)
- data model: [2026-10-properties-data-model.md](2026-10-properties-data-model.md)
- UX audit: summarised below

## Why it feels bad

1. **One home is two records.** `/properties` reads and writes `hoa_properties`. Dues, notices, the portal, ARC, tickets and the import read `units` and `ownerships`. Nothing syncs them. As a result:
   - A home added on /properties can't be billed.
   - Editing an owner's email doesn't change where notices go.
   - Imported homes don't appear on /properties.
2. **"Who owns this" is recorded in three places that disagree:** the owner fields, `property_residents` and `ownerships`.
3. **The page doesn't do the main job, finding a home.**
   - Search only looks inside the current filter, and the default filter is "Needs attention", so most homes are missing from every search.
   - The list is a 448px column next to an empty panel.
   - The "Missing data" badge shows on 53 of 57 homes.
4. **The detail page isn't a 360-degree view.**
   - It has no ARC, tickets, documents or payments.
   - Its only actions are Edit, Delete and Enter portal: no "Message owner", "Record payment" or "New violation".
   - Links out go to unfiltered lists.
   - Nothing elsewhere links back to the home.
5. **There's no ownership history and no person record.**
   - A sale overwrites the owner fields, and the seller keeps portal access.
   - Someone who owns three lots is three unrelated strings.
   - There's no mailing address and no e-notice consent, which FL §720.303 and CA §4041 require.

Strong competitors model three layers: the lot, the ownership period (past, active or future, with sale dates) and the person. That is the target.

## Phases

| Phase | What | Migration | Status |
|---|---|---|---|
| **P0: data stops diverging** | One resolver and typed ids. Create, edit, delete and import write both records. The unit-id URL works. Fix the setup checklist's dues dead-end. | no | in progress (claude/properties-c0) |
| **P1: quick wins** | Search covers all homes. "All" is the default. Tap-to-call and email links. Addresses link to the home everywhere, and links carry `?property=`. The violation wizard reads `?property=` with no preselection. Export matches the view. The pill and copy are fixed. A mobile header. Delete becomes "Archive" in a menu. A cure-date column. Form error fixes. ui-shots keeps query strings. | no | in progress |
| **P2: real list and 360** | A full-width sortable table: owner, contact, tenure, balance and days overdue, open violations and ARC, last activity. On mobile, cards. The detail page gets an action bar, a "needs action" strip, People, Money, Compliance (violations and ARC), Leases, Comms, Documents, and one merged timeline. Search covers residents, emails and phones. | no | next |
| **P3: record a sale** | Closes the prior ownership. The balance stays with the lot. Removes the seller's access. Invites the buyer. Emits `ownership_changed`. | no | next |
| **P4: board-run import** | CSV and XLSX, column mapping, dry run, duplicate handling, a CINC preset. Writes both records. Absorbs BL-031. | no | next |
| **M-P1 (SQL by Asaf)** | Expand: `people`, `unit_people` (role, primary, %, valid_from/to), mailing address, language, `contact_consents`, `custom_fields`, `parcel_id`, `association_id` on lots, `deleted_at` on units, append-only events. | yes | after 0063 |
| **M-P2 (SQL by Asaf)** | Backfill: link both directions, remove duplicate units, add a unique join index, backfill people. | yes | after M-P1 |
| **P5** | Reads switch to people and units. Statutory roster and voter list (§720.303, §4041, §5105). Owners update their own contact details in the portal. Estoppel and resale certificate (§720.30851, §4525). Segments and tags for audiences. | partly | later |

## Marketing truth fixes (BL-042)

- **Remove or qualify until P4 ships:** "15 min onboarding" and "roster can come over": boards can't import their own roster yet.
- **"Translated to each resident's preferred language":** no language field exists yet (M-P1).
- **Pricing and privacy pages:** still call the full export "roadmap", but it shipped (BL-011). Update them.
