/**
 * Vendor COI expiry reminders (BL-083) — the runner.
 *
 * Per HOA association, on the association's own calendar day:
 *
 *   1. find   vendor_compliance rows whose coi_expiration_date is inside a
 *             milestone window (milestones.ts), for vendors that are active
 *             or prospects and not deleted
 *   2. email  each vendor at its primary_email — VENDORS ONLY, never a
 *             resident or owner — unless the board turned reminders off
 *             (Settings → Vendors, compliance_settings.vendor_insurance).
 *             A communications row with a deterministic id is claimed
 *             first; a primary-key conflict means this milestone was
 *             already handled and nothing is sent (at-most-once).
 *   3. notify every board member / admin in-app, once per milestone
 *             (notifications dedupe index: user_id + kind + entity_id),
 *             whether or not the vendor could be emailed.
 *
 * Sending goes through the injected guarded sender (apps/hoa's sendEmail,
 * BL-004) with the org's sandbox flag. Logs carry ids and counts only —
 * never an address, a vendor name or a subject.
 */

import { fetchOrgSandbox, OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  insuranceRequirementLines,
  resolveVendorInsuranceSettings,
} from '@homeowner-portal/workflows/vendor-insurance'
import {
  ASSOCIATION_ZONE_COLUMNS,
  DEFAULT_ASSOCIATION_TIME_ZONE,
  addCalendarDays,
  associationTimeZone,
  todayIn,
} from '../association-time'
import { readAll } from '../read-all'
import {
  EXPIRED_GRACE_DAYS,
  FIRST_WARNING_DAYS,
  coiMilestone,
  coiNoticeEntityId,
  coiReminderCommunicationId,
  type CoiMilestone,
} from './milestones'
import { renderBoardNotice, renderVendorReminder, type VendorEmailOutcome } from './render'

/** communications.related_resource.type for these rows. */
export const VENDOR_COI_REMINDER_RESOURCE_TYPE = 'vendor_coi_reminder'
/** notifications.kind for the board's notice. */
export const VENDOR_COI_NOTICE_KIND = 'vendor.coi_expiring'
/** Vendors still worth chasing; inactive and blacklisted ones are not. */
export const REMINDED_VENDOR_STATUSES = ['active', 'prospect'] as const
/** Who gets the in-app notice — the same roles as daily-digest's BOARD_ROLES. A resident never. */
const BOARD_ROLES = ['board', 'admin'] as const

// ─── deps ───────────────────────────────────────────────────────────

export interface VendorCoiEmail {
  to: string
  subject: string
  html: string
  text: string
  senderName?: string | null
  /** The communication_recipients row, so a reply threads back to it. */
  recipientRef?: string | null
}

export interface VendorCoiRemindersDeps {
  /** A guarded sender — in production, apps/hoa's `sendEmail`. */
  sendEmail: (
    input: VendorCoiEmail,
    opts: { orgSandbox?: boolean; ref?: string },
  ) => Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>
  /** The server-only secret the vendor_insurance setting is signed with. */
  settingsSecret: () => string | null
  /** False when the transport would no-op and report success. */
  emailConfigured: () => boolean
}

export interface CoiLogger {
  info: (msg: string, ...rest: unknown[]) => void
  warn: (msg: string, ...rest: unknown[]) => void
  error: (msg: string, ...rest: unknown[]) => void
}

// ─── store ──────────────────────────────────────────────────────────

export interface CoiAssociation {
  id: string
  name: string
  organizationId: string
  complianceSettings: unknown
  /** IANA zone (BL-043). Absent → America/New_York. */
  timeZone?: string
}

export interface ExpiringCoi {
  vendorId: string
  vendorName: string
  vendorEmail: string | null
  expiresOn: string
}

export interface CoiClaimInput {
  id: string
  organizationId: string
  associationId: string
  subject: string
  html: string
  text: string
  audienceSummary: string
  relatedResource: Record<string, unknown>
}

