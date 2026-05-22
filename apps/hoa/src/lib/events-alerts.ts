import { createAdminClient } from '@homeowner-portal/db'
import { sendEmail, appUrl } from '@/lib/email'
import type { RecurringEvent } from '@/lib/events'

// Pure function that emails an event reminder to the org's admins+board
// and marks the event as alerted. Called from:
//   • /api/cron/recurring-events (daily walk)
//   • lib/events.ts → sendTestAlert (manual fire from detail page)
//
// We hit auth.users for email addresses, which RLS-bound clients can't
// reach — so this is one of the few places we use the service-role
// admin client (spec'd as acceptable for this read).

export interface SendEventAlertInput {
  event: RecurringEvent
  organizationId: string
}

export interface SendEventAlertResult {
  sent: number
  failed: Array<{ email: string; reason: string }>
}

export async function sendEventAlertEmail(
  input: SendEventAlertInput,
): Promise<SendEventAlertResult> {
  const { event, organizationId } = input
  const admin = createAdminClient()

  // 1. Collect admin + board user_ids for the org.
  const { data: memberRows } = await admin
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', organizationId)
    .in('role', ['admin', 'board'])

  const userIds = ((memberRows ?? []) as Array<{ user_id: string; role: string }>)
    .map((m) => m.user_id)
    .filter(Boolean)

  if (userIds.length === 0) {
    return { sent: 0, failed: [] }
  }

  // 2. Look up emails. Supabase doesn't let us join auth.users from a
  //    PostgREST query, so we walk listUsers and filter — fine for the
  //    sizes we deal with (HOAs have a handful of board members).
  //    profiles also has email but isn't always populated, so auth is
  //    the source of truth.
  const { data: list } = await admin.auth.admin.listUsers()
  const idToEmail = new Map<string, string>()
  for (const u of list?.users ?? []) {
    if (u.email && userIds.includes(u.id)) {
      idToEmail.set(u.id, u.email)
    }
  }

  const emails = Array.from(new Set(idToEmail.values())).filter(Boolean)
  if (emails.length === 0) {
    return { sent: 0, failed: [] }
  }

  // 3. Build subject + body.
  const daysUntil = daysUntilDate(event.event_date)
  const subject =
    daysUntil <= 0
      ? `Reminder: ${event.title} is today`
      : `Reminder: ${event.title} is in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`

  const dateLabel = formatEventDate(event.event_date)
  const link = appUrl(`/events/${event.id}`)
  const descriptionBlock = event.description
    ? `<p style="margin:12px 0;color:#444;white-space:pre-wrap;">${escapeHtml(event.description)}</p>`
    : ''
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 8px 0;font-size:20px;">${escapeHtml(event.title)}</h2>
  <p style="margin:0 0 16px 0;color:#555;">
    ${escapeHtml(dateLabel)} ·
    ${daysUntil <= 0 ? 'today' : `${daysUntil} day${daysUntil === 1 ? '' : 's'} away`}
  </p>
  ${descriptionBlock}
  <p style="margin:20px 0;">
    <a href="${link}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
      Open in HomeownerHub
    </a>
  </p>
  <p style="margin-top:24px;font-size:12px;color:#888;">
    You're receiving this because you're on the board for this HOA.
    ${event.recurrence === 'annual' ? "This reminder repeats annually." : ''}
  </p>
</div>`.trim()

  const text = [
    event.title,
    `${dateLabel} — ${daysUntil <= 0 ? 'today' : `${daysUntil} days away`}`,
    event.description ? `\n${event.description}\n` : '',
    `Open: ${link}`,
  ]
    .filter(Boolean)
    .join('\n')

  // 4. Fan out one email per address.
  const failed: Array<{ email: string; reason: string }> = []
  let sent = 0
  for (const email of emails) {
    const res = await sendEmail({ to: email, subject, html, text })
    if (res.ok) {
      sent += 1
    } else {
      failed.push({ email, reason: res.error })
    }
  }

  // 5. If at least one send succeeded, stamp the event so we don't
  //    fire again for this occurrence on the next cron run.
  if (sent > 0) {
    await admin
      .from('hoa_recurring_events' as never)
      .update({
        last_alert_sent_at: new Date().toISOString(),
        last_alert_sent_for: event.event_date,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', event.id)
  }

  return { sent, failed }
}

// ─── Helpers ────────────────────────────────────────────────────────

// Days until a date in YYYY-MM-DD form. Negative if past.
// Computed in UTC to match the cron's UTC schedule — we don't try to
// localize "today" because every board member is in a different zone
// anyway and 1-day-off on a 7-day-out reminder doesn't matter.
function daysUntilDate(yyyyMmDd: string): number {
  const target = new Date(`${yyyyMmDd}T00:00:00Z`)
  const today = new Date()
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  )
  const targetUtc = target.getTime()
  return Math.round((targetUtc - todayUtc) / (24 * 60 * 60 * 1000))
}

function formatEventDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
