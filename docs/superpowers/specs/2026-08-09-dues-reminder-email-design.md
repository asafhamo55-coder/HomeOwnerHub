# Dues Reminder Emails — Design

**Date:** 2026-08-09
**Status:** Approved (brainstorming complete, pending implementation plan)
**App:** `apps/hoa`

## Problem

A manager looking at `/dues` can see who is behind but has no way to tell them. The
only path today is the general `/communications` composer, which sends one identical
body to everyone — it cannot tell Dana she owes $1,240 across two properties while
telling Sam he owes $310 on one.

Residents should receive **one email covering everything they owe**, not one email per
charge and not one per property.

## Decisions

| Question | Decision |
|---|---|
| Trigger | Manager-initiated only — per-owner and bulk, both from `/dues`. No cron, no changes to the `/communications` composer. |
| Consolidation | One email per **person** (keyed by email address), grouped by property, one grand total. |
| Charge scope | The email lists **all open charges** — past-due flagged, upcoming listed plainly — so the resident can settle in one payment. |
| Bulk eligibility | Only owners with at least one **past-due** charge. Keeps it a reminder, not a monthly statement. |
| Per-owner eligibility | Any owner with `totalDue > 0` — the manager explicitly picked them, and may want to flag an upcoming special assessment. |
| Recipient | **Owners only**, every owner on record. Tenants never receive a delinquency notice. |
| Send flow | Preview dialog + optional free-text note. The charge table is always generated, never hand-edited. |
| Repeats | Surface "last reminded", warn on bulk, never block. |
| Channel | Email only. (SMS cannot carry a charge table within the 279-char limit; the portal channel becomes available later for free.) |
| Layout | "Cards" — property blocks, two-line charge rows, status pills. Matches the resident portal's existing row style. |

## Architecture

Approach chosen: **make the communications pipeline a pure delivery layer, and put all
dues knowledge in a new module.** The dues module answers *who owes what*; the
communications module answers *deliver it and log it*. Neither reaches into the other —
`audience.ts` never learns what an assessment is.

Two alternatives were rejected:

- **One `sendCommunication` call per person** (no shared-code changes) — a 14-person
  bulk send would create 14 separate campaign rows in `/communications`, and manual
  recipients carry `unit_id: null` with no `userId`, losing unit linkage and portal delivery.
- **Fully standalone with its own table and direct `sendEmail`** — rebuilds delivery
  tracking from scratch and creates a second source of truth for "what have we sent this
  resident." Delinquency notices are exactly the messages you get asked to prove you sent.

### New module: `apps/hoa/src/lib/dues-reminders/`

Mirrors the existing `communications/` file layout.

| File | Responsibility | I/O |
|---|---|---|
| `packets.ts` | `buildReminderPackets(assocId, opts)` → `ReminderPacket[]` — query outstanding charges, group into per-person packets | DB reads |
| `render.ts` | `renderPacketHtml(packet, note)` / `renderPacketText(packet)` → string | **pure** |
| `queries.ts` | `getLastRemindedByEmail(assocId)` → `Map<email, Date>` | DB reads |
| `actions.ts` | `'use server'` — `previewDuesReminders()`, `sendDuesReminders()` | orchestration |

`render.ts` is deliberately pure so the entire email layout is unit-testable against
fixture packets with no database in the loop.

### Changes to shared code (both additive)

**`communications/audience.ts`**

- `AudienceKind` gains `'precomputed'`.
- `AudienceDefinition` gains `recipients?: ResolvedRecipient[]`.
- `ResolvedRecipient` gains optional `unitIds?: string[]` — a person can span several
  properties. The existing single `unitId` stays as the primary for the recipient-row FK.
- `resolveAudience()` short-circuits on `precomputed` exactly as `specific_residents`,
  `board`, and `manual_emails` already do, returning the caller's list verbatim.
- One new `case` in `summaryFor()`.

**`communications/send.ts`**

- `SendSchema` accepts `'precomputed'` and a `recipients` array.
- New optional top-level field `extraMergeFields?: Record<string, MergeBag>`, keyed by
  recipient email.
