# Properties Page Uplift — Design

**Date:** 2026-08-02
**Status:** Approved, ready for planning
**Surface:** `apps/hoa` — `(dashboard)/properties` (manager / board facing)

---

## 1. Problem

The properties page lists data but does not support work.

`apps/hoa/src/app/(dashboard)/properties/page.tsx` renders a nine-column table —
address, unit, owner, email, phone, tenure, notes, added, updated — where six of
those columns disappear at successive breakpoints. It answers "what properties
exist." It cannot answer "which properties need me today," because none of the
signals that would tell you are present: no balance, no open violations, no
unread correspondence, no indication that a property's data is broken.

Concretely, today:

- **No operational signal.** Finding a delinquent property means opening each one.
- **Search is a round trip.** A GET form submit with a Search button and a full
  page reload (`page.tsx:127-151`).
- **No sorting and no pagination.** The query has no `.limit()` — it selects
  every non-deleted property in the org (`page.tsx:55-62`).
- **The detail page is a single long scroll.** Seven stacked sections in
  `(dashboard)/properties/[id]/page.tsx` — Owner, Tenure, Residents,
  Correspondence, History, Violations, Dues — with no summary and no way to jump.
- **One bulk action.** Set tenure, and nothing else
  (`PropertiesBulkActions.tsx`).

The stated complaints from the requester were: cannot see what needs attention,
finding a property is slow, and the UI reads as dated.

## 2. Goals

1. Opening `/properties` shows the work queue, not an alphabetical inventory.
2. Reviewing many properties in sequence costs no page loads.
3. Property detail is navigable rather than scrolled.
4. The page works properly on a phone — this is a first-class path, not a fallback.
5. Correct behavior at 5,000+ properties per org.

## 3. Non-goals

- No new UI library, no new design system, no new color tokens. Everything is
  built from `@homeowner-portal/ui` and the existing Tailwind tokens in
  `apps/hoa/src/app/globals.css`. This was an explicit constraint.
- No changes to the resident portal. Resident-facing photo reporting is a
  separate spec (§12).
- No redesign of `/violations`, `/dues`, or `/inbox`. This page links to them.

## 4. Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Layout | Split view — list left, property right | Chosen over an enhanced table and an attention-dashboard variant |
| Panel depth | Full parity — the panel *is* the detail page | One implementation; no second view to maintain |
| Attention signals | Past-due balance, open violations, mail needing reply, missing/broken data | All four |
| Scale target | 5,000+ properties per org | Forces database-side aggregation |
| Inline actions | Existing actions, email/reply, log violation, bulk actions | All four |
| Phone support | First-class | Real phone use confirmed |
| Pagination | Offset, matching the inbox | Consistency over novelty |

## 5. Architecture — routing

Mirror the inbox, which already solves this exact problem in this codebase.

- `/properties` → list pane + a `hidden lg:flex` "Select a property" placeholder
- `/properties/<id>` → the same list in a `hidden lg:block` aside + the detail panel

Each route renders its own split view and fetches the list independently. This is
precisely what `(dashboard)/inbox/page.tsx:136-188` and
`(dashboard)/inbox/[id]/page.tsx:92-133` do today.

Two consequences worth stating plainly:

- **The phone experience falls out for free.** On narrow screens the aside is
  hidden and the panel is the page. There is no separate mobile build, no
  parallel routes, and no client-side router work.
- **URLs stay real.** `/properties/<id>` is shareable, the back button behaves,
  and search/filter/sort/page live in the query string so a filtered view is a
  link you can send someone.

Tabs use the existing `Tabs` component (`packages/ui/src/components/Tabs.tsx`,
already used on vendors / violations / documents / legal / accounting), driven by
a `?tab=` query param so every tab is deep-linkable and server-rendered.

### Files

