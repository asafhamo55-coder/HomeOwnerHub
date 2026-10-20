/**
 * Month-end board report (BL-073) — the runner.
 *
 * Per org (its primary association, the same one every board screen uses):
 *
 *   1. month    the calendar month before the association's today
 *               (period.ts), or the month a board admin asked for — only a
 *               month that has finished in the association's zone
 *   2. check    a communications row with the deterministic id
 *               (org, month) already exists → already sent, stop
 *   3. who      board/admin members (daily-digest's loadBoardRecipients —
 *               the same rule as the mailbox alert), minus anyone who
 *               turned "Monthly board report" off (prefs.ts)
 *   4. build    the report, injected from apps/hoa so it is made by the
 *               board packet's own loaders (one implementation)
 *   5. claim    INSERT the communications row with that id. A primary-key
 *               conflict means another attempt owns it: nothing is sent.
 *               Atomic in Postgres — the idempotency guarantee.
 *   6. send     each recipient through the injected, guarded sendEmail
 *               (BL-004) with the org's sandbox flag; record the outcome
 *
 * Everything that can fail transiently (reads, building) happens BEFORE the
 * claim, so a retry can still send. After the claim it is at-most-once,
 * like dues reminders: a crash mid-send is not re-sent on retry.
 *
 * Logs carry org/association/communication ids, months and counts only —
 * never an address, a name or the subject.
 */

import { OUTBOUND_BLOCKED_ERROR, fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { finalSendStatus } from '@homeowner-portal/observability/send-status'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone } from '../association-time'
import { loadBoardRecipients, type BoardRecipient } from '../daily-digest'
import { deterministicUuid } from '../deterministic-id'
import { isCompleteMonth, previousMonthIn, reportMonthOf, type ReportMonth } from './period'
import { wantsMonthlyBoardReport } from './prefs'

/** communications.related_resource.type for these rows (the card reads it back). */
export const MONTHLY_REPORT_RESOURCE_TYPE = 'monthly_board_report'
/** The manual "Send now" event. */
export const MONTHLY_REPORT_EVENT = 'board/monthly-report.requested'

export function monthlyReportCommunicationId(orgId: string, month: string): string {
  return deterministicUuid(`homeownerhub:monthly-board-report:v1:${orgId}:${month}`)
}

// ─── deps ───────────────────────────────────────────────────────────

export interface MonthlyReportContent {
  subject: string
  html: string
  text: string
}

export interface BuildMonthlyReportInput {
  orgId: string
  orgName: string
  associationId: string
  associationName: string
  timeZone: string
  month: ReportMonth
}

export interface MonthlyReportDeps {
  /** A guarded sender — in production, apps/hoa's `sendEmail`. */
  sendEmail: (
    input: { to: string; subject: string; html: string; text: string },
    opts: { orgSandbox?: boolean; ref?: string },
  ) => Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>
  /** Builds the email from the board packet's loaders (apps/hoa/src/lib/monthly-report). */
  buildReport: (input: BuildMonthlyReportInput) => Promise<MonthlyReportContent>
  /** False when the transport would no-op and report success — the month
   *  must not be claimed (and read as "sent") when nothing can go out. */
  emailConfigured: () => boolean
}

export interface MonthlyReportLogger {
  info: (msg: string, ...rest: unknown[]) => void
  warn: (msg: string, ...rest: unknown[]) => void
  error: (msg: string, ...rest: unknown[]) => void
}

// ─── store ──────────────────────────────────────────────────────────

export interface MonthlyReportOrg {
  id: string
  name: string
}

export interface MonthlyReportAssociation {
  id: string
  name: string
  timeZone: string
}

export interface ClaimInput {
  id: string
  organizationId: string
  associationId: string
  subject: string
  html: string
  text: string
  audienceSummary: string
  source: 'cron' | 'manual'
  relatedResource: Record<string, unknown>
}

export type RecipientOutcome =
  | { status: 'sent'; externalId: string | null; error?: undefined }
  | { status: 'suppressed' | 'failed'; error: string }

/** Every read and write. Reads THROW on error — a failed read must stop the
 *  org (and be retried), never read as "nobody to send to". */
