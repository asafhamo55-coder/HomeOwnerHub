/**
 * BL-165: read the disclosure state for one decision, and the gate the
 * decision actions call. Server-only (the signed record needs the secret).
 *
 * Callers pass an already-role-checked org id; `fetchBoard` is injected so
 * tests need no service role. A failed read is `{ ok: false }`: the gate
 * then refuses only once disclosure is required for Georgia (from
 * 2027-01-01), because before that nothing it protects is mandatory.
 * Ids and error codes only in logs.
 */

import { complianceState } from '@/lib/compliance/deadlines'
import { associationTimeZone, todayIn } from '@/lib/association-time'
import { gaOwnerRightsInForce } from '@/lib/owner-rights/law'
import { disclosureMode, type DisclosureMode } from './law'
import {
  BLOCKED_MESSAGE,
  disclosureBlocks,
  disclosureProgress,
  type DecisionKind,
  type Disclosure,
  type DisclosureProgress,
} from './model'
import { readConflictDisclosures } from './store'
import { paySettingsSecret } from '@/lib/pay-by-zelle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

export interface BoardSeat {
  userId: string
  fullName: string
}

export type FetchBoard = (orgId: string) => Promise<BoardSeat[]>

interface AssocRow {
  id: string
  name: string | null
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

export interface DisclosureStatusView {
  associationId: string
  mode: DisclosureMode
  today: string
  /** The voting board members, by name. */
  board: BoardSeat[]
  progress: DisclosureProgress
  /** False when the stored record failed its signature (entries then read as none). */
  verified: boolean
  blocks: boolean
}

export type DisclosureStatusLoad = { ok: true; status: DisclosureStatusView | null } | { ok: false }

export async function loadDisclosureStatus(
  db: LooseDb,
  orgId: string,
  kind: DecisionKind,
  decisionId: string,
  fetchBoard: FetchBoard,
  opts: { now?: Date; secret?: string | null } = {},
): Promise<DisclosureStatusLoad> {
  const secret = opts.secret === undefined ? paySettingsSecret() : opts.secret
  const res = (await db
    .from('associations')
    .select('id, name, state, governing_law_state, compliance_settings')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .range(0, 0)) as { data: AssocRow[] | null; error: { code?: string } | null }
  if (res.error) {
    console.error('[conflict-disclosure] association read failed', { orgId, code: res.error.code ?? null })
    return { ok: false }
  }
  const row = (res.data ?? [])[0]
  if (!row) return { ok: true, status: null }

  let board: BoardSeat[]
  try {
    board = await fetchBoard(orgId)
  } catch (err) {
    console.error('[conflict-disclosure] board read failed', { orgId, code: err instanceof Error ? err.name : 'error' })
    return { ok: false }
  }

  const zone = associationTimeZone({ state: row.state })
  const today = todayIn(zone, opts.now)
  const mode = disclosureMode(complianceState(row.governing_law_state, row.state), today)
  const read = readConflictDisclosures(row.id, row.compliance_settings, secret)
  const progress = disclosureProgress(
    read.record,
    kind,
    decisionId,
    board.map((b) => b.userId),
  )
  return {
    ok: true,
    status: {
      associationId: row.id,
      mode,
      today,
      board,
      progress,
      verified: read.state !== 'unverified',
      blocks: disclosureBlocks(mode, progress),
    },
  }
}

/**
 * The gate for a decision action: null to go ahead, else the error to show.
 * Blocks only for a Georgia association from 2027-01-01 with a board member
 * yet to disclose. A failed read blocks only from that date (any state).
 */
export async function conflictGate(
  db: LooseDb,
  orgId: string,
  kind: DecisionKind,
  decisionId: string,
  fetchBoard: FetchBoard,
  opts: { now?: Date; secret?: string | null } = {},
): Promise<string | null> {
  const load = await loadDisclosureStatus(db, orgId, kind, decisionId, fetchBoard, opts)
  if (!load.ok) {
    const today = (opts.now ?? new Date()).toISOString().slice(0, 10)
    return gaOwnerRightsInForce(today) ? 'We couldn’t check the conflict-of-interest disclosures. Try again.' : null
  }
  return load.status?.blocks ? BLOCKED_MESSAGE : null
}

/** What the decision record shows: who disclosed what, by name. */
export function disclosureEntriesView(status: DisclosureStatusView): Array<Disclosure & { name: string }> {
  const names = new Map(status.board.map((b) => [b.userId, b.fullName]))
  return status.progress.entries.map((e) => ({ ...e, name: names.get(e.memberId) ?? 'A board member' }))
}