- Inside `deliverOne()`, spread `extraMergeFields[recipient.email]` into the existing
  `bag` before rendering. Roughly ten lines.

Every existing caller is unaffected because the new field is optional.

This is what makes per-recipient bodies possible: `bodyHtml` becomes a thin shell —
`Hi {{owner_name}}, {{note_block}} {{dues_table}}` — and the dues module supplies each
person's rendered `dues_table` and `total_due`. The subject line uses `{{total_due}}` too,
since `sendCommunication` already runs the subject through `renderTemplate`.

`renderTemplate`'s placeholder pattern is `[a-zA-Z0-9_]+` and it does a plain string
replace with no escaping, so injecting pre-rendered HTML through a merge field works.

Three merge fields are supplied per recipient: `dues_table` (that person's rendered
property blocks as HTML), `dues_text` (the same content as plain text), and
`amount_summary` (e.g. `$1,240.00 due, $420.00 past due`, or just `$310.00 due` when
nothing is late — used in the subject line, which avoids needing conditionals in the
template engine).

The manager's note is **not** a merge field. It is identical for every recipient in a
send, so it is escaped once and baked into the shell body at build time. `owner_name` and
`association_name` come from the merge bag `sendCommunication` already builds.

### Logging and "last reminded"

Every send writes one `communications` row with `category: 'dues'` and
`related_resource: { type: 'dues_reminder', id: <associationId> }`. That marker
distinguishes a reminder from a hand-written dues announcement.
`getLastRemindedByEmail` reads `max(sent_at)` per email off it.

`communications.audience_definition` is persisted as jsonb. For `precomputed` we store
only `{ kind: 'precomputed' }` — **not** the recipient array — so names and emails aren't
duplicated into the campaign row. They already live in `communication_recipients`, which
is the correct place for them.

## Data model

```ts
interface ReminderCharge {
  id: string
  assessmentType: string        // regular | special | late_fee | fine
  dueDate: string               // 'YYYY-MM-DD'
  amount: number                // original assessment
  paid: number                  // sum of payments
  balance: number               // amount - paid, floored at 0
  pastDue: boolean
  daysLate: number              // 0 when not past due
}

interface ReminderProperty {
  unitId: string
  label: string                 // "14 Oak St" / "22 Oak St · Unit B"
  charges: ReminderCharge[]
  subtotal: number              // sum of balance
}

interface ReminderPacket {
  email: string                 // the recipient key
  ownerName: string
  userId: string | null
  properties: ReminderProperty[]
  totalDue: number
  pastDueTotal: number
  oldestDaysLate: number
  chargeCount: number
}

interface PacketBuildResult {
  packets: ReminderPacket[]
  skipped: { ownerName: string; unitLabel: string }[]   // no email on file
}
```

### Query

Assessments for the association where `status in ('open','partial')` and
`deleted_at is null`, selected with `payments(amount)` and
`unit:unit_id(id, address_line1, unit_number)` — the same select shape
`dues/page.tsx` already uses. Real assessment statuses are `open | partial | paid |
waived`; the `overdue` / `due` labels on the manager dues page are computed from the
date, not stored.

### Balance

Each charge's balance is `amount − Σ payments`, floored at zero. Charges landing at
≤ 0 are dropped entirely.

This mirrors what `resident-dashboard.ts:202-225` already does — it fetches payments in a
second query, computes `remaining`, and skips charges at `remaining <= 0`. The reminder
must produce the **same** number the resident sees in the portal, or a manager chasing
$310 will get a reply quoting $150. Correctness here is not optional: dunning someone for
money they already paid is the worst way this feature could fail.

> **Correction to an earlier draft of this spec.** A previous revision claimed
> `resident-dashboard.ts` failed to subtract payments and scheduled a fix for it. That was
> wrong — it was read from the `select` at line 187 without noticing the separate payments
> query below it. There is no bug there and no fix is needed. Nothing outside the dues
> module changes.

### Grouping into people

Pull `ownerships` where `valid_to is null` for the candidate units. Unlike
`resolveAudience`, do **not** collapse to one owner per unit — every owner row is kept.
Group by normalized email (`trim().toLowerCase()`); each group is one packet.

