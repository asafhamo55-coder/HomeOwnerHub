# Review findings — `hoa_property_list_v` (migrations 0039 / 0040)

**For:** whoever owns the properties list view
**From:** the inbox/vendor workstream
**Date:** 2026-08-08

These surfaced during a `/code-review` of `4dc3231..HEAD`, which spanned both
workstreams. They are on your migration, not mine, so I have changed nothing
— relaying rather than fixing.

Each was **re-verified on 2026-08-08 against the current code and the live
database**, after `0040_property_list_view_board_predicate.sql` landed. Status
below reflects that recheck, not the original review — two findings changed
status once checked against real data, and one is more serious than it first
looked.

---

## 1. The view returns zero rows to any caller without a JWT — CONFIRMED, LIVE

**Reproduced against production**, not inferred:

```
service-role SELECT on hoa_property_list_v  ->  0 rows
live hoa_properties (service role, no RLS)  ->  184
```

`auth_is_board_or_admin` resolves through `auth.uid()`, which is NULL for a
service-role or cron caller, so the predicate is false for every row. The
view returns an empty set rather than an error.

Why it matters: an empty set is indistinguishable from "no properties need
attention." A backfill, cron, or admin script reading this view fails
**silently and looks successful**. That is the same failure mode the mailbox
watchdog was written to prevent — a clean-looking run that did nothing.

The security reasoning in the header is sound; the gap is that there is no
signal when the caller has no identity. Options: a comment stating the view
is user-context-only, or a companion `SECURITY DEFINER` function for trusted
server-side reads.

## 2. The view can emit duplicate rows per property — LATENT, not currently firing

`0040:89` keeps `LEFT JOIN public.units u ON u.legacy_hoa_property_id = p.id`,
and nothing guarantees that is one-to-one. The backing index
(`units_legacy_hoa_idx`, `0005_units_backfill.sql:31`) is non-unique, and
`0028_property_bridge_backfill.sql:105-107` says so explicitly:

> multiple units CAN share a single hoa_property row (e.g., unit 101 and 102
> both at one address)

**Correction to the original review:** it claimed the list double-counts
today. It does not. I checked:

```
bridged units sampled:        184
hoa_properties with >1 unit:  0
```

So this is a structural risk, not a present defect — no duplex is currently
bridged that way. When one is, that property appears twice with different
`unit_id`, `balance` and `threads_needing_reply`, and any `count(*)` or
`sum(balance)` over the view double-counts it.

Fix if you want it closed before it can happen: aggregate the unit side, or
pick one deterministically —

```sql
LEFT JOIN LATERAL (
  SELECT id FROM public.units
  WHERE legacy_hoa_property_id = p.id
  ORDER BY created_at LIMIT 1
) u ON true
```

## 3. Three of the four new indexes duplicate existing ones — CONFIRMED

| `0039` adds | Already exists | Note |
|---|---|---|
| `payments_assessment_id_idx` (:48) | `payments_assessment_idx` — `0006_accounting.sql:358` | exact duplicate |
| `units_legacy_hoa_property_id_idx` (:52) | `units_legacy_hoa_idx` — `0005_units_backfill.sql:31` | duplicate, and **strictly worse** — drops the `WHERE … IS NOT NULL` partial predicate |
| `inbox_threads_unit_id_idx` (:50) | `inbox_threads(unit_id, last_message_at DESC)` — `0029_inbox.sql:106` | leading-column prefix of the composite |

Postgres does not deduplicate these. The cost is extra pages plus
per-INSERT/UPDATE maintenance on `payments` and `inbox_threads` — two of the
highest-churn tables here — for no read benefit.

Only `hoa_violations_property_id_idx` adds anything, and even that overlaps
`idx_hoa_violations_property` (`0000_schema.sql:311`).

## 4. `days_overdue` and `balance` are computed on inconsistent bases — CONFIRMED

`oldest_due_date` is `MIN(due_date) FILTER (WHERE a.amount - paid > 0)` —
per-assessment — while `balance` is the net `SUM` across assessments, and
`payments.amount` is explicitly allowed to be negative (the comment at
`0039:119`).

A unit with a credit on one assessment and a smaller unpaid one shows
`balance` at or below zero **beside** `days_overdue = 45`, which reads as a
data bug on the list.

`severity_rank` is unaffected: rank 2 requires `balance > 0`.

---

## Suggested order

1. **#1** — it is live, and silent-failure bugs are the expensive kind.
2. **#3** — cheap to drop, and the write cost lands on your busiest tables.
3. **#2** — no rush while no property has two units, but cheap to close now
   and awkward to debug later.
4. **#4** — cosmetic until someone queries it, then confusing.

Happy to take any of these if you would rather not context-switch — say so
and I will, but I did not want to edit your migration unasked.
