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
