/**
 * BL-143, the board's side: the /approvals section for join requests, and
 * the decision (migration 0069 part 3; M5_APPLIED).
 *
 * Every read and the decision use the board member's OWN client: the
 * requests are board/admin-readable by RLS, and owner_join_decide() raises
 * 42501 unless the caller is board/admin of the request's org. No service
 * role anywhere.
 *
 * Flag off: nothing touches the database — the section is empty and the
 * decision refuses. Relative imports only (tests/integration loads this).
 * Ids and error codes only in logs.
 */

import {
  JOIN_CODES_TABLE,
  JOIN_REQUESTS_TABLE,
  JOIN_REQUEST_COLUMNS,
  JOIN_NOT_LIVE,
  homeLabel,
  joinCard,
  readDecideOutcome,
  type JoinCard,
  type JoinOwnershipRow,
  type JoinRequestRow,
  type JoinUnitRow,
} from './model'

// The M5 tables and functions are not in the generated types until
// gen:types runs after prod has 0069 (CLAUDE.md footgun 3).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type JoinDb = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => any
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type DbError = { code?: string } | null

export interface PendingJoin {
  row: JoinRequestRow
  card: JoinCard
}

export type JoinSectionLoad = { ok: true; items: PendingJoin[]; total: number } | { ok: false }

