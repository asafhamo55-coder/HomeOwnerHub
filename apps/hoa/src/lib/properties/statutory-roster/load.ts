import type { SupabaseClient } from '@supabase/supabase-js'
import { associationTimeZone } from '@/lib/association-time'
import { readAll } from '@/lib/supabase/read-all'
import { unitIdsForProperties, unitPropertyIndex } from '../resolve'
import type { RosterCharge, RosterHome, RosterInput, RosterKind, RosterOwnership, RosterPayment, RosterResident } from './model'

/**
 * Reads everything the roster needs for one org, every row past the
 * 1000-row cap (readAll, stable `id` order). Throws on any failed page:
 * a roster missing homes is worse than no roster. The caller's
 * cookie-bound client is used, so RLS applies on top of the board gate.
 *
 * Charges and payments are only read for the voter list.
 */

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }

function readTable<T>(db: Loose, table: string, columns: string, orgColumn: string, orgId: string, extra?: (q: any) => any): Promise<T[]> {
  return readAll<T>(
    (from, to) => {
      let q = db.from(table).select(columns).eq(orgColumn, orgId)
      if (extra) q = extra(q)
      return q.order('id', { ascending: true }).range(from, to) as PageResult<T>
    },
    (e) => new Error(`statutory roster: ${table} read failed (${e.code ?? 'no code'})`),
  )
}

interface AssocRow { id: string; name: string | null; state: string | null; governing_law_state: string | null; type?: string | null }
interface PropRow { id: string; address: string | null; unit_number: string | null; owner_name: string | null; owner_email: string | null; owner_phone: string | null }
interface UnitRow { id: string; association_id: string | null; lot_number: string | null; notes: string | null }
interface OwnRow { id: string; unit_id: string; owner_name: string | null; owner_email: string | null; owner_phone: string | null; ownership_pct: number | null; valid_from: string; valid_to: string | null }
interface ResRow { id: string; property_id: string; role: string; notes: string | null; moved_out_at: string | null }
interface ChargeRow { id: string; unit_id: string; amount: number; due_date: string; status: string }
interface PayRow { id: string; assessment_id: string | null; unit_id: string | null; amount: number; paid_at: string }

export interface RosterContext {
  input: RosterInput
  associationName: string | null
  /** The primary association's state (first by name, as /dues picks it). */
  primaryState: string | null
  /** Every state among the homes, for the law notes. */
  states: string[]
}

const stateOf = (a: AssocRow | undefined) => (a?.governing_law_state ?? a?.state ?? '').trim().toUpperCase() || null

/** The org's association zone and name, for "today" before the full read. */
export async function readRosterAssociations(supabase: SupabaseClient, orgId: string): Promise<{ rows: AssocRow[]; primary: AssocRow | undefined; timeZone: string }> {
  const rows = await readTable<AssocRow>(supabase as unknown as Loose, 'associations', 'id, name, state, governing_law_state, type', 'organization_id', orgId)
  const primary = [...rows].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))[0]
  return { rows, primary, timeZone: associationTimeZone(primary ? { state: primary.state } : null) }
}

export type RosterAssociations = Awaited<ReturnType<typeof readRosterAssociations>>

