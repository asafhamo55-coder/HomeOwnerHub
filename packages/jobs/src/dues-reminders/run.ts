/**
 * Automated dues reminders (BL-013) — the runner.
 *
 * Per association with a verified, enabled config (config.ts):
 *
 *   1. plan    which (assessment, step) pairs fire today and who gets them
 *              (plan.ts) — skipping payment-plan and attorney-stage units
 *   2. claim   INSERT the communications row with a deterministic id
 *              (schedule.ts reminderCommunicationId). A primary-key
 *              conflict means another attempt already owns this
 *              (assessment, step): nothing is sent. This is the
 *              idempotency guarantee, and it is atomic in Postgres.
 *   3. log     one communication_recipients row per owner (0018)
 *   4. send    each through the injected, guarded sendEmail (BL-004) with
 *              the org's sandbox flag; record sent / suppressed / failed
 *
 * At-most-once by design: a claim that crashes before sending is not
 * retried on a later day — a missed reminder is better than a duplicate
 * one about somebody's debt.
 *
 * Logs carry association/communication ids and counts only — never an
 * address, a name, a unit label or a balance.
 */

import { fetchOrgSandbox, OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  effectiveDuesReminderSettings,
  readDuesReminderSettings,
  type DuesReminderSettings,
} from './config'
import {
  ATTORNEY_STAGE_STATUSES,
  candidateReminders,
  planReminders,
  type PlanAssessment,
  type PlanOwnership,
  type PlanResult,
  type PlanSkips,
  type PlannedCharge,
  type PlannedSend,
} from './plan'
import { todayInZone } from './schedule'
import { ASSOCIATION_ZONE_COLUMNS, DEFAULT_ASSOCIATION_TIME_ZONE, associationTimeZone } from '../association-time'
import { readAll } from '../read-all'

/** Same marker the manual reminder writes (apps/hoa dues-reminders/queries.ts),
 *  so "Reminded 3d ago" on /dues counts automated reminders too. */
export const DUES_REMINDER_RESOURCE_TYPE = 'dues_reminder'

// ─── deps ───────────────────────────────────────────────────────────

export interface ReminderEmail {
  to: string
  subject: string
  html: string
  text: string
  senderName?: string | null
}

export interface ReminderRenderInput {
  associationName: string
  ownerName: string
  unitId: string
  unitLabel: string
  step: number
  dueDate: string
  charges: PlannedCharge[]
  note: string | null
  portalUrl: string
}

export interface DuesRemindersDeps {
  /** A guarded sender — in production, apps/hoa's `sendEmail`. */
  sendEmail: (
    input: ReminderEmail,
    opts: { orgSandbox?: boolean; ref?: string },
  ) => Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>
  /** Renders one email. Injected so the job uses the exact template the
   *  manual reminder uses (apps/hoa/src/lib/dues-reminders/render.ts). */
  render: (input: ReminderRenderInput) => { subject: string; html: string; text: string }
  appUrl: (path: string) => string
  /** The server-only secret config.ts signatures are checked against. */
  settingsSecret: () => string | null
  /** False when the transport would no-op and report success. */
  emailConfigured: () => boolean
}

export interface ReminderLogger {
  info: (msg: string, ...rest: unknown[]) => void
  warn: (msg: string, ...rest: unknown[]) => void
  error: (msg: string, ...rest: unknown[]) => void
}

// ─── store ──────────────────────────────────────────────────────────

export interface StoredAssociation {
  id: string
  name: string
  organizationId: string
  complianceSettings: unknown
  /** The association's IANA zone (BL-043): reminders fire on ITS day.
   *  Absent → America/New_York. */
  timeZone?: string
}

export interface ClaimInput {
  id: string
  organizationId: string
  associationId: string
  subject: string
  html: string
  text: string
  audienceSummary: string
  relatedResource: Record<string, unknown>
}

export type RecipientOutcome =
  | { status: 'sent'; externalId: string | null; error?: undefined }
  | { status: 'suppressed' | 'failed'; error: string }