export interface CoiNoticeRow {
  organizationId: string
  userId: string
  title: string
  body: string
  link: string
  entityId: string
}

export type CoiRecipientOutcome =
  | { status: 'sent'; externalId: string | null }
  | { status: 'suppressed' | 'failed'; error: string }

/** Reads THROW on error: a failed read must stop the association's run,
 *  not read as "nothing expiring". */
export interface VendorCoiStore {
  loadAssociations(): Promise<CoiAssociation[]>
  loadExpiring(associationId: string, fromDay: string, throughDay: string): Promise<ExpiringCoi[]>
  loadBoardUserIds(organizationId: string): Promise<string[]>
  /** `${userId}:${entityId}` for notices that already exist. */
  loadExistingNotices(entityIds: string[]): Promise<Set<string>>
  insertNotices(rows: CoiNoticeRow[]): Promise<void>
  orgSandbox(organizationId: string): Promise<boolean>
  claim(input: CoiClaimInput): Promise<{ ok: true } | { ok: false; reason: 'exists' }>
  insertRecipient(
    communicationId: string,
    organizationId: string,
    recipient: { email: string; name: string },
  ): Promise<{ id: string }>
  markRecipient(id: string, outcome: CoiRecipientOutcome): Promise<void>
  finish(communicationId: string, status: 'sent' | 'failed'): Promise<void>
}

// ─── planning ───────────────────────────────────────────────────────

export interface DueReminder extends ExpiringCoi {
  milestone: CoiMilestone
  daysLeft: number
  communicationId: string
  noticeEntityId: string
}

/** The (vendor, milestone) pairs in reach today, one per vendor. */
export function dueReminders(associationId: string, rows: ExpiringCoi[], today: string): DueReminder[] {
  const out: DueReminder[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.vendorId)) continue
    const hit = coiMilestone(r.expiresOn, today)
    if (!hit) continue
    seen.add(r.vendorId)
    const expiresOn = r.expiresOn.slice(0, 10)
    out.push({
      ...r,
      expiresOn,
      ...hit,
      communicationId: coiReminderCommunicationId(associationId, r.vendorId, expiresOn, hit.milestone),
      noticeEntityId: coiNoticeEntityId(associationId, r.vendorId, expiresOn, hit.milestone),
    })
  }
  return out
}

// ─── running ────────────────────────────────────────────────────────

export interface CoiAssociationResult {
  due: number
  emailed: number
  suppressed: number
  failed: number
  alreadySent: number
  noEmail: number
  remindersOff: boolean
  notices: number
}

const emptyResult = (): CoiAssociationResult => ({
  due: 0,
  emailed: 0,
  suppressed: 0,
  failed: 0,
  alreadySent: 0,
  noEmail: 0,
  remindersOff: false,
  notices: 0,
})

async function emailVendor(
  store: VendorCoiStore,
  deps: VendorCoiRemindersDeps,
  ctx: { association: CoiAssociation; requirementLines: string[]; orgSandbox: boolean },
  due: DueReminder & { vendorEmail: string },
): Promise<'sent' | 'suppressed' | 'failed' | 'exists'> {
  const { association } = ctx
  const email = renderVendorReminder({
    associationName: association.name,
    vendorName: due.vendorName,
    expiresOn: due.expiresOn,
    milestone: due.milestone,
    daysLeft: due.daysLeft,
    requirementLines: ctx.requirementLines,
  })
  const claim = await store.claim({
    id: due.communicationId,
    organizationId: association.organizationId,
    associationId: association.id,
    ...email,
    audienceSummary: 'Vendor insurance reminder: 1 vendor',
    relatedResource: {
      type: VENDOR_COI_REMINDER_RESOURCE_TYPE,
      id: due.vendorId,
      auto: true,
      milestone: due.milestone,
      expires_on: due.expiresOn,
    },
  })
  if (!claim.ok) return 'exists'

  let outcome: CoiRecipientOutcome = { status: 'failed', error: 'not attempted' }
  try {
    const row = await store.insertRecipient(due.communicationId, association.organizationId, {
      email: due.vendorEmail,
      name: due.vendorName,
    })
    try {
      const res = await deps.sendEmail(
        { to: due.vendorEmail, ...email, senderName: association.name, recipientRef: row.id },
        { orgSandbox: ctx.orgSandbox, ref: due.communicationId },
      )
      if (res.ok) outcome = { status: 'sent', externalId: res.messageId }
      else if (res.error === OUTBOUND_BLOCKED_ERROR) outcome = { status: 'suppressed', error: res.error }
      else outcome = { status: 'failed', error: res.error.slice(0, 500) }
    } catch (err) {
      outcome = { status: 'failed', error: err instanceof Error ? err.name : 'send threw' }
    }
    await store.markRecipient(row.id, outcome)
  } finally {
    await store.finish(due.communicationId, outcome.status === 'sent' ? 'sent' : 'failed')
  }
  return outcome.status
}

