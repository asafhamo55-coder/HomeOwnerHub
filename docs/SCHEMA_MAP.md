# Schema map — Phase 1 → v1

After migration 0005 lands, both schemas coexist on the same database.
This is how v1 code reads existing data and how v0 code keeps working.

```
                  Phase 1 (v0)                  v1
  ────────────────────────────────  ─────────────────────────────────
  orgs                              orgs (same row — name unchanged)
  hoa_properties                    units + ownerships
  pm_properties                     units + tenancies
  org_members                       org_members (no change)
  hoa_violations                    hoa_violations (no change in 0005;
                                      future migration may rebuild as
                                      `violations` joined to units)
  hoa_dues                          hoa_dues (no change in 0005)
  ...                               ...
```

## The join column

`units.legacy_hoa_property_id` → `hoa_properties.id`
`units.legacy_pm_property_id` → `pm_properties.id`

v1 code reads units; if it needs to write back to Phase 1 tables (during
the dual-write transition), it joins via `legacy_*_property_id`.

## Ownership / tenancy lifecycle

`ownerships.valid_from` / `valid_to` model ownership history. The
backfill creates one open-ended row (`valid_to = NULL`) per HOA property
with an owner. When a future ownership change happens, the v1 code:

1. Sets the existing row's `valid_to` to the closing date
2. Inserts a new row with `valid_from = closing date` for the new owner

`tenancies.status` similarly tracks active vs ended. New lease → insert
row with `status='active'`. Lease ends → update to `'ended'` (or
`'evicted'` if it was an involuntary termination).

## What 0005 does NOT do

- **No rename of `orgs` → `organizations`.** Too much code churn for too
  little gain. We keep the name; the spec's `organizations` is just a
  semantic label.
- **No drop of `hoa_properties` / `pm_properties`.** They stay forever
  (or until a future explicit deprecation migration). Phase 1 code
  continues to work.
- **No backfill of historical ownerships beyond "current owner".** We
  don't have that data; the first row's `valid_from` defaults to the
  property's `created_at`.

## What v1 code should do going forward

- **Read from `units` for property listings**, joining via
  `legacy_hoa_property_id` or `legacy_pm_property_id` when needed.
- **Write to `units` first**, then mirror to the Phase 1 table during
  the transition window (dual-write).
- **New ownerships go to `ownerships`** with proper valid_from/valid_to.
- **`hoa_properties.owner_*` columns are deprecated** — v1 code should
  read the current ownership row via:

  ```sql
  SELECT * FROM ownerships
  WHERE unit_id = $1 AND valid_to IS NULL
  LIMIT 1;
  ```

## Verifying the backfill ran clean

After running 0005, in Supabase SQL editor:

```sql
SELECT
  (SELECT COUNT(*) FROM hoa_properties)       AS hoa_props,
  (SELECT COUNT(*) FROM units WHERE legacy_hoa_property_id IS NOT NULL) AS hoa_units,
  (SELECT COUNT(*) FROM pm_properties)        AS pm_props,
  (SELECT COUNT(*) FROM units WHERE legacy_pm_property_id IS NOT NULL)  AS pm_units,
  (SELECT COUNT(*) FROM ownerships WHERE valid_to IS NULL)              AS active_owners,
  (SELECT COUNT(*) FROM tenancies WHERE status = 'active')              AS active_tenancies;
```

`hoa_props` should equal `hoa_units`. `pm_props` should equal `pm_units`.
Owners and tenancies should be ≤ their respective property counts (some
properties have no owner/tenant on file).
