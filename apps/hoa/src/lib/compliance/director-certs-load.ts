// BL-139 — the reads behind the FL director certification tracker, for the
// pages (Members, Board handover, the dashboard). The caller has already
// checked the viewer is board or admin of `orgId`; every query here is
// still scoped to that org explicitly.
//
// Two clients, like lib/handover/load.ts: the viewer's RLS client for
// associations, and the service role ONLY for org_members + profiles
// (profiles RLS hides other members' names from the board's client).
// Names are the board members' own, which the board already sees on
// Members. Nothing here is logged except through loadOrFail (code only).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { loadOrFail } from '../load-or-fail'
import { complianceAckSecret } from './deadlines'
import {
  directorCertAssociation,
  directorCertRows,
  readDirectorCerts,
  type DirectorCertMember,
  type DirectorCertRow,
} from './director-certs'

type Db = SupabaseClient<Database>

export type DirectorCertBoard =
  /** No Florida association: nothing is shown anywhere. */
  | { kind: 'not_applicable' }
  | { kind: 'failed' }
  | { kind: 'ok'; associationId: string; associationName: string; rows: DirectorCertRow[] }

/** Current board and admin members (user id + own name), admins first, then by name. */
export async function loadBoardMembers(admin: Db, orgId: string): Promise<DirectorCertMember[] | null> {
  const res = await loadOrFail(
    'director certs: members',
    admin.from('org_members').select('user_id, role, profile:profiles(full_name)').eq('org_id', orgId).in('role', ['admin', 'board']),
  )
  if (!res.ok) return null
  const rows = (res.data ?? []) as unknown as Array<{
    user_id: string
    role: string
    profile: { full_name: string | null } | null
  }>
  return rows
    .filter((r) => r.role === 'admin' || r.role === 'board')
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
      const an = a.profile?.full_name?.trim() ?? ''
      const bn = b.profile?.full_name?.trim() ?? ''
      return an.localeCompare(bn) || a.user_id.localeCompare(b.user_id)
    })
    .map((r) => ({ userId: r.user_id, name: r.profile?.full_name?.trim() || null }))
}

export async function loadDirectorCertBoard(deps: {
  db: Db
  admin: Db
  orgId: string
  todayYmd: string
  /** Defaults to the real signing secret; tests pass their own. */
  secret?: string | null
}): Promise<DirectorCertBoard> {
  const assoc = await loadOrFail(
    'director certs: associations',
    deps.db
      .from('associations')
      .select('id, name, state, governing_law_state, compliance_settings')
      .eq('organization_id', deps.orgId),
  )
  if (!assoc.ok) return { kind: 'failed' }
  const picked = directorCertAssociation(
    ((assoc.data ?? []) as Array<{
      id: string
      name: string
      state: string | null
      governing_law_state: string | null
      compliance_settings: unknown
    }>).map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      governingLawState: r.governing_law_state,
      complianceSettings: r.compliance_settings,
    })),
  )
  if (!picked) return { kind: 'not_applicable' }
  const members = await loadBoardMembers(deps.admin, deps.orgId)
  if (!members) return { kind: 'failed' }
  const secret = deps.secret !== undefined ? deps.secret : complianceAckSecret()
  const certs = readDirectorCerts(picked.id, picked.complianceSettings, secret)
  return {
    kind: 'ok',
    associationId: picked.id,
    associationName: picked.name,
    rows: directorCertRows(members, certs, deps.todayYmd),
  }
}
