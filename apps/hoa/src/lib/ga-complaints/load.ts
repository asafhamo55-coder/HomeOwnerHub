/**
 * BL-161: the Secretary of State complaint record for one home (or the
 * few units a home bridges to), verified on the server, for the state law
 * check (fines, collections letters) and the collections-case panel.
 * Server-only: verifying the signed record needs the server secret.
 *
 * A failed read is `{ ok: false }`: callers refuse the step rather than
 * skip the check. Ids and error codes only in logs.
 */

import { complaintStayOn, gaComplaintStayBlocks, stayGateFor, type GaComplaint, type GaComplaintStayGate, type StayOnDay } from './model'
import { gaComplaintsSecret, readGaComplaints } from './store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

interface UnitRow {
  id: string
  association_id: string | null
}
interface AssocRow {
  id: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

const stateOf = (a: AssocRow) => (a.governing_law_state || a.state || '').trim().toUpperCase()

type Reads =
  | { ok: true; units: UnitRow[]; gaAssocs: AssocRow[] }
  | { ok: false }

async function read(db: LooseDb, orgId: string, unitIds: readonly string[]): Promise<Reads> {
  const ids = [...new Set(unitIds)]
  if (ids.length === 0) return { ok: true, units: [], gaAssocs: [] }
  const u = (await db.from('units').select('id, association_id').eq('organization_id', orgId).in('id', ids)) as {
    data: UnitRow[] | null
    error: { code?: string } | null
  }
  if (u.error) {
    console.error('[ga-complaints] unit read failed', { orgId, code: u.error.code ?? null })
    return { ok: false }
  }
  const units = u.data ?? []
  const assocIds = [...new Set(units.map((r) => r.association_id).filter((x): x is string => typeof x === 'string'))]
  if (assocIds.length === 0) return { ok: true, units, gaAssocs: [] }
  const a = (await db
    .from('associations')
    .select('id, state, governing_law_state, compliance_settings')
    .eq('organization_id', orgId)
    .in('id', assocIds)) as { data: AssocRow[] | null; error: { code?: string } | null }
  if (a.error) {
    console.error('[ga-complaints] association read failed', { orgId, code: a.error.code ?? null })
    return { ok: false }
  }
  return { ok: true, units, gaAssocs: (a.data ?? []).filter((r) => stateOf(r) === 'GA') }
}

export type GaComplaintGateLoad = { ok: true; gate: GaComplaintStayGate | undefined } | { ok: false }

/**
 * The stay gate for these units, combined across their Georgia
 * associations; undefined when none of them is in Georgia (nothing is
 * checked). An unverified record anywhere makes the whole gate unverified.
 */
export async function loadGaComplaintGate(
  db: LooseDb,
  orgId: string,
  unitIds: readonly string[],
  secret: string | null = gaComplaintsSecret(),
): Promise<GaComplaintGateLoad> {
  const r = await read(db, orgId, unitIds)
  if (!r.ok) return { ok: false }
  if (r.gaAssocs.length === 0) return { ok: true, gate: undefined }
  let verified = true
  const complaints: GaComplaintStayGate['complaints'][number][] = []
  for (const a of r.gaAssocs) {
    const own = r.units.filter((u) => u.association_id === a.id).map((u) => u.id)
    const g = stayGateFor(readGaComplaints(a.id, a.compliance_settings, secret), own)
    if (!g.verified) verified = false
    complaints.push(...g.complaints)
  }
  return { ok: true, gate: verified ? { verified, complaints } : { verified: false, complaints: [] } }
}

/** What the collections-case panel shows for one unit. */
export interface GaComplaintView {
  unitId: string
  today: string
  /** false: something is stored that HomeownerHub didn't sign; the board records the complaints again. */
  verified: boolean
  complaints: GaComplaint[]
  stay: StayOnDay
  /** From Jan 1, 2027 the stay blocks; before, it warns. */
  live: boolean
}

/** null when the unit isn't in the org or its association isn't in Georgia. Throws on a failed read. */
export async function loadGaComplaintView(
  db: LooseDb,
  orgId: string,
  unitId: string,
  today: string,
  secret: string | null = gaComplaintsSecret(),
): Promise<GaComplaintView | null> {
  const r = await read(db, orgId, [unitId])
  if (!r.ok) throw new Error('ga complaints: read failed')
  const unit = r.units.find((u) => u.id === unitId)
  const assoc = unit ? r.gaAssocs.find((a) => a.id === unit.association_id) : undefined
  if (!unit || !assoc) return null
  const rec = readGaComplaints(assoc.id, assoc.compliance_settings, secret)
  const complaints = rec.state === 'saved' ? (rec.record.units[unitId] ?? []) : []
  const gate = stayGateFor(rec, [unitId])
  return { unitId, today, verified: gate.verified, complaints, stay: complaintStayOn(gate, today), live: gaComplaintStayBlocks(today) }
}
