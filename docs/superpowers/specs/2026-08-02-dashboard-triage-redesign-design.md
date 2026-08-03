# Dashboard triage redesign

**Date:** 2026-08-02
**Status:** approved, ready for implementation planning

## Problem

The dashboard does not answer the only question a board member opens it to
ask: *what needs me today?*

Four findings from reviewing the page against live data:

1. **The shared inbox is invisible.** Not merely absent from the digest —
   absent from the entire page. `generateDailyDigest` takes eight inputs
   (violations, dues, approvals, tickets, ARC, concerns, meetings) and not
   one comes from the mailbox. Live counts at time of writing: 398 threads
   whose last message is inbound and not closed, all 398 unassigned.

2. **There is no "unread" to read.** `inbox_threads` has no `read_at` or
   `is_read` column. "Unread" has to be defined, not queried. The honest
   proxies are `status` (triage state) and `last_direction = 'inbound'`
   (they wrote last and we have not answered).

3. **A raw count would mislead.** Of 398 open threads, 32 are matched to a
   property and 365 match nothing — and the unmatched set is dominated by
   marketing mail (Shutterfly, Patreon, earnings alerts). Rendering "365
   need review" trains the reader to ignore the number. But "unmatched" is
   not "junk": a resident who is not yet in the property roster also lands
   there, so the 365 cannot simply be hidden either.

4. **The layout is inverted.** The digest spends a model call restating
   counts that render as KPI tiles immediately beneath it. Charts and
   donuts hold prime position while "This week" (approvals, at-risk) and
   the heat map are collapsed `<details>`. Decorative content outranks
   actionable content.

## Scope

In scope: the dashboard page — a new mail-triage data layer, a rebuilt
digest, a repointed tile row, and a reordered layout.

Out of scope, deliberately:

- **Bulk-mail suppression at ingest.** Detecting `List-Unsubscribe` /
  `Precedence: bulk` so marketing mail never reaches `needs_review` is
  ingest-level work in `packages/mailbox` (the parser does not currently
  capture arbitrary headers). It needs its own spec. Until it exists the
  untriaged count stays near 365.
- **Bulk "not relevant" triage in the inbox list.** Would let the backlog
  be burned down by hand using the existing `closed` status. Inbox UI work,
  not dashboard work.
- **Trend arrows on the triage tiles.** The snapshot table below makes them
  possible later; shipping them now would require history that does not
  exist yet.

## Definitions

These are the load-bearing decisions. Every count below is additionally
scoped `.eq('organization_id', orgId)`.

| term | definition |
| --- | --- |
| **needs a reply** | `unit_id IS NOT NULL AND last_direction = 'inbound' AND status IN ('needs_review','open')` |
| **oldest waiting** | whole days since `min(last_message_at)` across the "needs a reply" set |
| **untriaged** | `unit_id IS NULL AND status IN ('needs_review','open')` |

`status = 'waiting'` is excluded from both counts: it means a human
deliberately parked the thread, and counting it as needing attention today
would defeat the act of parking it. `status = 'closed'` is excluded for the
obvious reason.

Explicit org scoping is required even for lookups that look safe by
chain-of-trust. RLS via `auth_org_ids()` returns every org a user belongs
to, so for a management-company admin spanning several HOAs an unscoped
query can resolve rows from a different org than the caller passed in. This
matches the rule documented at the top of `apps/hoa/src/lib/inbox/queries.ts`.

## Data layer

New module `apps/hoa/src/lib/dashboard/triage.ts`. Not an addition to
`lib/dashboard/queries.ts`, which is already 845 lines spanning six
unrelated concerns.

```ts
export interface TriageThread {
  id: string
  subject: string | null
  fromName: string | null
  lastMessageAt: string | null
  waitingDays: number
}

export interface TriageSnapshot {
  needsReply: { count: number; oldestWaitingDays: number | null }
  untriaged:  { count: number }
  threads:    TriageThread[]   // at most 5, oldest-waiting first
  failed:     boolean          // true = counts unknown, NOT zero
}

export async function getTriageSnapshot(
  db: Db,
  orgId: string,
): Promise<TriageSnapshot>
```