```
(dashboard)/properties/
  page.tsx                    list + placeholder
  [id]/page.tsx               list (hidden on mobile) + panel
  PropertyList.tsx            left pane rows — mirrors inbox/ThreadList.tsx
  PropertyListFilters.tsx     search, filter chips, sort
  PropertyPanel.tsx           header + stat strip + Tabs shell
  panel/OverviewTab.tsx
  panel/ResidentsTab.tsx      absorbs today's Residents section
  panel/MailTab.tsx           absorbs today's Correspondence section
  panel/ViolationsTab.tsx
  panel/DuesTab.tsx
  panel/HistoryTab.tsx
```

Today's `[id]/page.tsx` stacked sections move into tabs. The existing client
islands — `TenureSelector`, `AddResidentForm`, `ResidentActions`, `ResidentRow`,
`PropertyActions`, `EnterPortalButton` — are relocated, not rewritten.

## 6. Architecture — data layer

Four signals across 5,000+ properties cannot be computed per row in application
code. A single Postgres view, `hoa_property_list_v`, added in **migration 0039**
(`migrations/` at repo root; highest existing is
`0038_dashboard_daily_snapshots.sql` as of 2026-08-03). Migration numbers
throughout this document are indicative — take the next available number at
implementation time, since other work lands migrations concurrently. This
document already moved 0037→0039 once for exactly that reason.

### Columns

Property identity fields, plus:

| Column | Meaning |
| --- | --- |
| `balance_cents` | Unpaid assessment total for the bridged unit |
| `oldest_due_date`, `days_overdue` | Age of the oldest unpaid assessment |
| `open_violations` | Unresolved violation count |
| `violations_past_cure` | Of those, how many are past their cure deadline |
| `threads_needing_reply` | Inbox threads in `needs_review` / `open` for the unit |
| `has_owner`, `has_tenure`, `has_unit_link` | Data-gap booleans |
| `severity_rank` | Precomputed integer for ordering |

`severity_rank` exists so "sort by severity" is a plain indexed column sort
rather than application logic — and so the ranking has exactly one definition.

**`threads_needing_reply` counts `needs_review` and `open` only.** `waiting`
means the ball is in the resident's court and must not read as work owed by the
association; `closed` is done. This distinction is the entire point of the
signal, so it is defined here rather than left to the implementation.

**`severity_rank` ordering**, lowest number sorts first:

| Rank | Condition |
| --- | --- |
| 1 | Violation past its cure deadline |
| 2 | Past-due balance |
| 3 | Open violation within its cure window |
| 4 | Mail awaiting reply |
| 5 | Data gap — missing owner, tenure, or unit link |
| 6 | Clear |

A property matching several conditions takes its lowest rank. Past-cure
outranks money because a lapsed cure deadline has legal consequences and a
deadline that has already passed cannot be recovered by acting sooner, whereas a
balance keeps accruing predictably. Ranks 1–2 render as a red dot, 3–4 amber,
5 slate, 6 pale.

### Correctness requirements

- **`security_invoker = on` is mandatory, and on its own is not enough.**
  Without it the view executes with its owner's rights and bypasses RLS on
  `assessments`, `hoa_violations`, and `inbox_threads` — cross-org leakage.
  But the base-table policies it would then inherit are org-scoped with **no
  role gate**: `0000_schema.sql:398-399` defines `org_access` on both
  `hoa_properties` and `hoa_violations` as plain
  `org_id = ANY (public.auth_org_ids())`. Every resident of an association can
  already read every property and violation row in it via PostgREST. A view
  that aggregates balance, open violations, and unread mail per property would
  hand a resident their neighbours' financial and enforcement history in one
  convenient query — a materially worse exposure than the raw tables, because
  it does the correlation for them.

  **The view must therefore also gate on board/admin**, carrying
  `public.auth_is_board_or_admin(org_id)` in its own `WHERE` clause alongside
  `security_invoker = on`. This is the same role-free gap that
  `0036_ai_runs_board_only.sql` closed on `ai_runs` and that
  `0038_dashboard_daily_snapshots.sql` explicitly designs against — its comment
  names the identical hazard for open-violation and dues-outstanding counts.
  `auth_is_board_or_admin` is defined in `0012_rbac_roles.sql`.

  Both halves are covered by dedicated tests (§10): one for cross-org, one for
  same-org resident access.