export interface MonthlyReportStore {
  loadOrgs(): Promise<MonthlyReportOrg[]>
  loadOrg(orgId: string): Promise<MonthlyReportOrg | null>
  primaryAssociation(orgId: string): Promise<MonthlyReportAssociation | null>
  boardRecipients(orgId: string): Promise<BoardRecipient[]>
  /** Each user's auth user_metadata (where the opt-out lives). */
  userMetadata(userIds: string[]): Promise<Map<string, unknown>>
  communicationExists(id: string): Promise<boolean>
  orgSandbox(orgId: string): Promise<boolean>
  claim(input: ClaimInput): Promise<{ ok: true } | { ok: false; reason: 'exists' }>
  insertRecipients(communicationId: string, orgId: string, recipients: BoardRecipient[]): Promise<{ id: string; email: string }[]>
  markRecipient(id: string, outcome: RecipientOutcome): Promise<void>
  /** `cancelled` = the outbound guard held back every recipient (finalSendStatus). */
  finish(communicationId: string, status: 'sent' | 'failed' | 'cancelled'): Promise<void>
}

// ─── one org ────────────────────────────────────────────────────────

export type SkipReason =
  | 'org_not_found'
  | 'no_association'
  | 'invalid_month'
  | 'month_not_complete'
  | 'already_sent'
  | 'no_recipients'
  | 'all_opted_out'
  | 'email_not_configured'

export type OrgRunResult =
  | { status: 'sent'; month: string; sent: number; suppressed: number; failed: number; optedOut: number }
  | { status: 'skipped'; month: string | null; reason: SkipReason }

const skip = (month: string | null, reason: SkipReason): OrgRunResult => ({ status: 'skipped', month, reason })

export async function runMonthlyReportForOrg(
  store: MonthlyReportStore,
  deps: MonthlyReportDeps,
  ctx: { org: MonthlyReportOrg; month: string | null; now: Date; source: 'cron' | 'manual' },
  logger: MonthlyReportLogger,
): Promise<OrgRunResult> {
  const tag = `[monthly-board-report] ${ctx.org.id}`
  if (!deps.emailConfigured()) {
    logger.warn(`${tag}: email is not configured; nothing claimed`)
    return skip(ctx.month, 'email_not_configured')
  }
  const association = await store.primaryAssociation(ctx.org.id)
  if (!association) {
    logger.info(`${tag}: no association, skipped`)
    return skip(null, 'no_association')
  }

  let month: ReportMonth
  if (ctx.month === null) {
    month = previousMonthIn(association.timeZone, ctx.now)
  } else {
    const parsed = reportMonthOf(ctx.month)
    if (!parsed) return skip(null, 'invalid_month')
    month = parsed
  }
  if (!isCompleteMonth(month, association.timeZone, ctx.now)) return skip(month.month, 'month_not_complete')

  const communicationId = monthlyReportCommunicationId(ctx.org.id, month.month)
  if (await store.communicationExists(communicationId)) {
    logger.info(`${tag}: ${month.month} already sent (${communicationId})`)
    return skip(month.month, 'already_sent')
  }

  const everyone = await store.boardRecipients(ctx.org.id)
  if (everyone.length === 0) {
    logger.warn(`${tag}: no board member with an email for ${month.month}`)
    return skip(month.month, 'no_recipients')
  }
  const metadata = await store.userMetadata(everyone.map((r) => r.userId))
  const recipients = everyone.filter((r) => wantsMonthlyBoardReport(metadata.get(r.userId)))
  const optedOut = everyone.length - recipients.length
  if (recipients.length === 0) {
    logger.info(`${tag}: all ${optedOut} board member(s) turned the report off`)
    return skip(month.month, 'all_opted_out')
  }

  const content = await deps.buildReport({
    orgId: ctx.org.id,
    orgName: ctx.org.name,
    associationId: association.id,
    associationName: association.name,
    timeZone: association.timeZone,
    month,
  })
  const orgSandbox = await store.orgSandbox(ctx.org.id)

  const claim = await store.claim({
    id: communicationId,
    organizationId: ctx.org.id,
    associationId: association.id,
    subject: content.subject,
    html: content.html,
    text: content.text,
    audienceSummary: `Month-end board report, ${month.label}: ${recipients.length} board member${recipients.length === 1 ? '' : 's'}`,
    source: ctx.source,
    relatedResource: { type: MONTHLY_REPORT_RESOURCE_TYPE, month: month.month, auto: ctx.source === 'cron' },
  })
  if (!claim.ok) {
    logger.info(`${tag}: ${month.month} claimed by another attempt (${communicationId})`)
    return skip(month.month, 'already_sent')
  }

  let sent = 0
  let suppressed = 0
  let failed = 0
  try {
    const rows = await store.insertRecipients(communicationId, ctx.org.id, recipients)
    for (const row of rows) {
      let outcome: RecipientOutcome
      try {
        const res = await deps.sendEmail(
          { to: row.email, subject: content.subject, html: content.html, text: content.text },
          { orgSandbox, ref: communicationId },
        )
        if (res.ok) outcome = { status: 'sent', externalId: res.messageId }
        else if (res.error === OUTBOUND_BLOCKED_ERROR) outcome = { status: 'suppressed', error: res.error }
        else outcome = { status: 'failed', error: res.error.slice(0, 500) }
      } catch (err) {
        outcome = { status: 'failed', error: err instanceof Error ? err.name : 'send threw' }
      }
      if (outcome.status === 'sent') sent += 1
      else if (outcome.status === 'suppressed') suppressed += 1
      else failed += 1
      await store.markRecipient(row.id, outcome)
    }
  } finally {
    // `suppressed` here is only ever the guard's hold. All held → `cancelled`
    // ("Held by safety guard (N)"), not `failed` (BL-109).
    await store.finish(communicationId, finalSendStatus({ sent, failed, held: suppressed }))
  }
  logger.info(
    `${tag}: ${month.month} report ${communicationId}: ${sent} sent, ${suppressed} suppressed, ${failed} failed, ${optedOut} opted out`,
  )
  return { status: 'sent', month: month.month, sent, suppressed, failed, optedOut }
}