### Error posture

A count that silently falls back to `0` reads as "nothing to do" and the
queue gets skipped entirely. `countThreadsByStatus` already throws for this
reason. This module never returns a fabricated zero: on query failure it
returns `failed: true` and the card renders **"Couldn't load your mail
queue — open the inbox"**. A real zero and a broken query must never look
identical.

It must also not take the page down. `DashboardContent` currently runs one
`Promise.all`, so any throw kills the whole dashboard. The triage card gets
its own `<Suspense>` boundary — a mailbox outage costs that one card.

## Components

**New — `apps/hoa/src/components/dashboard/MailTriageCard.tsx`**

Headline count, an oldest-waiting line, up to five thread rows linking to
`/inbox/[id]`, and a deliberately quieter footer
`N unmatched, untriaged ›` linking to `/inbox?filter=needs_review`.
Renders the failure state above rather than a zero.

**Changed — the tile row.** `KpiHero` is reused unchanged and repointed to:
Needs a reply · Oldest waiting · Approvals pending · Dues overdue.

`KpiHero` draws its trend arrow from a `previous` value. No historical
snapshots of the mail queue exist yet, so the two triage tiles ship without
arrows rather than with invented ones. Dues overdue and Approvals keep
theirs — `getDashboardKpis` already computes both.

**Cut — "Active vendors."** Reference data, not a daily decision.

**Moved into a collapsed "Money & compliance" section:** both donuts,
`ActivityBar`, `LeaseSummaryCard`, and Open violations / Open tickets as
tiles. Nothing is deleted; it stops competing with today's work. The heat
map stays collapsed as it is now.

**"This week" opens by default** rather than only when non-empty. A
confirmed "nothing urgent" is worth seeing.

### Layout order

1. Greeting
2. Digest — AI suggestion line, then deterministic bullets
3. Four triage tiles
4. `MailTriageCard`
5. This week — approvals, at-risk, next meeting (open)
6. Money & compliance (collapsed)
7. 3-month compliance heat map (collapsed)

## The digest

**Division of labour: the tiles own current numbers; the digest owns what
changed and what to do first.** Bulleting "32 emails need a reply" directly
above a tile reading "Needs a reply 32" would rebuild the duplication this
redesign exists to remove.

So the deterministic bullets are the things a tile structurally cannot show:

```
✨ Start with the retention pond thread — oldest, unanswered 6d   ← AI

• 3 new resident emails since yesterday
• 2 have now waited over 3 days
• Next meeting: Thursday
```

### Where each bullet comes from

Two of these are computable live and must not be derived by subtracting
stored counts — a net subtraction reports "0 new" on a day when three
arrived and three were answered, which is false.

| bullet | source |
| --- | --- |
| "N new resident emails since yesterday" | live: needs-a-reply threads with `last_message_at >= baseline.captured_at`, falling back to start-of-today when no baseline exists |
| "N have now waited over 3 days" | live: needs-a-reply threads with `last_message_at < now() - 3 days` |
| "Next meeting: …" | existing `getNextMeeting` |
| net change vs yesterday (future trend arrows) | `dashboard_daily_snapshots` |

This is the honest accounting of what the snapshot table buys: it is *not*
needed for the two bullets above. It exists for point-in-time comparison —
"down 4 from yesterday" and the trend arrows in a later change — which
cannot be reconstructed from live data at all, because nothing else records
what the queue looked like on a past day.

### AI grounding

`generateDailyDigest` changes shape. It receives the computed facts plus at
most five thread subjects and returns **one sentence naming what to start
with**. It is never asked to produce a count, so it has no opportunity to
state a wrong one. The line renders as a suggestion, visually distinct from
the facts beneath it.