export async function loadRosterInput(
  supabase: SupabaseClient,
  orgId: string,
  kind: RosterKind,
  asOf: string,
  /** Already read for the association's "today"; read here when absent. */
  preloaded?: RosterAssociations,
): Promise<RosterContext> {
  const db = supabase as unknown as Loose
  const assoc = preloaded ?? (await readRosterAssociations(supabase, orgId))
  const assocById = new Map(assoc.rows.map((a) => [a.id, a]))

  // Payments a day either side are read and the association-day cut is
  // made in the model (paid_at is a timestamp, the cut is a local day).
  const payCutoff = new Date(Date.parse(`${asOf}T00:00:00Z`) + 2 * 86_400_000).toISOString()
  const [props, units, bridge, ownerships, residents, charges, payments] = await Promise.all([
    readTable<PropRow>(db, 'hoa_properties', 'id, address, unit_number, owner_name, owner_email, owner_phone', 'org_id', orgId, (q) => q.is('deleted_at', null)),
    readTable<UnitRow>(db, 'units', 'id, association_id, lot_number, notes', 'organization_id', orgId),
    // Which units belong to which home: resolve.ts owns the bridge.
    unitPropertyIndex(supabase as never, orgId),
    readTable<OwnRow>(db, 'ownerships', 'id, unit_id, owner_name, owner_email, owner_phone, ownership_pct, valid_from, valid_to', 'organization_id', orgId),
    readTable<ResRow>(db, 'property_residents', 'id, property_id, role, notes, moved_out_at', 'organization_id', orgId, (q) => q.is('deleted_at', null)),
    kind === 'voters'
      ? readTable<ChargeRow>(db, 'assessments', 'id, unit_id, amount, due_date, status', 'organization_id', orgId, (q) => q.is('deleted_at', null).lt('due_date', asOf))
      : Promise.resolve([] as ChargeRow[]),
    kind === 'voters'
      ? readTable<PayRow>(db, 'payments', 'id, assessment_id, unit_id, amount, paid_at', 'organization_id', orgId, (q) => q.lt('paid_at', payCutoff))
      : Promise.resolve([] as PayRow[]),
  ])

  const unitById = new Map(units.map((u) => [u.id, u]))
  const unitsByProperty = new Map<string, string[]>()
  for (const [unitId, propertyId] of bridge) {
    const list = unitsByProperty.get(propertyId) ?? []
    list.push(unitId)
    unitsByProperty.set(propertyId, list)
  }
  // The canonical unit per home (earliest created), the one whose
  // ownerships count — the same rule as the property page.
  const canonical = await unitIdsForProperties(supabase as never, orgId, props.map((p) => p.id))

  const primaryState = stateOf(assoc.primary)
  const homes: RosterHome[] = props.map((p) => {
    const bridged = unitsByProperty.get(p.id) ?? []
    const canonicalId = canonical.get(p.id as never) ?? null
    const unit = canonicalId ? unitById.get(canonicalId) : undefined
    const state = stateOf(unit?.association_id ? assocById.get(unit.association_id) : undefined) ?? primaryState
    return {
      propertyId: p.id,
      address: (p.address ?? '').trim(),
      unitNumber: p.unit_number?.trim() || null,
      unitId: canonicalId,
      unitIds: bridged,
      lotNumber: unit?.lot_number?.trim() || null,
      unitNotes: unit?.notes ?? null,
      state,
      recordOwner: p.owner_name || p.owner_email || p.owner_phone ? { name: p.owner_name, email: p.owner_email, phone: p.owner_phone } : null,
    }
  })

  const input: RosterInput = {
    homes,
    ownerships: ownerships.map(
      (o): RosterOwnership => ({
        unitId: o.unit_id,
        ownerName: o.owner_name,
        ownerEmail: o.owner_email,
        ownerPhone: o.owner_phone,
        ownershipPct: o.ownership_pct == null ? null : Number(o.ownership_pct),
        validFrom: o.valid_from,
        validTo: o.valid_to,
      }),
    ),
    residents: residents.map((r): RosterResident => ({ propertyId: r.property_id, role: r.role, notes: r.notes, movedOutAt: r.moved_out_at })),
    charges: charges.map((c): RosterCharge => ({ id: c.id, unitId: c.unit_id, amount: Number(c.amount), dueDate: c.due_date, status: c.status })),
    payments: payments.map((p): RosterPayment => ({ assessmentId: p.assessment_id, unitId: p.unit_id, amount: Number(p.amount), paidAt: p.paid_at })),
    timeZone: assoc.timeZone,
  }
  const states = [...new Set(homes.map((h) => h.state).filter((s): s is string => !!s))].sort()
  return { input, associationName: assoc.primary?.name ?? null, primaryState, states }
}
