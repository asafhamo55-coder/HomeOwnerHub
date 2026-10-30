import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'
import { parseRecipients } from './ai-spend-alert'

/**
 * BL-171 (round 8 #3): a weekly product-analytics digest to the platform
 * owner. COUNTS ONLY: no names, emails, addresses, subjects, bodies or org
 * names ever reach the email, and nothing per-org is listed.
 *
 * Built from tables that already exist (no migration):
 *  - new orgs (`orgs`, hub_type 'hoa') and new associations
 *  - active boards: distinct org_id across audit_log rows in the window
 *    (paged; capped, so a huge week reads as a lower bound)
 *  - approvals proposed / decided approved (`approval_requests`)
 *  - announcements sent (`communications`, category 'announcement', sent)
 *  - AI drafts (`communications.ai_generated`)
 * Each is shown against the previous 7 days.
 *
 * NOT available without a table: help-beacon events (/api/help/event only
 * writes a log line) and demo requests (emailed, not stored).
 *
 * Recipient: ANALYTICS_REPORT_TO, a platform-owner env var in the style of
 * AI_SPEND_ALERT_TO. Unset = log and send nothing. Never a resident or a
 * board. The sender is apps/hoa's guarded sendEmail (BL-004 outbound
 * guard), injected like the other jobs; a guard block counts as not sent.
 */

export const ANALYTICS_REPORT_TO_ENV = 'ANALYTICS_REPORT_TO'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const PAGE = 1000
const MAX_PAGES = 10

export interface WeeklyAnalyticsEmail {
  to: string
  subject: string
  html: string
  text: string
}

export interface WeeklyAnalyticsDeps {
  /** A guarded sender: in production, apps/hoa's `sendEmail`. */
  sendEmail: (email: WeeklyAnalyticsEmail) => Promise<{ ok: true } | { ok: false; error: string }>
}

export interface WeeklyCounts {
  newOrgs: number
  newAssociations: number
  activeBoards: number
  /** True when the audit scan hit its page cap, so activeBoards is a lower bound. */
  activeBoardsCapped: boolean
  approvalsCreated: number
  approvalsApproved: number
  announcementsSent: number
  aiDrafts: number
}

export interface WeeklyAnalyticsResult {
  weekEnd: string
  sent: boolean
  counts?: WeeklyCounts
  previous?: WeeklyCounts
  reason?: 'no_recipient' | 'send_failed'
}

type Result = { count?: number | null; data?: unknown; error: { code?: string } | null }
// A deliberately loose chain: every filter returns the builder, and awaiting it yields a result.
type Q = PromiseLike<Result> & {
  select: (cols: string, opts?: { count: 'exact'; head: true }) => Q
  eq: (col: string, v: string | boolean) => Q
  in: (col: string, v: string[]) => Q
  gte: (col: string, v: string) => Q
  lt: (col: string, v: string) => Q
  not: (col: string, op: string, v: string) => Q
  order: (col: string) => Q
  range: (from: number, to: number) => Q
}
type Db = { from: (table: string) => Q }

function fail(error: { code?: string }): never {
  throw Object.assign(new Error('read_failed'), { code: error.code })
}

async function count(q: Q): Promise<number> {
  const { count: c, error } = await q
  if (error) fail(error)
  return c ?? 0
}

const head = (db: Db, table: string) => db.from(table).select('id', { count: 'exact', head: true })

// AI meter rows (usage and spend-notice ledger) are not board activity. Mirrors
// AI_LEDGER_PREFIXES in apps/hoa/src/lib/audit/labels.ts (packages/jobs cannot
// import apps/hoa); keep the two lists in step. audit_log.action is NOT NULL,
// so NOT LIKE never drops a row through SQL null semantics.
const AI_LEDGER_PREFIXES: readonly string[] = ['ai.usage.', 'ai.spend.notice.']

async function distinctActiveOrgs(db: Db, start: string, end: string): Promise<{ n: number; capped: boolean }> {
  const seen = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from('audit_log').select('org_id').gte('created_at', start).lt('created_at', end)
    for (const prefix of AI_LEDGER_PREFIXES) q = q.not('action', 'like', `${prefix}%`)
    const { data, error } = await q
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) fail(error)
    const rows = (data ?? []) as Array<{ org_id: string | null }>
    for (const r of rows) if (r.org_id) seen.add(r.org_id)
    if (rows.length < PAGE) return { n: seen.size, capped: false }
  }
  return { n: seen.size, capped: true }
}

