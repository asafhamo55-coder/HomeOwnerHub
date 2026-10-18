import type { SupabaseClient } from '@supabase/supabase-js'
import { loadOrFail, tryLoad, type LoadResult } from '@/lib/load-or-fail'
import { readAllResult } from '@/lib/supabase/read-all'
import { listThreadsForUnit } from '@/lib/inbox/queries'
import { CASE_COLUMNS, EVENT_COLUMNS, sortEventsNewestFirst, toCase, toEvent, type CollectionCase, type CollectionEvent } from '@/lib/collections/queries'
import type { PropertyResidentRow } from '@/lib/property-residents'
import type { PropertyEventRow } from '@/lib/property-events'
import type { PlanStandingView } from '@/lib/money/plan-standing'
import type { PropertyTenure } from './index'
import { AUDIT_APPLIED, selfUpdateDates } from '../contact-updates/model'
import { resolveUnitForProperty, type PropertyId, type UnitId, type UnitResolution } from './resolve'
import type {
  ArcRow,
  LedgerAssessmentRow,
  NoticeRow,
  OpenAssessmentRow,
  OwnershipRow,
  PaymentPlanRow,
  PaymentRow,
  TenancyRow,
  ThreadRow,
  ViolationRow,
} from './property-360-model'

/**
 * Everything the property page (the "360") shows, read in exactly TWO
 * parallel waves (BL-074; property-360.test.ts counts them):
 *
 *   1. by property id — the home, residents, history, the unit it means,
 *      the list-view stats row, violations and the association's waiting
 *      list;
 *   2. by that unit — open charges (aging), the last ledger lines,
 *      payments, payment plans, collections cases with their events, ARC,
 *      mail, notices sent, leases and ownerships.
 *
 * Every read is a fixed number of queries whatever the home holds (no
 * per-row lookups); the ones that can exceed a page go through
 * readAllResult past the 1000-row cap; the rest are "latest N" reads the
 * page labels as such. Each section is a separate result, so one failed
 * read shows "Couldn't load" in that section only — never zeros, never a
 * blank page. `null` for a unit-keyed section means the home has no unit
 * linked (nothing to read), which the page words differently from a
 * failure.
 *
 * Takes the client as an argument (no Next imports beyond load-or-fail's
 * control-flow rethrow), so a counting fake can drive it in a unit test.
 */

export type Part<T> = { ok: true; data: T } | { ok: false }
/** A unit-keyed section: null = no unit linked to the home. */
export type UnitPart<T> = Part<T> | null

export interface PropertyRecord {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  notes: string | null
  tenure: PropertyTenure
  tenure_updated_at: string | null
  created_at: string | null
}

export interface StatsRow {
  balance: number
  daysOverdue: number
  openViolations: number
  violationsPastCure: number
  threadsNeedingReply: number
}

export interface CollectionsFile {
  openCase: CollectionCase | null
  events: CollectionEvent[]
  closed: CollectionCase[]
}

export interface Property360 {
  property: PropertyRecord
  unit: Part<UnitResolution>
  residents: Part<PropertyResidentRow[]>
  events: Part<PropertyEventRow[]>
  stats: Part<StatsRow | null>
  violations: Part<ViolationRow[]>
  waitingQueue: Part<{ id: string; property_id: string; requested_at: string }[]>
  openAssessments: UnitPart<OpenAssessmentRow[]>
  ledger: UnitPart<{ rows: LedgerAssessmentRow[]; total: number | null }>
  payments: UnitPart<PaymentRow[]>
  plans: UnitPart<PaymentPlanRow[]>
  collections: UnitPart<CollectionsFile>
  arc: UnitPart<ArcRow[]>
  threads: UnitPart<ThreadRow[]>
  notices: UnitPart<NoticeRow[]>
  tenancies: UnitPart<TenancyRow[]>
  ownerships: UnitPart<OwnershipRow[]>
  /**
   * PR-10: when each resident row / ownership was last updated by the
   * person themselves (an approved portal contact update), by id. Optional
   * so fixtures without it still render; absent or failed = say nothing.
   */
  selfUpdates?: Part<Record<string, string>>
  /**
   * BL-080: how each listed plan is going (behind, on track, completed on
   * a day), by plan id. Read by the page after the 360 (it needs the
   * association and its day); absent or failed = say nothing extra.
   */
  planStandings?: Part<Record<string, PlanStandingView>>
}

