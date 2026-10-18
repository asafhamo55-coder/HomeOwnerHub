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
| **P3: record a sale** | Closes the prior ownership. The balance stays with the lot. Removes the seller's access. Invites the buyer. Emits `ownership_changed`. | no (RLS SQL below) | built (claude/properties-p3) |
| **P4: board-run import** | CSV and XLSX, column mapping, dry run, duplicate handling, a CINC preset. Writes both records. Absorbs BL-031. | no | next |
| **M-P1 (SQL by Asaf)** | Expand: `people`, `unit_people` (role, primary, %, valid_from/to), mailing address, language, `contact_consents`, `custom_fields`, `parcel_id`, `association_id` on lots, `deleted_at` on units, append-only events. | yes | after 0063 |
| **M-P2 (SQL by Asaf)** | Backfill: link both directions, remove duplicate units, add a unique join index, backfill people. | yes | after M-P1 |
| **P5** | Reads switch to people and units. Statutory roster and voter list (§720.303, §4041, §5105). Owners update their own contact details in the portal. Estoppel and resale certificate (§720.30851, §4525). Segments and tags for audiences. | partly | later |

## Marketing truth fixes (BL-042)

- **Remove or qualify until P4 ships:** "15 min onboarding" and "roster can come over": boards can't import their own roster yet.
- **"Translated to each resident's preferred language":** no language field exists yet (M-P1).
- **Pricing and privacy pages:** still call the full export "roadmap", but it shipped (BL-011). Update them.

## P3 notes: what the code does, and the SQL it still needs (2026-10-18)

"Record a sale" (`lib/properties/sale.ts`) closes the sellers' ownerships at the settlement date, opens the buyers' (`source = 'sale'`), moves the seller's household out of `property_residents`, and writes `ownership_changed`. That ends the seller's access for real: 0061's `auth_resident_unit_ids` reads only current ownerships and residents not moved out.

Hiding the seller's charges from the buyer is **app-level only** (`lib/resident-sale-window.ts`): the portal's dues and ledger readers drop charges dated before a `source = 'sale'` ownership's `valid_from`. RLS still lets the buyer's JWT read every row on the unit (`tests/integration/flows/record-sale.test.ts` pins this). To enforce it in the database (owner-applied, not yet written as a migration):

```sql
CREATE OR REPLACE FUNCTION public.auth_resident_charges_from(p_unit uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(o.valid_from) FROM public.ownerships o
   WHERE o.unit_id = p_unit AND o.owner_user_id = auth.uid()
     AND o.valid_to IS NULL AND o.source = 'sale'
$$;
GRANT EXECUTE ON FUNCTION public.auth_resident_charges_from(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS assessments_select ON public.assessments;
CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated
  USING (
    public.auth_is_board_or_admin(organization_id)
    OR (organization_id = ANY (public.auth_org_ids())
        AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
        AND due_date >= COALESCE(public.auth_resident_charges_from(unit_id), '-infinity'::date))
  );

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
  USING (
    public.auth_is_board_or_admin(organization_id)
    OR (organization_id = ANY (public.auth_org_ids())
        AND (
          (assessment_id IS NULL
            AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
            AND (paid_at AT TIME ZONE 'America/New_York')::date
                >= COALESCE(public.auth_resident_charges_from(unit_id), '-infinity'::date))
          OR EXISTS (
            SELECT 1 FROM public.assessments a
             WHERE a.id = payments.assessment_id
               AND a.unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
               AND a.due_date >= COALESCE(public.auth_resident_charges_from(a.unit_id), '-infinity'::date))
        ))
  );
```

Known gaps: a buyer who signs in through the `property_residents` email fallback (an account, but no linked ownership) has no sale floor in either layer; "Invite to portal" closes it by linking the sale ownership (`linkOwnershipForMember`). The payments policy dates unapplied payments in Eastern time (the app uses the association's zone). The seller keeps their org membership (they may own other homes); they just see no unit here.
