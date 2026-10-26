import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { installmentsByPlan, loadInstallments } from '@homeowner-portal/workflows/payment-plans'
import { loadLedgerRows } from '@/lib/resident-ledger'
import { readAll } from '@/lib/supabase/read-all'
import { todayIn } from '@/lib/association-time'
import type { CollectionStatus } from '@/lib/collections/statuses'
import { readRosterAssociations } from '../statutory-roster/load'
import { resolveUnitForProperty, type PropertyId } from '../resolve'
import type { EstoppelInput } from './model'

/**
 * Everything one home's estoppel certificate needs (BL-087), read with
 * the caller's cookie-bound client so RLS applies on top of the board
 * gate. Throws on any failed read — a certificate the association is
 * bound by (§ 720.30851(3)) must never be built from a partial ledger —
 * and `null` when the home isn't in the org.
 *
 * Every list goes through readAll (past the 1000-row cap); the ledger
 * reuses lib/resident-ledger's read, and a truncated ledger is refused.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>

const fail = (what: string) => (e: { code?: string }) => new Error(`estoppel: ${what} read failed (${e.code ?? 'no code'})`)

function readList<T>(db: Loose, table: string, columns: string, build: (q: any) => any): Promise<T[]> {
  return readAll<T>((from, to) => build(db.from(table).select(columns)).order('id', { ascending: true }).range(from, to) as PageResult<T>, fail(table))
}

interface PropRow { id: string; address: string | null; unit_number: string | null; owner_name: string | null }
interface UnitRow { id: string; association_id: string | null; lot_number: string | null }
interface ViolationRow { id: string; description: string | null; status: string; notice_sent_at: string | null; resolved_at: string | null }
interface PlanRow { id: string; unit_id: string; status: string; installment_amount: number; installment_count: number; total_amount: number; start_date: string }
interface CaseRow { id: string; status: string; attorney_firm: string | null; opened_on: string }
interface OwnRow { id: string; owner_name: string | null; valid_from: string; valid_to: string | null }

export interface EstoppelContext {
  input: EstoppelInput
  timeZone: string
  /** The association's today: the certificate's issue day. */
  today: string
  /** The home's association (the unit's, else the org's first); BL-149 reads its registration. */
  associationId?: string | null
}

export async function loadEstoppelInput(
  supabase: SupabaseClient,
  orgId: string,
  propertyId: PropertyId,
): Promise<EstoppelContext | null> {
  const db = supabase as unknown as Loose
  const [propRes, unitRes, assoc, violations] = await Promise.all([
    db.from('hoa_properties').select('id, address, unit_number, owner_name').eq('id', propertyId).eq('org_id', orgId).is('deleted_at', null).maybeSingle() as Promise<{
      data: PropRow | null
      error: { code?: string } | null
    }>,
    resolveUnitForProperty(supabase as never, orgId, propertyId),
    readRosterAssociations(supabase, orgId),
    readList<ViolationRow>(db, 'hoa_violations', 'id, description, status, notice_sent_at, resolved_at', (q) =>
      q.eq('org_id', orgId).eq('property_id', propertyId).is('deleted_at', null),
    ),
  ])
  if (propRes.error) throw fail('property')(propRes.error)
  const prop = propRes.data
  if (!prop) return null

  const today = todayIn(assoc.timeZone)
  const unitIds = unitRes.unitIds as string[]
  const has = unitIds.length > 0
  const [unitRows, ledger, plans, cases, ownerships] = await Promise.all([
    unitRes.unitId
      ? readList<UnitRow>(db, 'units', 'id, association_id, lot_number', (q) => q.eq('organization_id', orgId).eq('id', unitRes.unitId))
      : Promise.resolve([] as UnitRow[]),
    loadLedgerRows(supabase as unknown as SupabaseClient<Database>, unitIds),
    has
      ? readList<PlanRow>(db, 'payment_plans', 'id, unit_id, status, installment_amount, installment_count, total_amount, start_date', (q) =>
          q.eq('organization_id', orgId).in('unit_id', unitIds),
        )
      : Promise.resolve([] as PlanRow[]),
    has
      ? readList<CaseRow>(db, 'collection_cases', 'id, status, attorney_firm, opened_on', (q) =>
          q.eq('organization_id', orgId).in('unit_id', unitIds).is('deleted_at', null),
        )
      : Promise.resolve([] as CaseRow[]),
    unitRes.unitId
      ? readList<OwnRow>(db, 'ownerships', 'id, owner_name, valid_from, valid_to', (q) => q.eq('organization_id', orgId).eq('unit_id', unitRes.unitId))
      : Promise.resolve([] as OwnRow[]),
  ])
  if (!ledger.ok) throw new Error('estoppel: ledger read failed')
  if (ledger.truncated) throw new Error('estoppel: ledger has more rows than one read returns; refusing a partial certificate')

  const unit = unitRows[0] ?? null
  const unitAssoc = unit?.association_id ? assoc.rows.find((a) => a.id === unit.association_id) : undefined
  const a = unitAssoc ?? assoc.primary
  const state = (a?.governing_law_state ?? a?.state ?? '').trim().toUpperCase() || null

  // Which charges are plan installments: the stored link (each
  // installment's journal entry memo names its plan, BL-080), never a
  // schedule rebuilt from the start date. Throws on a failed read.
  const installmentAssoc = unit?.association_id ?? a?.id ?? null
  const planInstallmentIds =
    plans.length > 0 && installmentAssoc
      ? [
          ...installmentsByPlan(
            plans.map((p) => ({ id: p.id, unitId: p.unit_id, installmentCount: Number(p.installment_count), status: p.status })),
            await loadInstallments(db, installmentAssoc, plans),
          ).values(),
        ].flatMap((list) => list.map((i) => i.assessmentId))
      : []

  const currentOwners = ownerships
    .filter((o) => o.valid_from <= today && (o.valid_to === null || o.valid_to > today))
    .map((o) => o.owner_name?.trim() ?? '')
    .filter(Boolean)
  const owners = currentOwners.length > 0 ? currentOwners : prop.owner_name?.trim() ? [prop.owner_name.trim()] : []

  // The live case: the newest one that isn't closed.
  const live = [...cases].sort((x, y) => y.opened_on.localeCompare(x.opened_on)).find((c) => c.status !== 'resolved' && c.status !== 'written_off') ?? null

  return {
    timeZone: assoc.timeZone,
    today,
    associationId: a?.id ?? null,
    input: {
      state,
      associationName: a?.name ?? null,
      // BL-155: a Georgia condominium gets § 44-3-109(d), not § 44-3-232(d).
      associationType: a?.type ?? null,
      propertyId: prop.id,
      address: (prop.address ?? '').trim(),
      unitNumber: prop.unit_number?.trim() || null,
      unitId: unitRes.unitId,
      lotNumber: unit?.lot_number?.trim() || null,
      owners,
      charges: ledger.assessments,
      payments: ledger.payments,
      violations: violations.map((v) => ({
        id: v.id,
        description: (v.description ?? '').trim(),
        status: v.status,
        noticeSentAt: v.notice_sent_at,
        resolvedAt: v.resolved_at,
      })),
      plans: plans.map((p) => ({
        id: p.id,
        status: p.status,
        installmentAmount: Number(p.installment_amount),
        installmentCount: Number(p.installment_count),
        totalAmount: Number(p.total_amount),
        startDate: p.start_date,
      })),
      planInstallmentIds,
      collectionCase: live ? { id: live.id, status: live.status as CollectionStatus, attorneyFirm: live.attorney_firm } : null,
      timeZone: assoc.timeZone,
    },
  }
}
