/**
 * BL-149: everything the Georgia registration kit page shows, read for a
 * board member the page has already gated (requireBoardOrAdmin). Every
 * read filters by the org explicitly. Board names come through
 * listBoardMembers (its own board gate; the service role, because
 * profiles RLS hides other members' names).
 *
 * A failed section never reads as "nothing there": it comes back null and
 * the page says it couldn't load. Ids and error codes only in logs.
 */

import { listBoardMembers } from '@/lib/communications/actions'
import { complianceState } from '@/lib/compliance/deadlines'
import { loadComplianceOverview } from '@/lib/compliance/overview-load'
import type { ComplianceObligation } from '@/lib/compliance/obligations'
import type { LooseDb } from '@/lib/compliance/evidence'
import { gaRegistrationStanding, type GaRegistrationRecord, type GaRegistrationStanding } from './model'
import { gaRegistrationSecret, readGaRegistration } from './store'

interface AssocRow {
  id: string
  name: string
  state: string | null
  governing_law_state: string | null
  total_units: number | null
  compliance_settings: unknown
}

export interface KitDocument {
  id: string
  name: string
  type: string
}

export interface KitData {
  association: { id: string; name: string; totalUnits: number | null }
  /** Other Georgia associations in the org, for the picker. */
  others: Array<{ id: string; name: string }>
  record: GaRegistrationRecord
  /** 'unverified': something is stored that the board's save didn't write. */
  recordState: 'saved' | 'none' | 'unverified'
  standing: GaRegistrationStanding
  /** Units on file for the association; null when the read failed. */
  unitCount: number | null
  /** Board and admin names; null when the read failed. */
  board: Array<{ name: string; role: 'board' | 'admin' }> | null
  /** Declaration, bylaws and rules in Documents; null when the read failed. */
  documents: KitDocument[] | null
  /** BL-151's amended-registration rows for this association; null when the read failed. */
  amendments: ComplianceObligation[] | null
}

export type KitLoad = { kind: 'ok'; data: KitData } | { kind: 'not_georgia' } | { kind: 'no_association' } | { kind: 'failed' }

/** hoa_documents.type values that are governing documents (0000's check). */
export const GOVERNING_DOC_TYPES = ['ccr', 'bylaws', 'rules'] as const

export async function loadRegistrationKit(deps: {
  db: LooseDb
  admin: LooseDb
  orgId: string
  today: string
  associationId?: string | null
}): Promise<KitLoad> {
  const res = (await deps.db
    .from('associations')
    .select('id, name, state, governing_law_state, total_units, compliance_settings')
    .eq('organization_id', deps.orgId)
    .order('name', { ascending: true })) as { data: AssocRow[] | null; error: { code?: string } | null }
  if (res.error) {
    console.error('[ga-registration] associations read failed', { orgId: deps.orgId, code: res.error.code ?? null })
    return { kind: 'failed' }
  }
  const all = res.data ?? []
  if (all.length === 0) return { kind: 'no_association' }
  const georgia = all.filter((a) => complianceState(a.governing_law_state, a.state) === 'GA')
  if (georgia.length === 0) return { kind: 'not_georgia' }
  const row = georgia.find((a) => a.id === deps.associationId) ?? georgia[0]!

  const secret = gaRegistrationSecret()
  const read = readGaRegistration(row.id, row.compliance_settings, secret)

  const [units, board, documents, overview] = await Promise.all([
    (deps.db
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', deps.orgId)
      .eq('association_id', row.id) as PromiseLike<{ count: number | null; error: { code?: string } | null }>).then(
      (r) => {
        if (r.error) console.error('[ga-registration] units count failed', { associationId: row.id, code: r.error.code ?? null })
        return r.error ? null : (r.count ?? 0)
      },
      () => null,
    ),
    listBoardMembers().then(
      (rows) => rows.map((m) => ({ name: m.fullName, role: m.role })).sort((a, b) => a.name.localeCompare(b.name)),
      () => null,
    ),
    (deps.db
      .from('hoa_documents')
      .select('id, name, type')
      .eq('org_id', deps.orgId)
      .in('type', [...GOVERNING_DOC_TYPES])
      .order('name', { ascending: true })
      .limit(200) as PromiseLike<{ data: KitDocument[] | null; error: { code?: string } | null }>).then(
      (r) => {
        if (r.error) console.error('[ga-registration] documents read failed', { orgId: deps.orgId, code: r.error.code ?? null })
        return r.error ? null : (r.data ?? [])
      },
      () => null,
    ),
    loadComplianceOverview({ db: deps.db, admin: deps.admin, orgId: deps.orgId, today: deps.today, associationId: row.id, secret }),
  ])

  const amendments = overview.ok
    ? overview.overview.groups.flatMap((g) => g.obligations.filter((o) => o.kind === 'registration_amendment'))
    : null

  return {
    kind: 'ok',
    data: {
      association: { id: row.id, name: row.name, totalUnits: row.total_units },
      others: georgia.filter((a) => a.id !== row.id).map((a) => ({ id: a.id, name: a.name })),
      record: read.record,
      recordState: read.state,
      standing: gaRegistrationStanding(read, deps.today),
      unitCount: units,
      board,
      documents,
      amendments,
    },
  }
}