- **This would be the first SQL view in the repository.** `grep` over
  `migrations/` finds no `CREATE VIEW`, no materialized view, and no existing
  `security_invoker` usage. The established pattern for aggregates here is a
  table with RLS (`0038`). A view is still the right call — that snapshot table
  answers "what did yesterday look like" whereas this must be live — but it is a
  novel construct in this codebase, so the migration carries no house style to
  copy and the RLS reasoning above has to be got right from first principles
  rather than by analogy.
- **`LEFT JOIN units ON units.legacy_hoa_property_id = hoa_properties.id`.**
  A null there *is* the "no unit link" data gap. Assessments and correspondence
  key on `units`, not `hoa_properties`, so an unbridged property silently shows
  no dues and no mail with no visible symptom today. The list now surfaces it.
- **Past-cure is `notice_sent_at + cure_period_days < now()`,** not
  `created_at + cure_period_days`. The cure clock starts when the notice went
  out; a null `notice_sent_at` means no clock is running and the violation is
  not past cure.
- **Soft deletes**: every base-table join must carry `deleted_at is null`,
  consistent with existing queries.

Exact column names on `assessments`, `payments`, and `inbox_threads` must be
confirmed against the schema when the migration is written — this section names
the joins and the semantics, not verified DDL.

### Indexes

- `pg_trgm` GIN index covering `address`, `unit_number`, `owner_name`,
  `owner_email`. Today's search is four `ilike %term%` predicates combined with
  `.or()` (`page.tsx:69-81`), which cannot use a btree index at all.
- Supporting btree indexes on the aggregate join keys:
  `assessments(unit_id)`, `payments(assessment_id)`,
  `hoa_violations(property_id)`, `inbox_threads(unit_id)`.