// ─── entry points ───────────────────────────────────────────────────

/** Runs `fn` as a named, memoised unit (an Inngest step in production). */
export type StepRunner = (name: string, fn: () => Promise<OrgRunResult>) => Promise<OrgRunResult>

export interface CronRunResult {
  orgs: number
  sent: number
  skipped: number
  errored: number
}

/** The 1st-of-the-month cron: every paying HOA org, each in its own step. */
export async function runMonthlyBoardReport(
  store: MonthlyReportStore,
  deps: MonthlyReportDeps,
  now: Date,
  logger: MonthlyReportLogger,
  runStep: StepRunner,
): Promise<CronRunResult> {
  const orgs = await store.loadOrgs()
  const out: CronRunResult = { orgs: orgs.length, sent: 0, skipped: 0, errored: 0 }
  for (const org of orgs) {
    try {
      const res = await runStep(`monthly-board-report-${org.id}`, () =>
        runMonthlyReportForOrg(store, deps, { org, month: null, now, source: 'cron' }, logger),
      )
      if (res.status === 'sent') out.sent += 1
      else out.skipped += 1
    } catch (err) {
      // That org's step has used its retries; the others still get theirs.
      out.errored += 1
      logger.error(`[monthly-board-report] ${org.id}: failed`, { name: err instanceof Error ? err.name : 'unknown' })
    }
  }
  return out
}

/** "Send now" (MONTHLY_REPORT_EVENT): one org, the given month or the last one. */
export async function runRequestedMonthlyReport(
  store: MonthlyReportStore,
  deps: MonthlyReportDeps,
  request: { orgId: string; month: string | null },
  now: Date,
  logger: MonthlyReportLogger,
  runStep: StepRunner,
): Promise<OrgRunResult> {
  const org = await store.loadOrg(request.orgId)
  if (!org) return skip(null, 'org_not_found')
  return runStep(`monthly-board-report-${org.id}`, () =>
    runMonthlyReportForOrg(store, deps, { org, month: request.month, now, source: 'manual' }, logger),
  )
}

// ─── Supabase store ─────────────────────────────────────────────────

