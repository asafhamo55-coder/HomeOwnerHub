import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { sendEventAlertEmail } from '@/lib/events-alerts'
import { readAllResult } from '@/lib/supabase/read-all'
import type { RecurringEvent } from '@/lib/events'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireBearerSecret } from '@/lib/api/secrets'
import { logRouteFailure } from '@/lib/api/log'

// Daily cron — scans every org for recurring events whose alert window
// has arrived, alerts the configured audience, and rolls annual
// occurrences forward.
//
// Schedule (vercel.json): "0 14 * * *" — 14:00 UTC ≈ 9 AM US/Eastern,
// safely after midnight in any timezone so date math is unambiguous.
//
// Auth (RC-7): Vercel injects `Authorization: Bearer ${CRON_SECRET}`.
// Bearer only, timing-safe, fail closed (503 when unset). The old `?key=`
// manual-run variant is gone: a query-string secret lands in access logs.
// Run it by hand with `curl -H "Authorization: Bearer $CRON_SECRET" …`.
//
// Per event (X-01):
//   A. If this occurrence is not alerted yet and its window is open
//      (event_date - alert_days_before <= today — a passed date included,
//      so a missed run still sends a late alert, for one-time AND annual
//      events alike), run the claim → send → stamp/release cycle below.
//   B. If the event is annual and its date has passed, roll it forward to
//      its next occurrence on or after today. This runs only when the
//      occurrence was actually alerted: on an earlier day (the X-01 bug: it
//      used to be skipped forever), or by step A just now with at least one
//      message delivered (sendEventAlertEmail's `sent > 0`). It does NOT run
//      when step A delivered nothing — lost the claim, the claim write
//      failed, the send threw, every send came back !ok, or there was no
//      recipient: the date stays, so the next run retries the late alert
//      instead of the occurrence rolling a year forward with no alert at
//      all. Compare-and-swap on the old event_date, so two overlapping runs
//      roll it once. A rolled occurrence is evaluated by the next daily run.
//
// The claim is a LEASE, not a sent-marker, so a run that dies mid-sweep
// (the maxDuration kill, a crash, a deploy) strands nothing:
//   1. Claim: compare-and-swap last_alert_sent_at to "now" on the exact
//      (event_date, last_alert_sent_for, last_alert_sent_at) we read.
//      last_alert_sent_for is NOT touched, so the event page
//      (events/event-dates.ts alertState) never shows "sent" for an
//      occurrence nothing went out for. A run that sees a last_alert_sent_at
//      younger than CLAIM_LEASE_MS on an un-alerted occurrence treats it as
//      another run's in-flight claim and skips; the CAS stops a run that read
//      before that claim landed. Overlapping runs never double-send.
//   2. Send.
//   3a. Something went out: stamp last_alert_sent_for = event_date. If the
//       run dies between send and stamp, the lease expires and the next run
//       re-sends: at-least-once, the same guarantee as before the claim.
//   3b. Nothing went out, or the send threw: release (restore the
//       last_alert_sent_at we read) so the next run retries. If the release
//       write fails — or the run dies before it — the lease still expires on
//       its own, so the next daily run retries anyway. What is left behind
//       in that case: last_alert_sent_at holds the claim time until then,
//       and the detail page's "Last reminder sent" shows that date next to
//       the PREVIOUS occurrence's date for at most one day.
//
// Persistence failures (read, claim, stamp, release, roll-forward) make the
// run answer 500 after the sweep finishes, so the failure is visible (RC-6).
// Delivery failures are not persistence failures: they are counted per
// event in the 200 summary as ids and codes — never recipient emails,
// phone numbers or provider text (RC-2, X-01). An occurrence that delivered
// nothing without a reported failure (no recipient) is `nothing_delivered`.

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // walking events + sending emails

/** A claim younger than this is another run's in-flight send. Well over maxDuration, well under a day. */
const CLAIM_LEASE_MS = 15 * 60 * 1000

