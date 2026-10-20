import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

/**
 * BL-108 (docs/decisions/2026-10-20-ai-spend-ceiling.md §2, "Platform"):
 * once a day, estimate YESTERDAY's (UTC) AI spend across the whole platform
 * and email the platform admin when it passes the threshold ($50/day).
 *
 * Spend = count of audit_log `ai.usage.<bucket>` rows in the day, per
 * bucket (one count-only query each, so no 1000-row cap), × the worst-case
 * per-call estimate. The estimates and the threshold live in apps/hoa
 * (lib/api/ai-limits.ts) and are injected, like the sender: this package
 * cannot import the app.
 *
 * Recipient: AI_SPEND_ALERT_TO (comma-separated), a platform-admin env in
 * the style of RELEASE_NOTES_TO. Never a resident, never a board: no org
 * address is read. Unset = log and send nothing. The sender is apps/hoa's
 * guarded sendEmail (BL-004 outbound guard).
 *
 * The email says how to stop all AI: set AI_PLATFORM_KILL_SWITCH=1 in
 * Vercel production. The job never flips it itself.
 *
 * Logs: counts, the dollar estimate and codes only.
 */

export const AI_SPEND_ALERT_TO_ENV = 'AI_SPEND_ALERT_TO'

export interface AiSpendAlertEmail {
  to: string
  subject: string
  html: string
  text: string
}

export interface AiSpendAlertDeps {
  /** A guarded sender — in production, apps/hoa's `sendEmail`. */
  sendEmail: (email: AiSpendAlertEmail) => Promise<{ ok: true } | { ok: false; error: string }>
  /** USD per call, keyed by bucket (`ai.usage.<bucket>`). */
  costPerCallUsd: Readonly<Record<string, number>>
  /** Alert when the day's estimate is at or above this (USD). */
  thresholdUsd: number
}

export interface AiSpendAlertResult {
  day: string
  spendUsd: number
  calls: number
  alerted: boolean
  reason?: 'under_threshold' | 'no_recipient' | 'read_failed'
}

type CountQuery = {
  select: (cols: string, opts: { count: 'exact'; head: true }) => CountQuery
  eq: (col: string, v: string) => CountQuery
  gte: (col: string, v: string) => CountQuery
  lt: (col: string, v: string) => PromiseLike<{ count: number | null; error: { code?: string } | null }>
}
type CountDb = { from: (table: 'audit_log') => CountQuery }

/** [start, end) of the UTC day before `now`, as ISO strings, plus its YYYY-MM-DD. */
export function previousUtcDay(now: number): { start: string; end: string; day: string } {
  const d = new Date(now)
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString(), day: start.toISOString().slice(0, 10) }
}

export function parseRecipients(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

export async function runAiSpendAlert(
  db: CountDb,
  deps: AiSpendAlertDeps,
  opts: { now?: number; env?: Readonly<Record<string, string | undefined>> } = {},
): Promise<AiSpendAlertResult> {
  const now = opts.now ?? Date.now()
  const env = opts.env ?? process.env
  const { start, end, day } = previousUtcDay(now)

  let spendUsd = 0
  let calls = 0
  const perBucket: Array<{ bucket: string; count: number; usd: number }> = []
  try {
    const results = await Promise.all(
      Object.entries(deps.costPerCallUsd).map(async ([bucket, cost]) => {
        const { count, error } = await db
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('action', `ai.usage.${bucket}`)
          .gte('created_at', start)
          .lt('created_at', end)
        if (error) throw Object.assign(new Error('read_failed'), { code: error.code })
        return { bucket, count: count ?? 0, usd: (count ?? 0) * cost }
      }),
    )
    for (const r of results) {
      perBucket.push(r)
      spendUsd += r.usd
      calls += r.count
    }
  } catch (err) {
    console.error('[ai-spend-alert] read failed', { day, code: (err as { code?: string }).code ?? null })
    // Throw so Inngest retries and the failure-reporting middleware sees it.
    throw err
  }

  if (spendUsd < deps.thresholdUsd) {
    console.info('[ai-spend-alert] under threshold', { day, calls, spendUsd: Number(spendUsd.toFixed(2)) })
    return { day, spendUsd, calls, alerted: false, reason: 'under_threshold' }
  }

  const recipients = parseRecipients(env[AI_SPEND_ALERT_TO_ENV])
  if (recipients.length === 0) {
    console.error('[ai-spend-alert] over threshold but AI_SPEND_ALERT_TO is unset', { day, calls })
    return { day, spendUsd, calls, alerted: false, reason: 'no_recipient' }
  }

  const lines = perBucket
    .filter((r) => r.count > 0)
    .sort((a, b) => b.usd - a.usd)
    .map((r) => `${r.bucket}: ${r.count} calls, ~$${r.usd.toFixed(2)}`)
  const subject = `AI spend alert: ~$${spendUsd.toFixed(2)} on ${day} (threshold $${deps.thresholdUsd})`
  const text = [
    `Estimated platform AI spend on ${day} (UTC): ~$${spendUsd.toFixed(2)} across ${calls} calls.`,
    `This is a worst-case estimate (audit_log ai.usage.* counts × per-call estimates).`,
    '',
    ...lines,
    '',
    'To stop all AI now, set AI_PLATFORM_KILL_SWITCH=1 in Vercel production and redeploy.',
  ].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#111;">${text
    .split('\n')
    .map((l) => `<p style="margin:0 0 6px 0;">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('')}</div>`

  let sent = 0
  for (const to of recipients) {
    const res = await deps.sendEmail({ to, subject, html, text })
    if (res.ok) sent += 1
  }
  if (sent === 0) console.error('[ai-spend-alert] no alert email sent', { day, count: recipients.length })
  return { day, spendUsd, calls, alerted: sent > 0 }
}

export function createAiSpendAlertJob(deps: AiSpendAlertDeps) {
  return inngest.createFunction(
    { id: 'ai-spend-alert', name: 'Daily platform AI spend alert' },
    { cron: 'TZ=UTC 30 0 * * *' },
    async () => runAiSpendAlert(createAdminClient() as unknown as CountDb, deps),
  )
}