The response is dropped — rendering facts only — when it is empty,
whitespace-only, or longer than 200 characters. 200 is roughly two lines at
the card's width; beyond that the model has stopped answering "what should
I start with" and started writing prose, which is the failure mode this
rewrite exists to end.

`hoa_digests.content` continues to store that line — no change to that
table. Digests written before this change hold prose; it will render in the
suggestion slot until the next refresh replaces it.

The auto-refresh drops from every 4 hours to once per day. Its only
remaining job is fetching a fresh sentence about today.

## History

`hoa_digests` is PK'd on `org_id` — one row per org, overwritten on every
refresh. Deltas therefore need a table, not a column: with single-row
storage a mid-afternoon refresh would move the baseline and the delta would
read "0 new" for the rest of the day.

**Migration `0038_dashboard_daily_snapshots.sql`:**

```sql
CREATE TABLE IF NOT EXISTS public.dashboard_daily_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  captured_on     date NOT NULL,
  counts          jsonb NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_daily_snapshots_org_day_uniq
  ON public.dashboard_daily_snapshots(organization_id, captured_on);
```

Written `ON CONFLICT DO NOTHING` — one row per org per day, first write
wins. **The delta baseline is the most recent row with `captured_on <
today`**, so refreshes during the day never disturb it.

RLS enabled, with an explicit role check in the policy — reads restricted
to the same roles `requireBoardOrAdmin()` admits, writes to the service
role only. Migration `0036_ai_runs_board_only.sql` exists because a
role-free policy shipped once already; follow its policy shape.

`counts` holds exactly the four tile values, so the snapshot table becomes
the source for trend arrows in a later change without a second migration:

```jsonc
{
  "needsReply": 32,          // matched, awaiting our reply
  "oldestWaitingDays": 6,    // null when needsReply is 0
  "untriaged": 365,          // unmatched, not closed or waiting
  "approvalsPending": 3,
  "duesOutstandingUsd": 4200 // same unit getDashboardKpis already returns
}
```

`duesOutstandingUsd` stores whole US dollars, matching the field
`getDashboardKpis` already produces. There is no cents convention in this
codebase to align with, and introducing a unit conversion that exists
nowhere else would create a rounding seam between the snapshot and the tile
it is meant to be compared against.

## Failure behaviour

| what breaks | what the user sees |
| --- | --- |
| triage query | "Couldn't load your mail queue" — never `0` |
| AI call | facts render, suggestion line absent, no alarm banner |
| snapshot write | logged; page renders normally |
| no prior-day snapshot | deltas omitted entirely, not shown as "0 new" |

Telemetry must never block the page — that is the rule behind row three.

Row two is a behaviour change worth naming: `/api/ai/daily-digest`
currently returns **503** and the card renders a warning `Alert` when the
model is unreachable. Under this design an AI outage is no longer an error
state, because the card's real content is deterministic. The route returns
200 with the facts and omits the suggestion.

## Testing

`vitest.config.ts` is deliberately pure-modules-only, so coverage sits at
the logic layer rather than the DOM.

`triage.ts`, against a fake Supabase client:

- `status = 'waiting'` is excluded from both counts
- `status = 'closed'` is excluded from both counts
- matched vs unmatched threads land in the right bucket
- oldest-waiting arithmetic, including the single-thread case
- a query failure yields `failed: true`, never `0`

Delta computation:

- baseline taken from the most recent prior-day snapshot
- a same-day snapshot does not become the baseline
- no prior snapshot yields omitted deltas, not "0 new"
- correct across a month boundary

Route:

- an AI failure returns 200 with facts intact and no suggestion

## Open follow-ups

1. Bulk-mail suppression at ingest — until then the untriaged count stays
   near 365.
2. Bulk "not relevant" triage in the inbox list, to burn the backlog down.
3. Trend arrows on the triage tiles, once snapshots have accumulated.