A jointly-owned unit contributes its charges to **both** co-owners' packets. They are
jointly liable and each should see the whole picture.

Owners with no email become `skipped[]` entries, surfaced in the dialog. Never silently
dropped.

### Consequences worth naming

- The dues page is keyed by **unit**, packets by **person**. Clicking "Remind" for
  14 Oak St sends Dana an email that also lists her charges at 22 Oak St. That is the
  requested consolidation, and the preview shows the exact email before it sends.
- A two-owner unit produces two emails from one click. The preview says so.
- Everything is scoped to `getPrimaryAssociation()`; charges from another association are
  never included, since the email carries one association's branding.

### Sorting

- Charges: past-due first (oldest first), then upcoming by due date.
- Properties: those with past-due charges first, then by subtotal descending.
- Packets in the preview list: largest `pastDueTotal` first.

### Shared constants and the date boundary

`CHARGE_TYPE_LABELS` currently lives inside `resident/dues/page.tsx`. It moves to a new
`lib/assessment-labels.ts` that both the page and the renderer import — it cannot live in
`lib/assessments.ts`, which is `'use server'` and may only export async functions.

"Today" is `new Date().toISOString().slice(0, 10)`, matching `audience.ts:139`. This means
the past-due boundary flips at UTC midnight rather than local midnight — consistent with
existing behaviour, and noted here so it is a known choice rather than a surprise.

**The two existing past-due boundaries disagree with each other.** `audience.ts:139` uses
`.lt('due_date', today)` — strictly before today. `resident-dashboard.ts:226` uses
`due_date <= today` — a charge due *today* is already past due. This design uses
**`dueDate < today`**: a charge due today is not late, which is both defensible to a
resident and consistent with the audience resolver that currently decides who counts as
delinquent. The discrepancy is recorded here rather than fixed, because changing
`resident-dashboard.ts` would shift what residents see in the portal and deserves its own
decision.

## Email design

**Layout: "Cards".** Each property is a soft block; each charge is a two-line row with
the amount and a status pill on the right. No column headers, no subtotals. Matches the
resident portal's existing `TappableRow` style.

**Structure, top to bottom:** association name → greeting → optional manager note →
total-due card (with past-due line) → per-property blocks → "View my dues" button →
how-to-pay line → footer explaining why they received it.

**Subject:** `Madison Park dues — $1,240.00 due, $420.00 past due`, with the past-due
clause dropped when there is none.

**Rules that hold regardless of content:**

- Past-due state always carries a **text** label ("39 days late"), never colour alone —
  Outlook and Gmail dark modes mangle colour.
- The CTA reads **View my dues**, not "Pay now". There is no online payment in the
  product; the resident portal says to contact the community manager. The link points at
  `/resident/dues`.
- A plain-text alternative mirrors the same order. `sendEmail` already accepts `text`.
- Light-only palette with explicit background colours on every cell, so client-side
  dark-mode inversion cannot destroy contrast.
- Email-safe construction: table layout, all styles inline, 600px max width.

**Graceful collapse.** Most owners have one property and one or two charges. In that case
the property heading and subtotal are dropped entirely — greeting, total, one or two
charge rows, button. Nothing that only makes sense for a multi-property owner survives
into the simple email. This is what keeps the common case from feeling bureaucratic.

## Manager UI

`/dues` is organised by fiscal period → unit; packets are organised by person. A "Remind"
button on each assessment row would be confusing — clicking it on the July row and the
September row does the same thing, because the email is always the person's whole balance.

So `/dues` gains a **"Who owes" panel** above the existing period tables, rendered only
when something is outstanding. The period tables below are unchanged.

```
┌ Who owes ────────────────────────────────────────────────┐
│ 12 owners · $18,420 outstanding · $6,240 past due        │
│                                    [ Send reminders ]     │
├───────────────────────────────────────────────────────────┤
│ Dana Whitfield    2 properties   $1,240   39d late        │
│                          Reminded 3d ago      [ Remind ]  │
│ Sam Okonkwo       1 property       $310   12d late        │
│                                               [ Remind ]  │
│ Priya Raman       1 property       $310   —               │
│                     No email on file        [ Remind ]    │ ← disabled
└───────────────────────────────────────────────────────────┘
```