/** Every read and write the job makes. Supabase-backed in production
 *  (supabaseReminderStore), in-memory in tests. Reads THROW on error: a
 *  failed skip-list read must stop the run, not read as "nobody to skip". */
export interface DuesReminderStore {
  loadAssociations(): Promise<StoredAssociation[]>
  loadOpenAssessments(associationId: string): Promise<PlanAssessment[]>
  loadActivePlanUnitIds(organizationId: string, unitIds: string[]): Promise<Set<string>>
  loadAttorneyStageUnitIds(associationId: string): Promise<Set<string>>
  loadOwnerships(unitIds: string[]): Promise<PlanOwnership[]>
  loadExistingCommunicationIds(ids: string[]): Promise<Set<string>>
  orgSandbox(organizationId: string): Promise<boolean>
  claim(input: ClaimInput): Promise<{ ok: true } | { ok: false; reason: 'exists' }>
  insertRecipients(
    communicationId: string,
    organizationId: string,
    unitId: string,
    recipients: { email: string; name: string; userId: string | null }[],
  ): Promise<{ id: string; email: string; name: string }[]>
  markRecipient(id: string, outcome: RecipientOutcome): Promise<void>
  finish(communicationId: string, status: 'sent' | 'failed'): Promise<void>
}

// ─── planning (shared with the settings screen's dry run) ───────────

export async function planForAssociation(
  store: DuesReminderStore,
  ctx: { associationId: string; organizationId: string; today: string; offsets: readonly number[] },
): Promise<PlanResult & { unitsConsidered: number }> {
  const assessments = await store.loadOpenAssessments(ctx.associationId)
  const candidates = candidateReminders(assessments, ctx.today, ctx.offsets)
  const empty: PlanSkips = { paymentPlan: 0, attorney: 0, alreadySent: 0, noRecipient: 0 }
  if (candidates.length === 0) return { sends: [], skipped: empty, unitsConsidered: 0 }

  const unitIds = [...new Set(candidates.map((c) => c.assessment.unitId))]
  const [activePlanUnitIds, attorneyUnitIds, ownerships, sentIds] = await Promise.all([
    store.loadActivePlanUnitIds(ctx.organizationId, unitIds),
    store.loadAttorneyStageUnitIds(ctx.associationId),
    store.loadOwnerships(unitIds),
    store.loadExistingCommunicationIds(candidates.map((c) => c.communicationId)),
  ])
  const plan = planReminders({
    today: ctx.today,
    offsets: ctx.offsets,
    assessments,
    ownerships,
    activePlanUnitIds,
    attorneyUnitIds,
    sentIds,
  })
  return { ...plan, unitsConsidered: unitIds.length }
}

// ─── running ────────────────────────────────────────────────────────

export interface AssociationRunResult {
  planned: number
  sent: number
  suppressed: number
  failed: number
  skipped: PlanSkips
}

function stepLabel(step: number): string {
  if (step === 0) return 'on the due date'
  return step < 0 ? `${-step} day${step === -1 ? '' : 's'} before due` : `${step} day${step === 1 ? '' : 's'} after due`
}