type EventRow = RecurringEvent & { organization_id: string }

interface SummaryError {
  eventId: string
  code: 'delivery_failed' | 'nothing_delivered' | 'send_failed' | 'write_failed'
  count?: number
}

type DbError = { code?: string; message?: string } | null

const TABLE = 'hoa_recurring_events' as never

export const GET = withRoute('cron.recurring-events', async (request) => {
  requireBearerSecret(request, 'CRON_SECRET')

  const admin = createAdminClient()
  const now = new Date()
  const todayIso = toIsoDate(now)

  // Pull active events whose event_date isn't more than 90 days out (the
  // schema's max alert_days_before). We narrow further in JS so we can
  // reason about per-row alert_days_before without a complex SQL expr.
  // Service-role bypass means we see every org's rows.
  const ninetyDaysFromNowIso = isoPlusDays(todayIso, 90)
  // Paged to the end (BL-053): a single read stops at PostgREST's 1000-row
  // cap, and events past it were never alerted. Every page is read before
  // any send, so a failed page sends nothing.
  const { data: rows, error } = await readAllResult<unknown>((from, to) =>
    admin
      .from('hoa_recurring_events' as never)
      .select(
        'id, organization_id, association_id, title, description, event_date, recurrence, alert_days_before, notify_channels, notify_audience, last_alert_sent_at, last_alert_sent_for, is_active, created_at',
      )
      .eq('is_active', true)
      .lte('event_date', ninetyDaysFromNowIso)
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
  )

  if (error) {
    // Code only: the Postgres message names the table (RC-2).
    logRouteFailure('cron.recurring-events.read', error)
    throw new ApiRouteError('internal')
  }

  const events = (rows ?? []) as unknown as EventRow[]

  let processed = 0
  let alertsSent = 0
  let writeFailures = 0
  const errors: SummaryError[] = []
  const writeFailed = (eventId: string, where: string, err: unknown) => {
    writeFailures += 1
    logRouteFailure(`cron.recurring-events.${where}`, err, { eventId })
    errors.push({ eventId, code: 'write_failed' })
  }

  // Compare-and-swap filters: match the row only while these columns still
  // hold the values we read.
  type Update = {
    eq: (col: string, v: unknown) => Update
    is: (col: string, v: null) => Update
    select: (cols: string) => PromiseLike<{ data: unknown[] | null; error: DbError }>
  }
  const casOn = (q: Update, col: string, value: string | null): Update =>
    value === null ? q.is(col, null) : q.eq(col, value)
  const update = (patch: Record<string, unknown>) =>
    (admin.from(TABLE).update(patch as never) as unknown as Update)

  for (const event of events) {
    processed += 1
    const pastDate = event.event_date < todayIso
    const alerted = event.last_alert_sent_for === event.event_date
    const windowOpen = isoPlusDays(event.event_date, -event.alert_days_before) <= todayIso

    // ── A. Alert this occurrence ──────────────────────────────────────
    if (!alerted && windowOpen) {
      const prevAt = event.last_alert_sent_at
      // Another run's live lease: leave the event (and its roll) to it.
      if (prevAt && now.getTime() - Date.parse(prevAt) < CLAIM_LEASE_MS) continue

      const claimAt = now.toISOString()
      let claimQ = update({ last_alert_sent_at: claimAt }).eq('id', event.id).eq('event_date', event.event_date)
      claimQ = casOn(claimQ, 'last_alert_sent_for', event.last_alert_sent_for)
      claimQ = casOn(claimQ, 'last_alert_sent_at', prevAt)
      const { data: claimed, error: claimErr } = await claimQ.select('id')
      if (claimErr) {
        writeFailed(event.id, 'claim', claimErr)
        continue
      }
      if (!claimed || claimed.length === 0) continue // another run has it

      let delivered = 0
      try {
        const result = await sendEventAlertEmail({ event, organizationId: event.organization_id })
        delivered = result.sent
        alertsSent += result.sent
        if (result.failed.length > 0) {
          errors.push({ eventId: event.id, code: 'delivery_failed', count: result.failed.length })
        } else if (result.sent === 0) {
          // No recipient, or none reachable on the chosen channels.
          errors.push({ eventId: event.id, code: 'nothing_delivered' })
        }
      } catch (err) {
        logRouteFailure('cron.recurring-events.send', err, { eventId: event.id })
        errors.push({ eventId: event.id, code: 'send_failed', count: 1 })
      }

      if (delivered > 0) {
        // Something went out: mark the occurrence alerted.
        const { error: stampErr } = await update({
          last_alert_sent_for: event.event_date,
          last_alert_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
          .eq('id', event.id)
          .eq('event_date', event.event_date)
          .select('id')
        // Left behind on failure: the occurrence reads as un-alerted, so once
        // the lease expires the next run re-sends it (at-least-once).
        if (stampErr) writeFailed(event.id, 'stamp', stampErr)
      } else {
        // Nothing went out: give the lease back so the next run retries.
        const { error: releaseErr } = await update({ last_alert_sent_at: prevAt })
          .eq('id', event.id)
          .eq('last_alert_sent_at', claimAt)
          .select('id')
        // Left behind on failure: last_alert_sent_at = claimAt until the lease
        // expires; the next daily run reclaims and retries regardless.
        if (releaseErr) writeFailed(event.id, 'release', releaseErr)
      }

      // Nothing was delivered (the send threw, every send came back !ok, or
      // there was no one to send to): the occurrence is NOT alerted, so it
      // must not roll forward — keep the date so the next run retries the
      // late alert first.
      if (delivered === 0) continue
    }

    // ── B. Annual roll-forward ────────────────────────────────────────
    // Reaching here with a passed date means the occurrence was alerted on
    // an earlier run, or step A just delivered it (a passed date always has
    // an open window, so an un-alerted one always goes through step A).
    if (event.recurrence === 'annual' && pastDate) {
      const nextDate = nextOccurrenceOnOrAfter(event.event_date, todayIso)
      const { error: rollErr } = await update({
        event_date: nextDate,
        updated_at: new Date().toISOString(),
      })
        .eq('id', event.id)
        .eq('event_date', event.event_date)
        .select('id')
      // Zero rows matched: another run already moved it. Nothing to do.
      if (rollErr) writeFailed(event.id, 'roll-forward', rollErr)
    }
  }

  if (writeFailures > 0) {
    // Counts only; each failure was logged above with its event id and code.
    console.error('[api:cron.recurring-events] sweep finished with write failures', {
      processed,
      alertsSent,
      writeFailures,
    })
    throw new ApiRouteError('internal')
  }

  return NextResponse.json({ processed, alertsSent, errors })
})

// Date helpers — strings only, UTC-anchored to dodge timezone drift.

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function isoPlusDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
}

// The first yearly anniversary of `yyyyMmDd` that falls on or after `todayIso`.
function nextOccurrenceOnOrAfter(yyyyMmDd: string, todayIso: string): string {
  let years = 1
  let next = bumpYear(yyyyMmDd, years)
  while (next < todayIso) next = bumpYear(yyyyMmDd, ++years)
  return next
}

// Add N years to a YYYY-MM-DD. Handles Feb 29 by falling back to Feb 28
// in non-leap years (Date.UTC normalizes naturally).
function bumpYear(yyyyMmDd: string, years: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number) as [number, number, number]
  const next = new Date(Date.UTC(y + years, m - 1, d))
  // Date.UTC will wrap Feb 29 → Mar 1 in non-leap years; if that
  // happened, step back to Feb 28 to match the user's intent.
  if (next.getUTCMonth() !== m - 1) {
    next.setUTCDate(0) // last day of previous month
  }
  return toIsoDate(next)
}