The existing wildcard-escaping logic (`page.tsx:74-81` — capping length,
escaping `%`, `_`, `\`, and stripping PostgREST `,`, `(`, `)` separators) is
correct and carries over unchanged.

### Performance approach

Start with a plain view plus indexes, then measure with `EXPLAIN (ANALYZE,
BUFFERS)` against a 5,000-row fixture. Escalate only if the measurement demands
it, in this order: materialized view with a refresh job → denormalized counter
columns maintained by triggers. Correctness first; the escalation path stays
open and documented rather than pre-emptively taken.

**Measured 2026-08-06 — the plain view holds; no escalation needed.** Against a
5,000-property fixture on the production database, running the real page query
(org scope + `severity_rank < 6` + severity ordering + `LIMIT 50`):

| | Execution | Base-scan node |
| --- | --- | --- |
| `0039` as first written | 136.9 ms | 94.5 ms |
| `0040`, board gate hoisted out of the row loop | **40.9 ms** | **3.2 ms** |

The first measurement found that `auth_is_board_or_admin` is `SECURITY DEFINER`
and therefore un-inlinable, so it ran once per candidate row — 69% of the whole
query. `0040` expresses the same membership test as a subquery the planner
evaluates once. See that migration's header for why this is strictly more
restrictive, never less.

Three caveats recorded so the number is not over-read:

- The fixture's properties carry no assessments, violations, or threads, so each
  of the 5,000 aggregate probes finds nothing. Probe cost — the dominant term —
  is measured honestly; real rows add heap fetches on top.
- Planning time is 25.6 ms, roughly 60% of execution again, and PostgREST does
  not reliably reuse plans. Budget for it per request.
- `severity_rank` is computed for every matching row before the filter discards
  them (4,072 of 5,000 in the fixture). That is structural to ordering by a
  computed column and is fine at 5,000; it would resurface around 50,000.

An earlier run reported 7 ms and was discarded as meaningless: the SQL editor has
no `auth.uid()`, so every row failed the board predicate and no aggregate ran. A
second run reported 136 ms with the dues aggregate showing `Memoize … Hits: 4999`
— every fixture property lacked a unit, so the cache key was a constant `NULL`
and the lookup collapsed to one execution. Only the third run, with a unit per
property, exercised the aggregates 5,000 times.

### Pagination

Offset pagination, page size 50, rendered as `Showing 1–50 of 312` with
Previous/Next links — matching `inbox/page.tsx:154-182`. This is adequate
because the default view is "Needs attention" (hundreds of rows, not thousands),
and it avoids introducing virtualization as a novel mechanism in this codebase.

## 7. Left pane

Row anatomy, mirroring `inbox/ThreadList.tsx`:

- One **severity dot** carrying worst-case severity, so 50 rows can be scanned
  without being read:
  - **Red** — past-due balance, or a violation past its cure date
  - **Amber** — open violation still within its cure window, or mail awaiting reply
  - **Slate** — data gap (no owner, no tenure, no unit link)
  - **Pale** — nothing outstanding
- Address (+ unit), owner name, tenure.
- Right-aligned balance, tabular figures so amounts align down the column.
- Reason pills, rendered only when there is something to say.
- Selected row: `border-l-4 border-primary bg-primary/5`, identical to
  `ThreadList.tsx:80-82`.
- Checkbox appears on hover and persists once anything is selected.

**Color is never the only cue.** Every dot has a text label, and the pills spell
out the reason — required for accessibility and because the severity ordering is
not self-evident from hue.

**Color convention.** There are no `text-success` / `text-warning` utilities in
this repo; `packages/ui/tailwind.config.ts` defines only primary, accent,
background, surface, border, foreground, muted, and destructive as CSS-variable
tokens. Severity colors therefore use `text-destructive` plus literal
`emerald-700 dark:emerald-400` / `amber-700 dark:amber-400` pairs, which is the
convention already documented and followed in `ThreadList.tsx:19-25`.

**Controls.** Instant search input, filter chips (Needs attention / All /
Owner-occupied / Leased / Unknown) with counts, and a sort control. Active chip
uses solid `bg-primary text-primary-fg`, matching `inbox/page.tsx:143-147`.

**Default view is "Needs attention," sorted by severity** — the page opens on the
work queue rather than on 5,214 alphabetical rows.

## 8. Right pane

- **Header** — address, unit, tenure badge, owner line, and actions.
- **Stat strip** — Balance / Open violations / Residents / Unread mail, built
  from the existing `StatCard`. Each tile is clickable and jumps to its tab.
  Each carries a context line ("92 days overdue", "1 past cure").
- **Tabs** — Overview, Residents, Mail, Violations, Dues, History.
  Overview shows recent activity plus a residents summary and tenure control;
  the rest are today's sections, relocated.

## 9. Phone

The routing in §5 produces this without a second implementation. Specific
adaptations:

- `BackLink` to `/properties` in place of the hidden aside.
- Call / Email as one-tap header buttons firing the native dialer and mail app.
- Stat strip as a 2×2 grid rather than four crushed columns, keeping context lines.
- Tabs scroll horizontally — same six tabs, no separate information architecture.
- **Log violation is a persistent floating button**, not buried in an overflow
  menu, because logging what you are standing in front of is the phone task.
- **No bulk select on phone.** Multi-select on a touch list is fiddly and is not
  a walk-through task.

## 10. Error handling

- **List query failure** → `Alert variant="error"` inside the list pane. Today
  the raw `error.message` renders in a bare Card (`page.tsx:181-184`); the panel
  should stay usable.
- **Missing unit link** → a visible slate signal in the list and a named state in
  the panel. Today this condition is invisible while silently breaking dues and
  correspondence. The existing "not linked to a mailbox unit" empty state
  (`[id]/page.tsx:266-271`) already models the panel half of this correctly.
- **Photo upload failure** → toast, but the violation still saves. Never lose the
  write because the image failed.
- **Bulk action partial failure** → the existing updated/failed toast contract in
  `PropertiesBulkActions.tsx:98-108` is preserved.

## 11. Testing

Unit tests run under vitest (`pnpm test:unit`); e2e under Playwright, with
`apps/hoa/e2e/inbox.spec.ts` as the direct precedent for a split-view spec.

- **Two RLS regression tests on the view — the highest-value tests in the change.**
  Both leak silently if they regress, and nothing else in the suite would notice.
  1. *Cross-org:* a user in org A must not see org B rows through
     `hoa_property_list_v`. This is the `security_invoker` guard.
  2. *Same-org role:* a **resident** of org A must see **zero** rows, while a
     board member of org A sees them. This is the `auth_is_board_or_admin`
     guard, and it is the one a reasonable implementer is most likely to omit,
     because the page it feeds is already board-gated at the route level and so
     the omission is invisible through the UI. The exposure is via PostgREST,
     not the app.
- **`severity_rank` fixtures** covering each signal combination, including the
  precedence between a red money signal and a red violation signal.
- **Past-cure boundary** — `notice_sent_at` null, exactly at the cure date, and
  past it.
- **Search escaping** — `%`, `_`, `\`, `,`, `(`, `)` still behave with the trgm
  index in play.
- **`EXPLAIN (ANALYZE, BUFFERS)`** against a 5,000-property fixture, recorded in
  the PR, as the evidence for the §6 performance decision.
- **Playwright `properties.spec.ts`** — select a property, deep-link to
  `/properties/<id>?tab=dues`, and a narrow-viewport pass for the phone flow.

## 12. Phasing

Two implementation plans.

**Phase 1 — foundation and read.**
Migration 0039 (view, `security_invoker` + board/admin gate, trgm + btree indexes); the query
module; split-view routing; left pane with all four signals, search, filters,
sort, and pagination; panel with all six tabs at parity with today's detail page;
phone path. Ships a complete, better properties page on its own.

**Phase 2 — actions.**
Migration 0040 (`hoa_violation_attachments`, copied from
`migrations/0027_submission_attachments.sql`); email owner and inline reply; log
violation with photo upload; bulk actions beyond tenure; mobile floating action
button.

Phase 1 stands alone. Stopping there still delivers the split view, the attention
signals, and the phone experience.

### Related, separate work

Resident-facing photo reporting is **not** part of this spec. It is a different
surface (`apps/hoa/src/app/resident/`) with a different user. The gap there:
`resident/report-violation/ReportViolationForm.tsx` has no photo field, so a
resident can only attach a photo after the fact from
`resident/violations/[id]`. The pieces already exist —
`components/attachments/SubmissionAttachments.tsx`, the `hoa-documents` bucket,
storage RLS from `0003_storage_policies.sql`, and `image/heic` already in
`ALLOWED_TYPES` (`lib/submission-attachments.ts:14-20`). It gets its own spec and
is scheduled **before** Phase 1.

## 13. Risks

- **View performance is the main unknown.** Mitigated by measuring rather than
  assuming, with a documented escalation path (§6).
- **Scope.** All four signals and all four action groups is a lot; the phasing in
  §12 is what keeps Phase 1 reviewable.
- **Tab migration is where regressions hide.** Moving six sections out of a
  600-line page risks quietly dropping behavior — particularly the admin-only
  `EnterPortalButton` gating and the lease-cap logic feeding `TenureSelector`.
  Both need explicit coverage.

## 14. Reference

Design was explored visually; mockups persist at
`.superpowers/brainstorm/23538-1785715237/content/` (gitignored) —
`list-layout.html` (three layout directions), `split-design.html` (approved
desktop design), `mobile-design.html` (approved phone design).
