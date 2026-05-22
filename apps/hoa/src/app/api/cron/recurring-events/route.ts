import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { sendEventAlertEmail } from '@/lib/events-alerts'
import type { RecurringEvent } from '@/lib/events'

// Daily cron — scans every org for recurring events whose alert window
// has arrived, emails the board, and rolls annual occurrences forward.
//
// Schedule (vercel.json): "0 14 * * *" — 14:00 UTC ≈ 9 AM US/Eastern,
// safely after midnight in any timezone so date math is unambiguous.
//
// Idempotency: an event whose last_alert_sent_for matches event_date is
// skipped. After a successful send, sendEventAlertEmail() stamps both
// last_alert_sent_at and last_alert_sent_for so re-runs are no-ops.
//
// Auth gate:
//   • Production: Vercel injects `Authorization: Bearer ${CRON_SECRET}`
//     when CRON_SECRET is set. We check that header.
//   • Manual run: pass `?key=<CRON_SECRET>` for ad-hoc testing.
//   • TODO: until CRON_SECRET is configured in env, the endpoint is
//     reachable without a secret (dev convenience). Set it before
//     shipping to production so this isn't an open trigger.

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // walking events + sending emails

interface CronSummary {
  processed: number
  alertsSent: number
  errors: Array<{ eventId: string; reason: string }>
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authHeader = request.headers.get('authorization') ?? ''
    const url = new URL(request.url)
    const keyParam = url.searchParams.get('key')
    const hasBearer = authHeader === `Bearer ${secret}`
    const hasQueryKey = keyParam === secret
    if (!hasBearer && !hasQueryKey) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }
  // else: TODO — CRON_SECRET not configured; allowing through for dev.

  const admin = createAdminClient()
  const summary: CronSummary = { processed: 0, alertsSent: 0, errors: [] }

  // Today as YYYY-MM-DD in UTC (matches sendEventAlertEmail's day math).
  const now = new Date()
  const todayIso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`

  // Pull active events whose event_date isn't more than 90 days out (the
  // schema's max alert_days_before). We narrow further in JS so we can
  // reason about per-row alert_days_before without a complex SQL expr.
  // Service-role bypass means we see every org's rows.
  const ninetyDaysFromNowIso = isoPlusDays(todayIso, 90)
  const { data: rows, error } = await admin
    .from('hoa_recurring_events' as never)
    .select(
      'id, organization_id, association_id, title, description, event_date, recurrence, alert_days_before, last_alert_sent_at, last_alert_sent_for, is_active, created_at',
    )
    .eq('is_active', true)
    .lte('event_date', ninetyDaysFromNowIso)
    .limit(1000)

  if (error) {
    return NextResponse.json(
      { error: `events query failed: ${error.message}` },
      { status: 500 },
    )
  }

  type Row = RecurringEvent & {
    organization_id: string
  }
  const events = (rows ?? []) as unknown as Row[]

  for (const event of events) {
    summary.processed += 1

    // Skip if we've already alerted for this exact occurrence.
    if (event.last_alert_sent_for === event.event_date) continue

    // Trigger when (event_date - alert_days_before) ≤ today.
    const triggerOn = isoPlusDays(event.event_date, -event.alert_days_before)
    if (triggerOn > todayIso) continue

    try {
      const result = await sendEventAlertEmail({
        event,
        organizationId: event.organization_id,
      })
      if (result.sent > 0) {
        summary.alertsSent += result.sent
      }
      for (const f of result.failed) {
        summary.errors.push({
          eventId: event.id,
          reason: `${f.email}: ${f.reason}`,
        })
      }

      // Annual roll-forward: if the event_date has passed (≤ today)
      // AND it's annual, bump it to the same MM-DD next year so the
      // row keeps firing next cycle. Done after the send so we don't
      // skip an alert if rollForward fails.
      if (event.recurrence === 'annual' && event.event_date <= todayIso) {
        const nextDate = bumpYear(event.event_date, 1)
        const { error: rollErr } = await admin
          .from('hoa_recurring_events' as never)
          .update({
            event_date: nextDate,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', event.id)
        if (rollErr) {
          summary.errors.push({
            eventId: event.id,
            reason: `roll-forward failed: ${rollErr.message}`,
          })
        }
      }
    } catch (err) {
      summary.errors.push({
        eventId: event.id,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json(summary)
}

// Date helpers — strings only, UTC-anchored to dodge timezone drift.

function isoPlusDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Add N years to a YYYY-MM-DD. Handles Feb 29 by falling back to Feb 28
// in non-leap years (Date.UTC normalizes naturally).
function bumpYear(yyyyMmDd: string, years: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const next = new Date(Date.UTC(y + years, m - 1, d))
  // Date.UTC will wrap Feb 29 → Mar 1 in non-leap years; if that
  // happened, step back to Feb 28 to match the user's intent.
  if (next.getUTCMonth() !== m - 1) {
    next.setUTCDate(0) // last day of previous month
  }
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}