export async function runVendorCoiRemindersForAssociation(
  store: VendorCoiStore,
  deps: VendorCoiRemindersDeps,
  association: CoiAssociation,
  now: Date,
  logger: CoiLogger,
): Promise<CoiAssociationResult> {
  const tag = `[vendor-coi-reminders] ${association.id}`
  const result = emptyResult()
  const today = todayIn(association.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE, now)
  const settings = resolveVendorInsuranceSettings(association.id, association.complianceSettings, deps.settingsSecret())
  result.remindersOff = !settings.coiRemindersEnabled

  const rows = await store.loadExpiring(
    association.id,
    addCalendarDays(today, -EXPIRED_GRACE_DAYS),
    addCalendarDays(today, FIRST_WARNING_DAYS),
  )
  const due = dueReminders(association.id, rows, today)
  result.due = due.length
  if (due.length === 0) return result

  const emailReady = settings.coiRemindersEnabled && deps.emailConfigured()
  if (settings.coiRemindersEnabled && !deps.emailConfigured()) {
    // The transport would report success without sending; claiming now
    // would mark the milestone done with nothing delivered.
    logger.warn(`${tag}: email delivery is not configured; nothing claimed`)
  }
  const orgSandbox = emailReady ? await store.orgSandbox(association.organizationId) : false
  const requirementLines = insuranceRequirementLines(settings.minimums)

  const outcomes = new Map<string, VendorEmailOutcome>()
  for (const d of due) {
    if (!settings.coiRemindersEnabled) {
      outcomes.set(d.vendorId, 'reminders_off')
      continue
    }
    if (!d.vendorEmail) {
      result.noEmail += 1
      outcomes.set(d.vendorId, 'no_email')
      continue
    }
    if (!emailReady) {
      outcomes.set(d.vendorId, 'not_sent')
      continue
    }
    try {
      const r = await emailVendor(store, deps, { association, requirementLines, orgSandbox }, { ...d, vendorEmail: d.vendorEmail })
      if (r === 'exists') result.alreadySent += 1
      else if (r === 'sent') result.emailed += 1
      else if (r === 'suppressed') result.suppressed += 1
      else result.failed += 1
      outcomes.set(d.vendorId, r === 'sent' || r === 'exists' ? 'emailed' : 'not_sent')
    } catch (err) {
      // One vendor's failure must not stop the others. Id and error class only.
      result.failed += 1
      outcomes.set(d.vendorId, 'not_sent')
      logger.error(`${tag}: reminder ${d.communicationId} failed`, { error: err instanceof Error ? err.name : 'unknown' })
    }
  }

  // The board hears about every milestone, emailed or not.
  const boardIds = await store.loadBoardUserIds(association.organizationId)
  if (boardIds.length > 0) {
    const existing = await store.loadExistingNotices(due.map((d) => d.noticeEntityId))
    const rowsToInsert: CoiNoticeRow[] = []
    for (const d of due) {
      const notice = renderBoardNotice({
        vendorName: d.vendorName,
        expiresOn: d.expiresOn,
        milestone: d.milestone,
        daysLeft: d.daysLeft,
        outcome: outcomes.get(d.vendorId) ?? 'not_sent',
      })
      for (const userId of boardIds) {
        if (existing.has(`${userId}:${d.noticeEntityId}`)) continue
        rowsToInsert.push({
          organizationId: association.organizationId,
          userId,
          ...notice,
          link: `/vendors/${d.vendorId}`,
          entityId: d.noticeEntityId,
        })
      }
    }
    if (rowsToInsert.length > 0) {
      await store.insertNotices(rowsToInsert)
      result.notices = rowsToInsert.length
    }
  }

  logger.info(
    `${tag}: ${result.due} due; ${result.emailed} emailed, ${result.suppressed} suppressed, ${result.failed} failed, ${result.alreadySent} already sent, ${result.noEmail} without email; ${result.notices} board notice(s)`,
    { remindersOff: result.remindersOff, orgSandbox },
  )
  return result
}

