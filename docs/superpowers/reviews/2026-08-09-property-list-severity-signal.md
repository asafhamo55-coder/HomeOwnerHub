# The properties list severity signal carries no information

**For:** the properties workstream (Phase 1A/1B)
**From:** the inbox/vendor workstream
**Date:** 2026-08-09

Observed while looking at the rendered `/properties` page on a 1440×900
viewport against live Creek Valley data. I fixed three markup-level defects
in the list rows (`d1d17c1`); **this one I have not touched**, because the
fix is in the severity model rather than the UI, and that is yours.

## What it looks like

The header reads:

> **132 needing attention** · 135 homes in Creek Valley HOA (Demo)

Every visible row is identical:

```
● 105 Springwood Pkwy · CV-018
  Stephanie Wilson
  [1 past cure date] [Missing data]

● 108 Hollybrook Trce · CV-029
  Patricia Lewis
  [1 past cure date] [Missing data]

● 117 Camellia Way · CV-052
  George Taylor
  [1 past cure date] [Missing data]
```

Same red dot, same two pills, all the way down.

## Why it matters

**98% of properties are flagged**, so the flag no longer separates anything.
A severity dot earns its place by being rare — when it is on every row it
stops being a signal and becomes background texture, and the eye has nothing
to land on. The sort is "Severity" by default, which means the default view
is ordered by a field that is effectively constant.

The practical cost: a manager opening this page to find what needs work gets
135 undifferentiated rows. The list is doing the same job as an unsorted
table, while spending a colour, a dot, and two pills per row to say so.

This is worth separating from taste. It is not that the rows look
cluttered — it is that `severity_rank` currently has almost no variance on
real data, so no presentation of it can be informative.

## Where it comes from

Both pills fire on nearly every row, which suggests each has a threshold
that essentially always trips:

- **`1 past cure date`** — a violation past its cure date. Worth checking
  whether the demo data has one stale violation per property, or whether the
  predicate catches any violation with a cure date in the past regardless of
  whether it is resolved.
- **`Missing data`** — almost certainly firing on the same absent fields for
  every property. Note this is the same dataset where `tenure` is `'unknown'`
  on essentially every row (that is what forced the row-level fix in
  `d1d17c1`), so if `Missing data` keys off tenure it will be universal by
  construction.

I have deliberately not diagnosed further — `severity.ts`, the
`severity_rank` expression in `0039`/`0040`, and the demo data are all
yours, and guessing at your intent would waste your time more than it saves.

## Worth considering

Whatever the cause, the useful question is probably not "how do we render
this better" but **"what should be rare enough to be worth a red dot?"** A
signal that fires on 98% of rows and one that fires on 5% need different
thresholds, not different styling.

If the demo data is simply unrepresentative and real associations look
nothing like this, then this is a seeding problem and the UI is fine — but
that is worth confirming, because the page is currently unusable against the
data you have.

## What I changed, so you can merge cleanly

`d1d17c1` touches `PropertyList.tsx`, both `properties/page.tsx` files, and
adds `streetOf` to `severity.ts` with tests. All three changes are
presentational and independent of `severity_rank`:

- rows render the street line, full address on `title`
- `tenure === 'unknown'` renders nothing instead of the word "unknown"
- the list pane widens with the viewport instead of `xl:max-w-xs`

Nothing in the severity model, the pills, or the ranking was modified.
