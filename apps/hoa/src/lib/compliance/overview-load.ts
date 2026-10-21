/**
 * BL-145: loads everything ./obligations.ts needs, for the /compliance page,
 * the board packet and the monthly board report.
 *
 * `db` is the signed-in board member's RLS client (page, packet, report
 * preview) or the service role (the monthly report job, which has no
 * request). Either way EVERY read here filters by the org (and the
 * association, when one is given) explicitly. `admin` is the service role,
 * used only by the Florida director tracker for board members' own names
 * (lib/compliance/director-certs-load.ts); the caller has already checked
 * the viewer is board or admin.
 *
 * California's § 5300(a) status comes from the BL-138 adoption checklist,
 * whose loader is server-only, so the caller injects it (`caBudgets`); the
 * monthly report leaves it out and the row points at the checklist.
 *
 * A failed section never reads as "all clear": the obligation it feeds
 * shows "Couldn't load …". Ids and error codes only in logs.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { loadLatestMeetingNotice } from '../meetings/notice-record'
import { complianceAckSecret, complianceState, type ComplianceAssociationInput } from './deadlines'
import { loadDirectorCertBoard } from './director-certs-load'
import { attachedDocumentIds, loadComplianceDoneWithEvidence, loadEvidenceDocuments, type EvidenceDocument, type LooseDb } from './evidence'
import {
  buildComplianceOverview,
  type AnnualMeetings,
  type CaBudgetInput,
  type ComplianceOverview,
  type DirectorCertInput,
} from './obligations'

type Db = SupabaseClient<Database>

export interface ComplianceLoadDeps {
  db: LooseDb
  admin: LooseDb
  orgId: string
  /** The association's today, YYYY-MM-DD. */
  today: string
  /** Only this association (the monthly report). Default: every association in the org. */
  associationId?: string
  /** association id → § 5300(a) status, for the California associations given. */
  caBudgets?: (associations: ComplianceAssociationInput[]) => Promise<Map<string, CaBudgetInput>>
  /** Tests pass their own; defaults to the real signing secret. */
  secret?: string | null
  /** Load the evidence picker's document list (the page only). */
  withDocuments?: boolean
}

export type LoadedCompliance =
  | { ok: false }
  | {
      ok: true
      overview: ComplianceOverview
      /** The evidence picker's options; [] when evidence is off; null when the read failed. */
      documents: EvidenceDocument[] | null
    }

interface AssocRow {
  id: string
  name: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

/** The org's annual members' meetings: the last before today, the next from today, and its notice. */
export async function loadAnnualMeetings(db: LooseDb, orgId: string, today: string): Promise<AnnualMeetings | null> {
  const { data, error } = (await db
    .from('hoa_meeting_minutes')
    .select('id, meeting_date')
    .eq('org_id', orgId)
    .eq('meeting_type', 'annual')
    .is('deleted_at', null)
    .order('meeting_date', { ascending: false })
    .limit(20)) as { data: Array<{ id: string; meeting_date: string }> | null; error: { code?: string } | null }
  if (error) {
    console.error('[compliance] annual meetings read failed', { orgId, code: error.code ?? null })
    return null
  }
  const rows = (data ?? []).filter((r) => typeof r.meeting_date === 'string')
  const day = (r: { meeting_date: string }) => r.meeting_date.slice(0, 10)
  const lastHeld = rows.filter((r) => day(r) < today).map(day).sort().at(-1) ?? null
  const upcoming = rows.filter((r) => day(r) >= today).sort((a, b) => day(a).localeCompare(day(b)))[0]
  if (!upcoming) return { lastHeld, next: null, nextNoticeSentOn: null }
  const notice = await loadLatestMeetingNotice(db, { orgId, meetingId: upcoming.id })
  return {
    lastHeld,
    next: { id: upcoming.id, date: day(upcoming) },
    nextNoticeSentOn: notice === 'failed' ? 'failed' : notice ? notice.at.slice(0, 10) : null,
  }
}

export async function loadComplianceOverview(deps: ComplianceLoadDeps): Promise<LoadedCompliance> {
  let q = deps.db
    .from('associations')
    .select('id, name, state, governing_law_state, compliance_settings')
    .eq('organization_id', deps.orgId)
  if (deps.associationId) q = q.eq('id', deps.associationId)
  const res = (await q) as { data: AssocRow[] | null; error: { code?: string } | null }
  if (res.error) {
    console.error('[compliance] associations read failed', { orgId: deps.orgId, code: res.error.code ?? null })
    return { ok: false }
  }
  const associations: ComplianceAssociationInput[] = (res.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    governingLawState: r.governing_law_state,
    complianceSettings: r.compliance_settings,
  }))
  const states = new Set(associations.map((a) => complianceState(a.governingLawState, a.state)))
  const ca = associations.filter((a) => complianceState(a.governingLawState, a.state) === 'CA')

  const [done, annualMeetings, directorBoard, caBudgets] = await Promise.all([
    loadComplianceDoneWithEvidence(deps.db, deps.orgId, { associationId: deps.associationId }),
    states.has('GA') ? loadAnnualMeetings(deps.db, deps.orgId, deps.today) : Promise.resolve(null),
    states.has('FL')
      ? loadDirectorCertBoard({ db: deps.db as unknown as Db, admin: deps.admin as unknown as Db, orgId: deps.orgId, todayYmd: deps.today, secret: deps.secret })
      : Promise.resolve({ kind: 'not_applicable' as const }),
    ca.length > 0 && deps.caBudgets ? deps.caBudgets(ca) : Promise.resolve(new Map<string, CaBudgetInput>()),
  ])

  const directorCerts: DirectorCertInput =
    directorBoard.kind === 'ok' ? { kind: 'ok', associationId: directorBoard.associationId, rows: directorBoard.rows } : directorBoard

  const documents = deps.withDocuments ? await loadEvidenceDocuments(deps.db, deps.orgId, attachedDocumentIds(done)) : []
  const documentNames = new Map((documents ?? []).map((d) => [d.id, d.name]))

  const overview = buildComplianceOverview({
    today: deps.today,
    associations,
    secret: deps.secret !== undefined ? deps.secret : complianceAckSecret(),
    done,
    documentNames,
    annualMeetings,
    directorCerts,
    caBudgets,
  })
  return { ok: true, overview, documents }
}