export interface VendorCoiRemindersSummary {
  associations: number
  due: number
  emailed: number
  suppressed: number
  failed: number
  notices: number
}

export async function runVendorCoiReminders(
  store: VendorCoiStore,
  deps: VendorCoiRemindersDeps,
  now: Date,
  logger: CoiLogger,
  runStep: (associationId: string, fn: () => Promise<CoiAssociationResult>) => Promise<CoiAssociationResult> = (
    _id,
    fn,
  ) => fn(),
): Promise<VendorCoiRemindersSummary> {
  const associations = await store.loadAssociations()
  const summary: VendorCoiRemindersSummary = {
    associations: associations.length,
    due: 0,
    emailed: 0,
    suppressed: 0,
    failed: 0,
    notices: 0,
  }
  for (const a of associations) {
    try {
      const r = await runStep(a.id, () => runVendorCoiRemindersForAssociation(store, deps, a, now, logger))
      summary.due += r.due
      summary.emailed += r.emailed
      summary.suppressed += r.suppressed
      summary.failed += r.failed
      summary.notices += r.notices
    } catch (err) {
      logger.error(`[vendor-coi-reminders] ${a.id}: run failed`, { error: err instanceof Error ? err.name : 'unknown' })
    }
  }
  return summary
}

// ─── Supabase store ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const IN_CHUNK = 100

function readError(what: string, error: { code?: string }): Error {
  // Code only: PostgrestError.details/message can echo row values.
  return new Error(`vendor-coi-reminders: failed to load ${what} (${error.code ?? 'unknown'})`)
}

function writeError(what: string, error: { code?: string } | null): Error {
  return new Error(`vendor-coi-reminders: ${what} failed (${error?.code ?? 'unknown'})`)
}