async function deliver(
  store: DuesReminderStore,
  deps: DuesRemindersDeps,
  ctx: { organizationId: string; associationId: string; associationName: string; note: string | null },
  send: PlannedSend,
  orgSandbox: boolean,
): Promise<{ claimed: boolean; sent: number; suppressed: number; failed: number }> {
  const portalUrl = deps.appUrl('/resident/dues')
  const base = {
    associationName: ctx.associationName,
    unitId: send.unitId,
    unitLabel: send.unitLabel,
    step: send.step,
    dueDate: send.dueDate,
    charges: send.charges,
    note: ctx.note,
    portalUrl,
  }
  // The audit copy on communications is rendered for a neutral "Owner";
  // each recipient's own copy is rendered with their name below.
  const audit = deps.render({ ...base, ownerName: 'Owner' })

  const claim = await store.claim({
    id: send.communicationId,
    organizationId: ctx.organizationId,
    associationId: ctx.associationId,
    subject: audit.subject,
    html: audit.html,
    text: audit.text,
    audienceSummary: `Automatic reminder ${stepLabel(send.step)}: ${send.recipients.length} owner${send.recipients.length === 1 ? '' : 's'}`,
    relatedResource: {
      type: DUES_REMINDER_RESOURCE_TYPE,
      id: send.assessmentId,
      auto: true,
      step: send.step,
      unit_id: send.unitId,
      due_date: send.dueDate,
    },
  })
  if (!claim.ok) return { claimed: false, sent: 0, suppressed: 0, failed: 0 }

  let sent = 0
  let suppressed = 0
  let failed = 0
  try {
    const rows = await store.insertRecipients(send.communicationId, ctx.organizationId, send.unitId, send.recipients)
    for (const row of rows) {
      let outcome: RecipientOutcome
      try {
        const email = deps.render({ ...base, ownerName: row.name })
        const res = await deps.sendEmail(
          { to: row.email, ...email, senderName: ctx.associationName },
          { orgSandbox, ref: send.communicationId },
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
    await store.finish(send.communicationId, sent > 0 ? 'sent' : 'failed')
  }
  return { claimed: true, sent, suppressed, failed }
}

export async function runDuesRemindersForAssociation(
  store: DuesReminderStore,
  deps: DuesRemindersDeps,
  ctx: {
    associationId: string
    organizationId: string
    associationName: string
    settings: DuesReminderSettings
    today: string
  },
  logger: ReminderLogger,
): Promise<AssociationRunResult> {
  const tag = `[dues-reminders] ${ctx.associationId}`
  const result: AssociationRunResult = {
    planned: 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
    skipped: { paymentPlan: 0, attorney: 0, alreadySent: 0, noRecipient: 0 },
  }
  if (!ctx.settings.enabled) return result
  if (!deps.emailConfigured()) {
    // The transport would report success without sending; claiming now
    // would mark today's steps done with nothing delivered.
    logger.warn(`${tag}: email delivery is not configured; nothing claimed`)
    return result
  }

  const plan = await planForAssociation(store, {
    associationId: ctx.associationId,
    organizationId: ctx.organizationId,
    today: ctx.today,
    offsets: ctx.settings.offsets,
  })
  result.skipped = { ...plan.skipped }
  result.planned = plan.sends.length
  if (plan.sends.length === 0) {
    logger.info(`${tag}: nothing due`, { skipped: result.skipped })
    return result
  }

  const orgSandbox = await store.orgSandbox(ctx.organizationId)
  for (const send of plan.sends) {
    try {
      const r = await deliver(
        store,
        deps,
        {
          organizationId: ctx.organizationId,
          associationId: ctx.associationId,
          associationName: ctx.associationName,
          note: ctx.settings.note,
        },
        send,
        orgSandbox,
      )
      if (!r.claimed) {
        result.planned -= 1
        result.skipped.alreadySent += 1
        continue
      }
      result.sent += r.sent
      result.suppressed += r.suppressed
      result.failed += r.failed
    } catch (err) {
      // One send's failure must not stop the others. Id and error class only.
      result.failed += send.recipients.length
      logger.error(`${tag}: reminder ${send.communicationId} failed`, {
        error: err instanceof Error ? err.name : 'unknown',
      })
    }
  }

  logger.info(`${tag}: ${result.planned} reminder(s); ${result.sent} sent, ${result.suppressed} suppressed, ${result.failed} failed`, {
    skipped: result.skipped,
    orgSandbox,
  })
  return result
}

export interface DuesRemindersSummary {
  associations: number
  enabled: number
  planned: number
  sent: number
  suppressed: number
  failed: number
}

/** Runs every enabled association. `runStep` wraps each one (Inngest's
 *  step.run in production) so one association's failure retries alone. */
export async function runDuesReminders(
  store: DuesReminderStore,
  deps: DuesRemindersDeps,
  now: Date,
  logger: ReminderLogger,
  runStep: (associationId: string, fn: () => Promise<AssociationRunResult>) => Promise<AssociationRunResult> = (
    _id,
    fn,
  ) => fn(),
): Promise<DuesRemindersSummary> {
  const associations = await store.loadAssociations()
  const secret = deps.settingsSecret()
  const summary: DuesRemindersSummary = {
    associations: associations.length,
    enabled: 0,
    planned: 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
  }

  for (const a of associations) {
    const read = readDuesReminderSettings(a.id, a.complianceSettings, secret)
    if (read.state === 'unverified') {
      logger.warn(`[dues-reminders] ${a.id}: config present but not verified; treated as off`)
    }
    const settings = effectiveDuesReminderSettings(read)
    if (!settings.enabled) continue
    summary.enabled += 1
    // Per association (BL-043): one cron instant can be different days.
    const today = todayInZone(now, a.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE)

    try {
      const r = await runStep(a.id, () =>
        runDuesRemindersForAssociation(
          store,
          deps,
          { associationId: a.id, organizationId: a.organizationId, associationName: a.name, settings, today },
          logger,
        ),
      )
      summary.planned += r.planned
      summary.sent += r.sent
      summary.suppressed += r.suppressed
      summary.failed += r.failed
    } catch (err) {
      logger.error(`[dues-reminders] ${a.id}: run failed`, { error: err instanceof Error ? err.name : 'unknown' })
    }
  }
  return summary
}

// ─── Supabase store ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const IN_CHUNK = 100

function chunks<T>(xs: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

function readError(what: string, error: { message?: string; code?: string }): Error {
  // Message/code only: PostgrestError.details can echo row values.
  return new Error(`dues-reminders: failed to load ${what} (${error.code ?? 'unknown'})`)
}

function unitLabel(u: { address_line1: string | null; unit_number: string | null } | null): string {
  if (!u) return 'Your property'
  const address = u.address_line1 ?? 'Your property'
  return u.unit_number ? `${address} · Unit ${u.unit_number}` : address
}

/** The store over a Supabase client. The job passes the service-role
 *  client; the settings dry run passes the board member's session client
 *  and only ever calls the read methods. */
export function supabaseReminderStore(db: Db): DuesReminderStore {
  return {
    async loadAssociations() {
      const { data, error } = await db
        .from('associations')
        .select(`id, name, organization_id, compliance_settings, ${ASSOCIATION_ZONE_COLUMNS}, orgs:organization_id(hub_type)`)
      if (error) throw readError('associations', error)
      return ((data ?? []) as Array<{
        id: string
        name: string
        organization_id: string
        compliance_settings: unknown
        state: string | null
        orgs: { hub_type: string } | null
      }>)
        .filter((a) => a.orgs?.hub_type === 'hoa')
        .map((a) => ({
          id: a.id,
          name: a.name,
          organizationId: a.organization_id,
          complianceSettings: a.compliance_settings,
          timeZone: associationTimeZone(a),
        }))
    },

    async loadOpenAssessments(associationId) {
      // Paged to the end (BL-047). The old `.limit(5000)` could only lower
      // what came back: PostgREST's max_rows (1000) applied underneath, so
      // charges past the first 1000 never got their reminder.
      type Row = {
        id: string
        unit_id: string
        amount: number
        due_date: string
        assessment_type: string
        payments: { amount: number }[] | null
        unit: { address_line1: string | null; unit_number: string | null } | null
      }
      const data = await readAll<Row>(
        (from, to) =>
          db
            .from('assessments')
            .select(
              'id, unit_id, amount, due_date, assessment_type, payments(amount), unit:unit_id(address_line1, unit_number)',
            )
            .eq('association_id', associationId)
            .in('status', ['open', 'partial'])
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { code?: string; message?: string } | null }>,
        (e) => readError('assessments', e),
      )
      return data.map((a) => ({
        id: a.id,
        unitId: a.unit_id,
        unitLabel: unitLabel(a.unit),
        dueDate: a.due_date,
        amount: Number(a.amount),
        paid: (a.payments ?? []).reduce((s, p) => s + Number(p.amount), 0),
        assessmentType: a.assessment_type,
      }))
    },

    async loadActivePlanUnitIds(organizationId, unitIds) {
      const out = new Set<string>()
      for (const part of chunks(unitIds)) {
        const { data, error } = await db
          .from('payment_plans')
          .select('unit_id')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .in('unit_id', part)
        if (error) throw readError('payment plans', error)
        for (const r of (data ?? []) as { unit_id: string }[]) out.add(r.unit_id)
      }
      return out
    },

    async loadAttorneyStageUnitIds(associationId) {
      const { data, error } = await db
        .from('collection_cases')
        .select('unit_id')
        .eq('association_id', associationId)
        .in('status', [...ATTORNEY_STAGE_STATUSES])
        .is('deleted_at', null)
      if (error) throw readError('collection cases', error)
      return new Set(((data ?? []) as { unit_id: string }[]).map((r) => r.unit_id))
    },

    async loadOwnerships(unitIds) {
      const out: PlanOwnership[] = []
      for (const part of chunks(unitIds)) {
        const { data, error } = await db
          .from('ownerships')
          .select('unit_id, owner_name, owner_email, owner_user_id')
          .in('unit_id', part)
          .is('valid_to', null)
        if (error) throw readError('ownerships', error)
        for (const o of (data ?? []) as Array<{
          unit_id: string
          owner_name: string | null
          owner_email: string | null
          owner_user_id: string | null
        }>) {
          out.push({
            unitId: o.unit_id,
            ownerName: o.owner_name,
            ownerEmail: o.owner_email,
            ownerUserId: o.owner_user_id,
          })
        }
      }
      return out
    },

    async loadExistingCommunicationIds(ids) {
      const out = new Set<string>()
      for (const part of chunks(ids)) {
        const { data, error } = await db.from('communications').select('id').in('id', part)
        if (error) throw readError('reminder history', error)
        for (const r of (data ?? []) as { id: string }[]) out.add(r.id)
      }
      return out
    },

    orgSandbox(organizationId) {
      return fetchOrgSandbox(db, organizationId)
    },

    async claim(c) {
      const { error } = await db.from('communications').insert({
        id: c.id,
        organization_id: c.organizationId,
        association_id: c.associationId,
        category: 'dues',
        subject: c.subject,
        body_html: c.html,
        body_text: c.text,
        channels: ['email'],
        audience_definition: { kind: 'precomputed', summary: c.audienceSummary },
        audience_summary: c.audienceSummary,
        status: 'sending',
        source: 'cron',
        related_resource: c.relatedResource,
      })
      if (!error) return { ok: true }
      // 23505 unique_violation on the primary key: already claimed.
      if (error.code === '23505') return { ok: false, reason: 'exists' }
      throw new Error(`dues-reminders: claim failed (${error.code ?? 'unknown'})`)
    },

    async insertRecipients(communicationId, organizationId, unitId, recipients) {
      const { data, error } = await db
        .from('communication_recipients')
        .insert(
          recipients.map((r) => ({
            organization_id: organizationId,
            communication_id: communicationId,
            unit_id: unitId,
            user_id: r.userId,
            recipient_name: r.name,
            email: r.email,
            channel: 'email',
            delivery_status: 'queued',
          })),
        )
        .select('id, email, recipient_name')
      if (error || !data) throw new Error(`dues-reminders: recipient insert failed (${error?.code ?? 'no data'})`)
      return (data as Array<{ id: string; email: string; recipient_name: string | null }>).map((r) => ({
        id: r.id,
        email: r.email,
        name: r.recipient_name ?? 'Owner',
      }))
    },

    async markRecipient(id, outcome) {
      const at = new Date().toISOString()
      const patch =
        outcome.status === 'sent'
          ? { delivery_status: 'sent', external_id: outcome.externalId, sent_at: at }
          : { delivery_status: outcome.status, error_message: outcome.error, failed_at: at }
      const { error } = await db.from('communication_recipients').update(patch).eq('id', id)
      if (error) throw new Error(`dues-reminders: recipient update failed (${error.code ?? 'unknown'})`)
    },

    async finish(communicationId, status) {
      const { error } = await db
        .from('communications')
        .update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null })
        .eq('id', communicationId)
      if (error) throw new Error(`dues-reminders: status update failed (${error.code ?? 'unknown'})`)
    },
  }
}
