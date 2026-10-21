/**
 * BL-133 reads of violation_hearings (migration 0068, M4_APPLIED).
 *
 * Flag off: every function returns its "off" value WITHOUT touching the
 * database (the table may not exist yet). Not a server action (no
 * 'use server'): pages and the fine-check gate call these with the client
 * they already hold.
 *
 *   loadBoardHearing    — the board's own client (board RLS).
 *   loadResidentHearing — the SERVICE ROLE, called only after the caller
 *                         has confirmed the violation is on the resident's
 *                         own home (violation-response.ts loadOwnViolation);
 *                         scoped to that org and violation, limited columns.
 *
 * The table is not in the generated Database types until gen:types runs
 * after prod has 0068 (CLAUDE.md footgun 3), hence the loose client.
 * Logs carry codes only.
 */

import { M4_APPLIED } from '@homeowner-portal/db/m4'
import {
  HEARING_COLUMNS,
  HEARING_TABLE,
  RESIDENT_HEARING_COLUMNS,
  hearingFromRow,
  residentHearingView,
  type HearingRecord,
  type ResidentHearingView,
} from './rules'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (table: string) => any }

export type BoardHearingLoad =
  | { kind: 'off' }
  | { kind: 'failed' }
  | { kind: 'ok'; hearing: HearingRecord | null }

export async function loadBoardHearing(
  db: LooseDb,
  orgId: string,
  violationId: string,
  live: boolean = M4_APPLIED,
): Promise<BoardHearingLoad> {
  if (!live) return { kind: 'off' }
  const { data, error } = (await db
    .from(HEARING_TABLE)
    .select(HEARING_COLUMNS)
    .eq('organization_id', orgId)
    .eq('violation_id', violationId)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null }
  if (error) {
    console.error('[violation-hearings] board read failed', { code: error.code ?? null })
    return { kind: 'failed' }
  }
  return { kind: 'ok', hearing: data ? hearingFromRow(data) : null }
}

export type ResidentHearingLoad =
  | { kind: 'off' }
  | { kind: 'failed' }
  | { kind: 'ok'; hearing: ResidentHearingView | null }

export async function loadResidentHearing(
  admin: LooseDb,
  orgId: string,
  violationId: string,
  live: boolean = M4_APPLIED,
): Promise<ResidentHearingLoad> {
  if (!live) return { kind: 'off' }
  const { data, error } = (await admin
    .from(HEARING_TABLE)
    .select(RESIDENT_HEARING_COLUMNS)
    .eq('organization_id', orgId)
    .eq('violation_id', violationId)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null }
  if (error) {
    console.error('[violation-hearings] resident read failed', { code: error.code ?? null })
    return { kind: 'failed' }
  }
  return { kind: 'ok', hearing: residentHearingView(data) }
}

// ─── BL-140: the board roster for the panel conflict check ───────────

/** org_members roles that are on the board roster. */
export const ROSTER_ROLES = ['board', 'admin'] as const

export type BoardRosterLoad = { kind: 'failed' } | { kind: 'ok'; names: string[] }

/**
 * The full names of the org's board members and admins (org_members, not
 * the panel's self-tagged roles). Call with the SERVICE ROLE, only after
 * the caller has passed the board/admin gate for this org: profiles RLS
 * lets a user read only their own row (see members.ts). Names stay in
 * memory for the comparison; logs carry codes only.
 */
export async function loadBoardRosterNames(admin: LooseDb, orgId: string): Promise<BoardRosterLoad> {
  const { data: members, error } = (await admin
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('role', [...ROSTER_ROLES])) as { data: Array<{ user_id: string }> | null; error: { code?: string } | null }
  if (error) {
    console.error('[violation-hearings] roster read failed', { stage: 'members', code: error.code ?? null })
    return { kind: 'failed' }
  }
  const ids = [...new Set((members ?? []).map((m) => m.user_id).filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return { kind: 'ok', names: [] }
  const { data: profiles, error: pErr } = (await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', ids)) as { data: Array<{ full_name: string | null }> | null; error: { code?: string } | null }
  if (pErr) {
    console.error('[violation-hearings] roster read failed', { stage: 'profiles', code: pErr.code ?? null })
    return { kind: 'failed' }
  }
  return {
    kind: 'ok',
    names: (profiles ?? []).map((p) => (typeof p.full_name === 'string' ? p.full_name.trim() : '')).filter(Boolean),
  }
}