export function supabaseVendorCoiStore(db: Db): VendorCoiStore {
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

    async loadExpiring(associationId, fromDay, throughDay) {
      type Row = {
        id: string
        vendor_id: string
        coi_expiration_date: string | null
        vendor: {
          legal_name: string
          primary_email: string | null
          status: string
          deleted_at: string | null
        } | null
      }
      const rows = await readAll<Row>(
        (from, to) =>
          db
            .from('vendor_compliance')
            .select('id, vendor_id, coi_expiration_date, vendor:vendor_id(legal_name, primary_email, status, deleted_at)')
            .eq('association_id', associationId)
            .gte('coi_expiration_date', fromDay)
            .lte('coi_expiration_date', throughDay)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { code?: string } | null }>,
        (e) => readError('vendor compliance', e),
      )
      return rows
        .filter(
          (r) =>
            r.coi_expiration_date &&
            r.vendor &&
            r.vendor.deleted_at === null &&
            (REMINDED_VENDOR_STATUSES as readonly string[]).includes(r.vendor.status),
        )
        .map((r) => ({
          vendorId: r.vendor_id,
          vendorName: r.vendor!.legal_name,
          vendorEmail: r.vendor!.primary_email?.trim() || null,
          expiresOn: r.coi_expiration_date!,
        }))
    },

    async loadBoardUserIds(organizationId) {
      const { data, error } = await db.from('org_members').select('user_id, role').eq('org_id', organizationId)
      if (error) throw readError('board members', error)
      const roles = new Set<string>(BOARD_ROLES)
      return [
        ...new Set(
          ((data ?? []) as Array<{ user_id: string; role: string }>).filter((m) => roles.has(m.role)).map((m) => m.user_id),
        ),
      ]
    },

    async loadExistingNotices(entityIds) {
      const out = new Set<string>()
      for (let i = 0; i < entityIds.length; i += IN_CHUNK) {
        const { data, error } = await db
          .from('notifications')
          .select('user_id, entity_id')
          .eq('kind', VENDOR_COI_NOTICE_KIND)
          .in('entity_id', entityIds.slice(i, i + IN_CHUNK))
        if (error) throw readError('notifications', error)
        for (const r of (data ?? []) as Array<{ user_id: string; entity_id: string }>) out.add(`${r.user_id}:${r.entity_id}`)
      }
      return out
    },

    async insertNotices(rows) {
      // Read-first dedupe (loadExistingNotices), not ON CONFLICT: the
      // unique index is partial and PostgREST cannot name its predicate
      // (see ticket-notifications.ts). 23505 = a concurrent retry won.
      const { error } = await db.from('notifications').insert(
        rows.map((r) => ({
          organization_id: r.organizationId,
          user_id: r.userId,
          kind: VENDOR_COI_NOTICE_KIND,
          title: r.title,
          body: r.body,
          link: r.link,
          entity_type: 'vendor_coi',
          entity_id: r.entityId,
        })),
      )
      if (error && error.code !== '23505') throw writeError('notifications insert', error)
    },

    orgSandbox(organizationId) {
      return fetchOrgSandbox(db, organizationId)
    },

    async claim(c) {
      const { error } = await db.from('communications').insert({
        id: c.id,
        organization_id: c.organizationId,
        association_id: c.associationId,
        category: 'custom',
        subject: c.subject,
        body_html: c.html,
        body_text: c.text,
        channels: ['email'],
        audience_definition: { kind: 'vendor', vendor_id: c.relatedResource.id, summary: c.audienceSummary },
        audience_summary: c.audienceSummary,
        status: 'sending',
        source: 'cron',
        related_resource: c.relatedResource,
      })
      if (!error) return { ok: true }
      // 23505 unique_violation on the primary key: already claimed.
      if (error.code === '23505') return { ok: false, reason: 'exists' }
      throw writeError('claim', error)
    },

    async insertRecipient(communicationId, organizationId, r) {
      const { data, error } = await db
        .from('communication_recipients')
        .insert({
          organization_id: organizationId,
          communication_id: communicationId,
          recipient_name: r.name,
          email: r.email,
          channel: 'email',
          delivery_status: 'queued',
        })
        .select('id')
        .single()
      if (error || !data) throw writeError('recipient insert', error)
      return { id: (data as { id: string }).id }
    },

    async markRecipient(id, outcome) {
      const at = new Date().toISOString()
      const patch =
        outcome.status === 'sent'
          ? { delivery_status: 'sent', external_id: outcome.externalId, sent_at: at }
          : { delivery_status: outcome.status, error_message: outcome.error, failed_at: at }
      const { error } = await db.from('communication_recipients').update(patch).eq('id', id)
      if (error) throw writeError('recipient update', error)
    },

    async finish(communicationId, status) {
      const { error } = await db
        .from('communications')
        .update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null })
        .eq('id', communicationId)
      if (error) throw writeError('status update', error)
    },
  }
}