/** Pending requests for the org, oldest first, with each home and its owners on file. */
export async function loadPendingJoins(db: JoinDb, orgId: string, limit: number, live: boolean): Promise<JoinSectionLoad> {
  if (!live) return { ok: true, items: [], total: 0 }
  const res = (await db
    .from(JOIN_REQUESTS_TABLE)
    .select(JOIN_REQUEST_COLUMNS, { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .range(0, limit - 1)) as { data: JoinRequestRow[] | null; error: DbError; count: number | null }
  if (res.error) {
    console.error('[owner-join] requests read failed', { orgId, code: res.error.code ?? null })
    return { ok: false }
  }
  const rows = res.data ?? []
  const total = res.count ?? rows.length
  if (rows.length === 0) return { ok: true, items: [], total }

  const unitIds = [...new Set(rows.map((r) => r.unit_id))]
  const [units, owners] = (await Promise.all([
    db.from('units').select('id, address_line1, unit_number, city').eq('organization_id', orgId).in('id', unitIds),
    db
      .from('ownerships')
      .select('unit_id, owner_email, owner_user_id')
      .eq('organization_id', orgId)
      .in('unit_id', unitIds)
      .is('valid_to', null),
  ])) as Array<{ data: unknown[] | null; error: DbError }>
  if (units!.error || owners!.error) {
    console.error('[owner-join] homes read failed', { orgId, code: (units!.error ?? owners!.error)?.code ?? null })
    return { ok: false }
  }
  const byUnit = new Map(((units!.data ?? []) as JoinUnitRow[]).map((u) => [u.id, u]))
  const ownerRows = (owners!.data ?? []) as JoinOwnershipRow[]
  return {
    ok: true,
    total,
    items: rows.map((row) => ({ row, card: joinCard(row, byUnit.get(row.unit_id), ownerRows) })),
  }
}

/** Head-only count for the sidebar badge. 0 with the flag off; null when it failed. */
export async function countPendingJoins(db: JoinDb, orgId: string, live: boolean): Promise<number | null> {
  if (!live) return 0
  const { count, error } = (await db
    .from(JOIN_REQUESTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'pending')) as { count: number | null; error: DbError }
  if (error) {
    console.error('[owner-join] count failed', { orgId, code: error.code ?? null })
    return null
  }
  return count ?? 0
}

export type JoinDecision = { ok: true; message: string } | { ok: false; error: string }

/**
 * Approve or reject through owner_join_decide on the board member's own
 * client. A reject needs a reason (the database refuses without one too).
 */
export async function decideJoinRequest(
  db: JoinDb,
  input: { requestId: string; approve: boolean; reason?: string },
  live: boolean,
): Promise<JoinDecision> {
  if (!live) return { ok: false, error: JOIN_NOT_LIVE }
  const reason = (input.reason ?? '').trim()
  if (!input.approve && !reason) return { ok: false, error: 'A reason is required to reject.' }
  const { data, error } = (await db.rpc('owner_join_decide', {
    p_request_id: input.requestId,
    p_approve: input.approve,
    p_note: input.approve ? null : reason.slice(0, 1000),
  })) as { data: unknown; error: DbError }
  if (error) {
    console.error('[owner-join] decide failed', { requestId: input.requestId, code: error.code ?? null })
    if (error.code === '42501') return { ok: false, error: 'That request isn’t one you can decide.' }
    if (error.code === '23503') return { ok: false, error: 'That home is no longer on file. Reject the request instead.' }
    return { ok: false, error: 'We couldn’t record the decision. Try again.' }
  }
  const outcome = readDecideOutcome(data)
  if (outcome === 'already_decided') return { ok: true, message: 'Someone already decided this request.' }
  if (outcome === 'rejected') return { ok: true, message: 'Request rejected. Their account was not linked to the home.' }
  if (outcome === 'approved') {
    return {
      ok: true,
      message: 'Approved. They’re now a resident of your HOA and their home is linked; their portal shows it the next time they open it.',
    }
  }
  console.error('[owner-join] decide: unexpected answer', { requestId: input.requestId })
  return { ok: false, error: 'We couldn’t record the decision. Try again.' }
}

// ─── board-issued codes ──────────────────────────────────────────────

export interface JoinHome {
  id: string
  label: string
}

/** The org's homes to pick from, by address (first 1,000). [] with the flag off; null on a failed read. */
export async function loadJoinHomes(db: JoinDb, orgId: string, live: boolean): Promise<JoinHome[] | null> {
  if (!live) return []
  const { data, error } = (await db
    .from('units')
    .select('id, address_line1, unit_number, city')
    .eq('organization_id', orgId)
    .order('address_line1', { ascending: true })
    .range(0, 999)) as { data: JoinUnitRow[] | null; error: DbError }
  if (error) {
    console.error('[owner-join] homes list failed', { orgId, code: error.code ?? null })
    return null
  }
  return (data ?? []).flatMap((u) => {
    const label = homeLabel(u)
    return label ? [{ id: u.id, label }] : []
  })
}

export interface LiveJoinCode {
  id: string
  unitId: string
  home: string | null
  expiresAt: string
  createdAt: string
}

/** Codes still usable (not used, not revoked, not expired), newest first. [] with the flag off; null on a failed read. */
export async function loadLiveJoinCodes(db: JoinDb, orgId: string, nowIso: string, live: boolean): Promise<LiveJoinCode[] | null> {
  if (!live) return []
  const res = (await db
    .from(JOIN_CODES_TABLE)
    .select('id, unit_id, expires_at, created_at')
    .eq('organization_id', orgId)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .range(0, 99)) as {
    data: Array<{ id: string; unit_id: string; expires_at: string; created_at: string }> | null
    error: DbError
  }
  if (res.error) {
    console.error('[owner-join] codes read failed', { orgId, code: res.error.code ?? null })
    return null
  }
  const rows = res.data ?? []
  if (rows.length === 0) return []
  const units = (await db
    .from('units')
    .select('id, address_line1, unit_number, city')
    .eq('organization_id', orgId)
    .in('id', [...new Set(rows.map((r) => r.unit_id))])) as { data: JoinUnitRow[] | null; error: DbError }
  const byUnit = new Map((units.error ? [] : (units.data ?? [])).map((u) => [u.id, u]))
  return rows.map((r) => ({
    id: r.id,
    unitId: r.unit_id,
    home: homeLabel(byUnit.get(r.unit_id)),
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }))
}