Sorted by past-due total descending. This panel *is* the packet list, so the UI and the
data model stay in lockstep.

**The panel and the bulk button have different scopes, deliberately.** The panel lists
every owner with an outstanding balance, because the manager needs to see the whole
picture. The bulk button targets only the **past-due** subset. To keep that from
misleading, the button is labelled with its actual reach — `Send 8 reminders`, not a bare
"Send reminders" — and the dialog repeats the count. Owners listed in the panel but not
past due are reachable only through their individual `Remind` button.

### Send dialog

Bulk is the same dialog with N recipients instead of one — a single component, a single
code path to test.

- **Summary** — "14 owners · $18,420 outstanding"
- **Skipped warning** — "2 owners skipped — no email on file", expandable to names
- **Repeat warning** — "9 of these were reminded in the last 7 days". Informational,
  never blocking. The window is a single exported constant,
  `RECENT_REMINDER_DAYS = 7`, used by both the panel's "Reminded 3d ago" line and this
  warning, so the two can never disagree.
- **Optional note** — plain textarea, 500-char max, HTML-escaped before it enters the body
- **Preview** — one recipient's rendered email in an `<iframe srcdoc>` so email styles
  cannot leak into the app's CSS; a picker to flip between recipients when N > 1
- **[Cancel] [Send 14 reminders]** — disabled while in flight, then a toast with
  sent/failed counts linking to `/communications/[id]`

## Error handling

Three cases need real attention:

1. **`RESEND_API_KEY` missing is a silent-failure trap.** `email.ts:42` logs a warning and
   returns `{ ok: true, messageId: null }`. Inherited as-is, the dialog would report
   "14 sent" when zero emails left the building. The dues module treats a null
   `messageId` as **not sent**, and the dialog shows an "email delivery isn't configured"
   banner *before* the manager can click send. This is the one place the design
   deliberately deviates from existing behaviour.
2. **The manager's note is user input entering an email body** — HTML-escaped, no
   exceptions.
3. **Double-submit** would create two campaigns. The button disables in flight and the
   repeat warning covers the human case. Idempotency keys are overkill here.

The rest falls out of the model: no association → existing empty state; zero eligible
packets → bulk button disabled reading "No one is past due"; a fully-paid-but-still-`open`
charge is excluded by the `balance > 0` filter; per-recipient failures land on
`communication_recipients` with `delivery_status='failed'` and an error message, and the
parent campaign stays `sent` if any recipient succeeded — the pipeline's existing
behaviour, and correct.

## Testing

Vitest picks up colocated `apps/**/src/**/*.test.ts` in a `node` environment, matching the
existing `property-residents.test.ts` and `attachment-rules.test.ts` pattern.

**`render.ts`** — pure, so coverage concentrates here. Single-charge collapse (no property
heading, no subtotal), multi-property grouping, past-due text labels, note escaping,
currency formatting, the plain-text mirror matching the HTML's order, and the
no-past-due subject variant.

**`packets.ts`** with a mocked Supabase client — balance math including partial payments,
dropping zero-balance charges, co-owner duplication into two packets, no-email owners
landing in `skipped`, sort order, and the past-due boundary.

**Shared-pipeline regression** — `precomputed` returns recipients verbatim,
`extraMergeFields` actually reaches the merge bag, and an existing audience kind still
resolves unchanged.

**E2E** — `apps/hoa/e2e` contains exactly one spec (`inbox.spec.ts`), so the harness is
thin. Add a Playwright spec for open dialog → preview renders → send → toast **only if**
that harness already provides an authenticated manager session. If it does not, say so
explicitly rather than quietly skipping it.

## Out of scope

- Scheduled/automatic reminders (a cron route exists; deferred by choice)
- SMS and portal channels (the recipient shape supports both later at no extra cost)
- Online payment — the CTA links to the portal, it does not collect money
- Changes to the `/communications` composer UI
- Reconciling `resident-dashboard.ts`'s `<= today` past-due boundary with
  `audience.ts`'s `< today` (recorded above; needs its own decision)
