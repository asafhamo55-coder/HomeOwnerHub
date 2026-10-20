/**
 * Vendor COI expiry reminders (BL-083) — the runner. BOARD-FACING ONLY.
 *
 * Owner safety rule (2026-10-20): nothing emails anyone outside the board
 * automatically. This job used to email vendors at 30 / 7 / 0 days; it no
 * longer has a sender at all. Per HOA association, on the association's
 * own calendar day:
 *
 *   1. find   vendor_compliance rows whose coi_expiration_date is inside a
 *             milestone window (milestones.ts), for vendors that are active
 *             or prospects and not deleted
 *   2. notify every board member / admin in-app, once per milestone
 *             (notifications dedupe index: user_id + kind + entity_id),
 *             linking to the vendor page, where "Request updated
 *             certificate" drafts the vendor email for the board to review
 *             and send by hand. Skipped when the board turned reminders off
 *             at Settings → Vendors (compliance_settings.vendor_insurance).
 *
 * The dashboard's digest card and At-risk list read the same expiry from
 * vendor_compliance live (apps/hoa/src/lib/dashboard/queries.ts), so they
 * need nothing from this job. Logs carry ids and counts only — never a
 * vendor name.
 */

import { resolveVendorInsuranceSettings } from '@homeowner-portal/workflows/vendor-insurance'
import {
  ASSOCIATION_ZONE_COLUMNS,
  DEFAULT_ASSOCIATION_TIME_ZONE,
  addCalendarDays,
  associationTimeZone,
  todayIn,
} from '../association-time'
import { readAll } from '../read-all'
import { EXPIRED_GRACE_DAYS, FIRST_WARNING_DAYS, coiMilestone, coiNoticeEntityId, type CoiMilestone } from './milestones'
import { renderBoardNotice } from './render'

/** notifications.kind for the board's notice. */
export const VENDOR_COI_NOTICE_KIND = 'vendor.coi_expiring'
/** Vendors still worth chasing; inactive and blacklisted ones are not. */
export const REMINDED_VENDOR_STATUSES = ['active', 'prospect'] as const
/** Who gets the in-app notice — the same roles as daily-digest's BOARD_ROLES. A resident never. */
const BOARD_ROLES = ['board', 'admin'] as const

// ─── deps ───────────────────────────────────────────────────────────

/** Deliberately no sender: this job cannot email anyone. */
export interface VendorCoiRemindersDeps {
  /** The server-only secret the vendor_insurance setting is signed with. */
  settingsSecret: () => string | null
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
  expiresOn: string
}

export interface CoiNoticeRow {
  organizationId: string
  userId: string
  title: string
  body: string
  link: string
  entityId: string
}

/** Reads THROW on error: a failed read must stop the association's run,
 *  not read as "nothing expiring". */
export interface VendorCoiStore {
  loadAssociations(): Promise<CoiAssociation[]>
  loadExpiring(associationId: string, fromDay: string, throughDay: string): Promise<ExpiringCoi[]>
  loadBoardUserIds(organizationId: string): Promise<string[]>
  /** `${userId}:${entityId}` for notices that already exist. */
  loadExistingNotices(entityIds: string[]): Promise<Set<string>>
  insertNotices(rows: CoiNoticeRow[]): Promise<void>
}

// ─── planning ───────────────────────────────────────────────────────

export interface DueReminder extends ExpiringCoi {
  milestone: CoiMilestone
  daysLeft: number
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
      noticeEntityId: coiNoticeEntityId(associationId, r.vendorId, expiresOn, hit.milestone),
    })
  }
  return out
}

// ─── running ────────────────────────────────────────────────────────

export interface CoiAssociationResult {
  due: number
  remindersOff: boolean
  notices: number
}

export async function runVendorCoiRemindersForAssociation(
  store: VendorCoiStore,
  deps: VendorCoiRemindersDeps,
  association: CoiAssociation,
  now: Date,
  logger: CoiLogger,
): Promise<CoiAssociationResult> {
  const tag = `[vendor-coi-reminders] ${association.id}`
  const today = todayIn(association.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE, now)
  const settings = resolveVendorInsuranceSettings(association.id, association.complianceSettings, deps.settingsSecret())
  const result: CoiAssociationResult = { due: 0, remindersOff: !settings.coiRemindersEnabled, notices: 0 }
  if (result.remindersOff) {
    logger.info(`${tag}: board reminders are off`)
    return result
  }

  const rows = await store.loadExpiring(
    association.id,
    addCalendarDays(today, -EXPIRED_GRACE_DAYS),
    addCalendarDays(today, FIRST_WARNING_DAYS),
  )
  const due = dueReminders(association.id, rows, today)
  result.due = due.length
  if (due.length === 0) return result

  const boardIds = await store.loadBoardUserIds(association.organizationId)
  if (boardIds.length > 0) {
    const existing = await store.loadExistingNotices(due.map((d) => d.noticeEntityId))
    const rowsToInsert: CoiNoticeRow[] = []
    for (const d of due) {
      const notice = renderBoardNotice(d)
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

  logger.info(`${tag}: ${result.due} due; ${result.notices} board notice(s)`)
  return result
}

export interface VendorCoiRemindersSummary {
  associations: number
  due: number
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
  const summary: VendorCoiRemindersSummary = { associations: associations.length, due: 0, notices: 0 }
  for (const a of associations) {
    try {
      const r = await runStep(a.id, () => runVendorCoiRemindersForAssociation(store, deps, a, now, logger))
      summary.due += r.due
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
          status: string
          deleted_at: string | null
        } | null
      }
      const rows = await readAll<Row>(
        (from, to) =>
          db
            .from('vendor_compliance')
            .select('id, vendor_id, coi_expiration_date, vendor:vendor_id(legal_name, status, deleted_at)')
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
  }
}