/** How many of each "latest" list the page shows (it says so and links on). */
export const LATEST = { events: 50, ledger: 6, payments: 6, plans: 5, notices: 10, tenancies: 10, ownerships: 20 } as const

type Db = SupabaseClient

const part = <T>(r: LoadResult<T>): Part<T> => (r.ok ? { ok: true, data: r.data } : { ok: false })
const mapPart = <T, U>(r: LoadResult<T>, f: (t: T) => U): Part<U> => (r.ok ? { ok: true, data: f(r.data) } : { ok: false })

const PROPERTY_COLUMNS =
  'id, address, unit_number, owner_name, owner_email, owner_phone, notes, tenure, tenure_updated_at, created_at'

export async function loadProperty360(
  db: Db,
  input: { orgId: string; propertyId: PropertyId },
): Promise<{ kind: 'ok'; data: Property360 } | { kind: 'not_found' } | { kind: 'failed' }> {
  const { orgId, propertyId } = input

  // ── Wave 1: by property id ──────────────────────────────────────────
  const [propertyRes, residentsRes, eventsRes, unitRes, statsRes, violationsRes, queueRes, selfRes] = await Promise.all([
    loadOrFail(
      'property',
      db.from('hoa_properties').select(PROPERTY_COLUMNS).eq('id', propertyId).eq('org_id', orgId).is('deleted_at', null).maybeSingle(),
    ),
    loadOrFail(
      'property residents',
      readAllResult<PropertyResidentRow>((from, to) =>
        db
          .from('property_residents' as never)
          .select('id, property_id, full_name, email, phone, role, is_primary, moved_in_at, moved_out_at, notes, created_at')
          .eq('property_id' as never, propertyId)
          .is('deleted_at' as never, null)
          .order('id' as never, { ascending: true })
          .range(from, to) as never,
      ),
    ),
    loadOrFail(
      'property history',
      db
        .from('property_events' as never)
        .select('id, property_id, occurred_at, kind, payload, notes, created_by')
        .eq('property_id' as never, propertyId)
        .order('occurred_at' as never, { ascending: false })
        .limit(LATEST.events),
    ),
    tryLoad('property unit', () => resolveUnitForProperty(db as never, orgId, propertyId)),
    loadOrFail(
      'property stats',
      db
        .from('hoa_property_list_v' as never)
        .select('balance, days_overdue, open_violations, violations_past_cure, threads_needing_reply')
        .eq('id' as never, propertyId)
        .eq('org_id' as never, orgId)
        .maybeSingle(),
    ),
    loadOrFail(
      'property violations',
      readAllResult<ViolationRow>((from, to) =>
        db
          .from('hoa_violations')
          .select('id, description, status, severity, created_at, cure_period_days, notice_sent_at, resolved_at')
          .eq('property_id', propertyId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to) as never,
      ),
    ),
    // The whole queue, not just this home's entry: the position needs it.
    loadOrFail(
      'lease waiting list',
      readAllResult<{ id: string; property_id: string; requested_at: string }>((from, to) =>
        db
          .from('lease_waiting_list' as never)
          .select('id, property_id, requested_at')
          .eq('organization_id' as never, orgId)
          .eq('status' as never, 'waiting')
          .order('id' as never, { ascending: true })
          .range(from, to) as never,
      ),
    ),
    // PR-10 "Updated by owner on …": the applied self-updates for this
    // home (audit rows carry ids only). Board-readable by RLS.
    loadOrFail(
      'contact self-updates',
      db
        .from('audit_log')
        .select('created_at, metadata')
        .eq('org_id', orgId)
        .eq('action', AUDIT_APPLIED)
        .eq('metadata->>propertyId', propertyId)
        .order('created_at', { ascending: false })
        .limit(50),
    ),
  ])

  if (!propertyRes.ok) return { kind: 'failed' }
  if (!propertyRes.data) return { kind: 'not_found' }
  const property = propertyRes.data as unknown as PropertyRecord

  const unit: Part<UnitResolution> = unitRes.ok ? { ok: true, data: unitRes.data } : { ok: false }
  const unitIds: UnitId[] | null = unit.ok ? unit.data.unitIds : null
  const canonical: UnitId | null = unit.ok ? unit.data.unitId : null

  // ── Wave 2: by unit ─────────────────────────────────────────────────
  // A failed unit read fails every unit-keyed section; no unit at all
  // means there is nothing to read (null), which the page words as "not
  // linked" rather than "couldn't load".
  const failed = Promise.resolve({ ok: false } as const)
  const byUnit = <T>(run: (ids: UnitId[]) => Promise<Part<T>>): Promise<UnitPart<T>> =>
    !unit.ok ? failed : unitIds === null || unitIds.length === 0 ? Promise.resolve(null) : run(unitIds)

  const [openAssessments, ledger, payments, plans, collections, arc, threads, notices, tenancies, ownerships] = await Promise.all([
    byUnit(async (ids) =>
      part(
        await loadOrFail(
          'open charges',
          readAllResult<OpenAssessmentRow>((from, to) =>
            db
              .from('assessments')
              .select('id, due_date, amount, status, assessment_type, payments(amount)')
              .in('unit_id', ids)
              .is('deleted_at', null)
              .in('status', ['open', 'partial'])
              .order('id', { ascending: true })
              .range(from, to) as never,
          ),
        ),
      ),
    ),
    byUnit(async (ids): Promise<Part<{ rows: LedgerAssessmentRow[]; total: number | null }>> => {
      const r = await loadOrFail(
        'ledger',
        db
          .from('assessments')
          .select('id, due_date, amount, status, assessment_type', { count: 'exact' })
          .in('unit_id', ids)
          .is('deleted_at', null)
          .order('due_date', { ascending: false })
          .limit(LATEST.ledger),
      )
      return r.ok ? { ok: true as const, data: { rows: (r.data ?? []) as unknown as LedgerAssessmentRow[], total: r.count } } : { ok: false as const }
    }),
    byUnit(async (ids) =>
      mapPart(
        await loadOrFail(
          'payments',
          db
            .from('payments')
            .select('id, amount, paid_at, payment_method')
            .in('unit_id', ids)
            .order('paid_at', { ascending: false })
            .limit(LATEST.payments),
        ),
        (rows) => (rows ?? []) as unknown as PaymentRow[],
      ),
    ),
    byUnit(async (ids) =>
      mapPart(
        await loadOrFail(
          'payment plans',
          db
            .from('payment_plans')
            .select('id, unit_id, status, installment_amount, installment_count, total_amount, start_date, created_at')
            .in('unit_id', ids)
            .order('created_at', { ascending: false })
            .limit(LATEST.plans),
        ),
        (rows) => (rows ?? []) as unknown as PaymentPlanRow[],
      ),
    ),
    // Cases with their events embedded: one query, where the old
    // collections tab read the cases and then the open case's events.
    byUnit(async (ids) =>
      mapPart(
        await loadOrFail(
          'collections',
          readAllResult<Record<string, unknown>>((from, to) =>
            db
              .from('collection_cases')
              .select(`${CASE_COLUMNS}, collection_events(${EVENT_COLUMNS})`)
              .in('unit_id', ids)
              .is('deleted_at', null)
              .order('id', { ascending: true })
              .range(from, to) as never,
          ),
        ),
        (rows) => {
          const cases = (rows ?? []).map((r) => ({ c: toCase(r), events: ((r.collection_events as Record<string, unknown>[] | null) ?? []).map(toEvent) }))
          cases.sort((a, b) => b.c.openedOn.localeCompare(a.c.openedOn))
          const open = cases.find((x) => x.c.status !== 'resolved' && x.c.status !== 'written_off') ?? null
          return {
            openCase: open?.c ?? null,
            events: open ? sortEventsNewestFirst(open.events) : [],
            closed: cases.filter((x) => x !== open).map((x) => x.c),
          } satisfies CollectionsFile
        },
      ),
    ),
    byUnit(async (ids) =>
      part(
        await loadOrFail(
          'ARC requests',
          readAllResult<ArcRow>((from, to) =>
            db
              .from('arc_requests')
              .select('id, summary, category, status, submitted_at, board_response_at')
              .in('unit_id', ids)
              .is('deleted_at', null)
              .order('id', { ascending: true })
              .range(from, to) as never,
          ),
        ),
      ),
    ),
    // The inbox's own read (same Gmail-filing visibility as the inbox).
    canonical === null && unit.ok
      ? Promise.resolve(null)
      : !unit.ok
        ? failed
        : tryLoad('property mail', () => listThreadsForUnit(db as never, orgId, canonical!)).then((r) => (r.ok ? { ok: true as const, data: r.data } : { ok: false as const })),
    byUnit(async (ids) =>
      mapPart(
        await loadOrFail(
          'notices sent',
          db
            .from('communication_recipients')
            .select('id, communication_id, channel, delivery_status, queued_at, sent_at, rendered_subject, communications(subject, category)')
            .in('unit_id', ids)
            .order('queued_at', { ascending: false })
            .limit(LATEST.notices),
        ),
        (rows) =>
          ((rows ?? []) as unknown as Array<{
            id: string
            communication_id: string
            channel: string
            delivery_status: string
            queued_at: string
            sent_at: string | null
            rendered_subject: string | null
            communications: { subject: string; category: string | null } | null
          }>).map(
            (r): NoticeRow => ({
              id: r.id,
              communicationId: r.communication_id,
              subject: r.rendered_subject || r.communications?.subject || '(no subject)',
              category: r.communications?.category ?? null,
              channel: r.channel,
              deliveryStatus: r.delivery_status,
              at: r.sent_at ?? r.queued_at,
            }),
          ),
      ),
    ),
    byUnit(async (ids) =>
      mapPart(
        await loadOrFail(
          'leases',
          db
            .from('tenancies')
            .select('id, tenant_name, tenant_email, tenant_phone, tenant_user_id, lease_start, lease_end, status')
            .in('unit_id', ids)
            .order('lease_start', { ascending: false })
            .limit(LATEST.tenancies),
        ),
        (rows) => (rows ?? []) as unknown as TenancyRow[],
      ),
    ),
    byUnit(async (ids) =>
      mapPart(
        await loadOrFail(
          'ownerships',
          db
            .from('ownerships')
            .select('id, owner_name, owner_email, owner_phone, owner_user_id, ownership_pct, valid_from, valid_to')
            .in('unit_id', ids)
            .order('valid_from', { ascending: false })
            .limit(LATEST.ownerships),
        ),
        (rows) => (rows ?? []) as unknown as OwnershipRow[],
      ),
    ),
  ])

  const statsRow = statsRes.ok ? (statsRes.data as Record<string, unknown> | null) : null
  return {
    kind: 'ok',
    data: {
      property,
      unit,
      residents: part(residentsRes as LoadResult<PropertyResidentRow[]>),
      events: mapPart(eventsRes, (rows) => (rows ?? []) as unknown as PropertyEventRow[]),
      stats: statsRes.ok
        ? {
            ok: true,
            data: statsRow
              ? {
                  balance: Number(statsRow.balance ?? 0),
                  daysOverdue: Number(statsRow.days_overdue ?? 0),
                  openViolations: Number(statsRow.open_violations ?? 0),
                  violationsPastCure: Number(statsRow.violations_past_cure ?? 0),
                  threadsNeedingReply: Number(statsRow.threads_needing_reply ?? 0),
                }
              : null,
          }
        : { ok: false },
      violations: part(violationsRes as LoadResult<ViolationRow[]>),
      waitingQueue: part(queueRes as LoadResult<{ id: string; property_id: string; requested_at: string }[]>),
      openAssessments,
      ledger,
      payments,
      plans,
      collections,
      arc,
      threads,
      notices,
      tenancies,
      ownerships,
      selfUpdates: mapPart(selfRes, (rows) => selfUpdateDates((rows ?? []) as Array<{ created_at: string | null; metadata: unknown }>)),
    },
  }
}