type QueryError = { code?: string; message?: string } | null
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MonthlyReportDb {
  from: (table: string) => any
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{ data: { user: { user_metadata?: unknown } | null }; error: QueryError }>
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function fail(what: string, error: QueryError): Error {
  return new Error(`monthly-board-report: ${what} failed (${error?.code ?? 'unknown'})`)
}

export function supabaseMonthlyReportStore(db: MonthlyReportDb): MonthlyReportStore {
  return {
    async loadOrgs() {
      // Same set as the morning check (daily-digest): HOA orgs on a paid plan.
      const { data, error } = await db.from('orgs').select('id, name').eq('hub_type', 'hoa').neq('plan', 'free')
      if (error) throw fail('orgs read', error)
      return ((data ?? []) as { id: string; name: string | null }[]).map((o) => ({ id: o.id, name: o.name ?? 'your community' }))
    },

    async loadOrg(orgId) {
      const { data, error } = await db.from('orgs').select('id, name').eq('id', orgId).eq('hub_type', 'hoa').maybeSingle()
      if (error) throw fail('org read', error)
      const o = data as { id: string; name: string | null } | null
      return o ? { id: o.id, name: o.name ?? 'your community' } : null
    },

    async primaryAssociation(orgId) {
      // The primary association rule of apps/hoa readPrimaryAssociation:
      // first by name.
      const { data, error } = await db
        .from('associations')
        .select(`id, name, ${ASSOCIATION_ZONE_COLUMNS}`)
        .eq('organization_id', orgId)
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw fail('association read', error)
      const a = data as { id: string; name: string; state: string | null } | null
      return a ? { id: a.id, name: a.name, timeZone: associationTimeZone(a) } : null
    },

    boardRecipients(orgId) {
      return loadBoardRecipients(db, orgId)
    },

    async userMetadata(userIds) {
      const out = new Map<string, unknown>()
      for (const id of userIds) {
        const { data, error } = await db.auth.admin.getUserById(id)
        if (error) throw fail('user preferences read', error)
        out.set(id, data.user?.user_metadata)
      }
      return out
    },

    async communicationExists(id) {
      const { data, error } = await db.from('communications').select('id').eq('id', id).maybeSingle()
      if (error) throw fail('communications read', error)
      return Boolean(data)
    },

    orgSandbox(orgId) {
      return fetchOrgSandbox(db, orgId)
    },

    async claim(c) {
      const { error } = await db.from('communications').insert({
        id: c.id,
        organization_id: c.organizationId,
        association_id: c.associationId,
        category: 'financial',
        subject: c.subject,
        body_html: c.html,
        body_text: c.text,
        channels: ['email'],
        audience_definition: { kind: 'board_members', summary: c.audienceSummary },
        audience_summary: c.audienceSummary,
        status: 'sending',
        source: c.source,
        related_resource: c.relatedResource,
      })
      if (!error) return { ok: true }
      // 23505 unique_violation on the primary key: already claimed.
      if (error.code === '23505') return { ok: false, reason: 'exists' }
      throw fail('claim', error)
    },

    async insertRecipients(communicationId, orgId, recipients) {
      const { data, error } = await db
        .from('communication_recipients')
        .insert(
          recipients.map((r) => ({
            organization_id: orgId,
            communication_id: communicationId,
            user_id: r.userId,
            email: r.email,
            channel: 'email',
            delivery_status: 'queued',
          })),
        )
        .select('id, email')
      if (error || !data) throw fail('recipient insert', error)
      return data as { id: string; email: string }[]
    },

    async markRecipient(id, outcome) {
      const at = new Date().toISOString()
      const patch =
        outcome.status === 'sent'
          ? { delivery_status: 'sent', external_id: outcome.externalId, sent_at: at }
          : { delivery_status: outcome.status, error_message: outcome.error, failed_at: at }
      const { error } = await db.from('communication_recipients').update(patch).eq('id', id)
      if (error) throw fail('recipient update', error)
    },

    async finish(communicationId, status) {
      const { error } = await db
        .from('communications')
        .update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null })
        .eq('id', communicationId)
      if (error) throw fail('status update', error)
    },
  }
}