export async function countWindow(db: Db, start: string, end: string): Promise<WeeklyCounts> {
  const [newOrgs, newAssociations, approvalsCreated, approvalsApproved, announcementsSent, aiDrafts, active] =
    await Promise.all([
      count(head(db, 'orgs').eq('hub_type', 'hoa').gte('created_at', start).lt('created_at', end)),
      count(head(db, 'associations').gte('created_at', start).lt('created_at', end)),
      count(head(db, 'approval_requests').gte('proposed_at', start).lt('proposed_at', end)),
      count(
        head(db, 'approval_requests').in('status', ['approved', 'posted']).gte('decided_at', start).lt('decided_at', end),
      ),
      count(
        head(db, 'communications')
          .eq('category', 'announcement')
          .eq('status', 'sent')
          .gte('sent_at', start)
          .lt('sent_at', end),
      ),
      count(head(db, 'communications').eq('ai_generated', true).gte('created_at', start).lt('created_at', end)),
      distinctActiveOrgs(db, start, end),
    ])
  return {
    newOrgs,
    newAssociations,
    activeBoards: active.n,
    activeBoardsCapped: active.capped,
    approvalsCreated,
    approvalsApproved,
    announcementsSent,
    aiDrafts,
  }
}

function delta(now: number, before: number): string {
  const d = now - before
  return d === 0 ? 'same as last week' : `${d > 0 ? '+' : ''}${d} vs last week`
}

export function renderWeeklyAnalytics(weekEnd: string, c: WeeklyCounts, p: WeeklyCounts) {
  const rows: Array<[string, number, number, string?]> = [
    ['New orgs', c.newOrgs, p.newOrgs],
    ['New associations', c.newAssociations, p.newAssociations],
    ['Active boards (any activity)', c.activeBoards, p.activeBoards, c.activeBoardsCapped ? ' (at least)' : ''],
    ['Approvals created', c.approvalsCreated, p.approvalsCreated],
    ['Approvals approved', c.approvalsApproved, p.approvalsApproved],
    ['Announcements sent', c.announcementsSent, p.announcementsSent],
    ['AI drafts', c.aiDrafts, p.aiDrafts],
  ]
  const lines = rows.map(([label, n, prev, note]) => `${label}: ${n}${note ?? ''} (${delta(n, prev)})`)
  const text = [
    `HomeownerHub, the 7 days ending ${weekEnd} (UTC). Counts only.`,
    '',
    ...lines,
    '',
    'Not counted yet: help-beacon events and demo requests (neither is stored), and web traffic (Vercel Analytics, OA-35).',
  ].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#111;">${text
    .split('\n')
    .map((l) => `<p style="margin:0 0 6px 0;">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('')}</div>`
  return { subject: `HomeownerHub weekly numbers: week ending ${weekEnd}`, text, html }
}

export async function runWeeklyAnalytics(
  db: Db,
  deps: WeeklyAnalyticsDeps,
  opts: { now?: number; env?: Readonly<Record<string, string | undefined>> } = {},
): Promise<WeeklyAnalyticsResult> {
  const now = opts.now ?? Date.now()
  const env = opts.env ?? process.env
  const weekEnd = new Date(now).toISOString().slice(0, 10)

  const recipients = parseRecipients(env[ANALYTICS_REPORT_TO_ENV])
  if (recipients.length === 0) {
    console.info('[weekly-analytics] ANALYTICS_REPORT_TO is unset; nothing sent', { weekEnd })
    return { weekEnd, sent: false, reason: 'no_recipient' }
  }

  let counts: WeeklyCounts
  let previous: WeeklyCounts
  try {
    const iso = (t: number) => new Date(t).toISOString()
    counts = await countWindow(db, iso(now - WEEK_MS), iso(now))
    previous = await countWindow(db, iso(now - 2 * WEEK_MS), iso(now - WEEK_MS))
  } catch (err) {
    console.error('[weekly-analytics] read failed', { weekEnd, code: (err as { code?: string }).code ?? null })
    throw err // let Inngest retry and failure reporting see it
  }

  const { subject, text, html } = renderWeeklyAnalytics(weekEnd, counts, previous)
  let sent = 0
  for (const to of recipients) {
    const res = await deps.sendEmail({ to, subject, html, text })
    if (res.ok) sent += 1
  }
  if (sent === 0) console.error('[weekly-analytics] no email sent', { weekEnd, recipients: recipients.length })
  return { weekEnd, sent: sent > 0, counts, previous, ...(sent === 0 ? { reason: 'send_failed' as const } : {}) }
}

export function createWeeklyAnalyticsJob(deps: WeeklyAnalyticsDeps) {
  return inngest.createFunction(
    { id: 'weekly-analytics', name: 'Weekly product analytics digest (counts only)' },
    { cron: 'TZ=UTC 0 13 * * 1' },
    async () => runWeeklyAnalytics(createAdminClient() as unknown as Db, deps),
  )
}
