'use server'

// BL-143 server actions (migration 0069 part 3; M5_APPLIED).
//
//   askToJoin       — any signed-in account. Calls owner_join_claim with
//                     the caller's OWN client: the database matches the
//                     home, rate-limits (5 a day) and records the request.
//                     Its answer for an address is the same whether or not
//                     a home matched, and so is ours.
//   issueJoinCode   — board/admin. A one-time code for one home; only its
//                     SHA-256 is stored (board RLS insert). The code is
//                     returned once, for the board to hand to the owner.
//   revokeJoinCode  — board/admin. Stops an unused code working.
//
// No service role: nothing here calls createAdminClient. Flag off: nothing
// is read or written. Logs carry ids and outcome codes only — never an
// address, a code or an email.

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { JoinDb } from './board'
import {
  CLAIM_MESSAGES,
  CLAIM_SENT,
  JOIN_CODES_TABLE,
  JOIN_CODE_DAYS,
  JOIN_CODE_LENGTH,
  JOIN_NOT_LIVE,
  formatJoinCode,
  normaliseCode,
  parseClaim,
  readClaimOutcome,
  type ClaimInput,
} from './model'

export type AskToJoinResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

type AuthedDb = JoinDb & { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } }

export async function askToJoin(input: ClaimInput): Promise<AskToJoinResult> {
  if (!M5_APPLIED) return { ok: false, error: JOIN_NOT_LIVE }
  const parsed = parseClaim(input)
  if (!parsed.ok) return { ok: false, error: 'Some fields need attention.', fieldErrors: parsed.fieldErrors }

  const db = (await getSupabaseServerClient()) as unknown as AuthedDb
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in first.' }

  const c = parsed.claim
  const { data, error } = (await db.rpc(
    'owner_join_claim',
    c.kind === 'code'
      ? { p_code: c.code }
      : { p_address: c.address, p_postal_code: c.postalCode, p_unit: c.unit || null },
  )) as { data: unknown; error: { code?: string } | null }
  if (error) {
    console.error('[owner-join] claim failed', { code: error.code ?? null })
    return { ok: false, error: 'We couldn’t send your request. Try again.' }
  }
  const outcome = readClaimOutcome(data)
  console.info('[owner-join] claim', { method: c.kind, outcome })
  if (outcome === 'sent') {
    revalidatePath('/join')
    return { ok: true, message: CLAIM_SENT }
  }
  if (outcome === null) return { ok: false, error: 'We couldn’t send your request. Try again.' }
  return { ok: false, error: CLAIM_MESSAGES[outcome] }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type IssueJoinCodeResult = { ok: true; code: string; expiresAt: string } | { ok: false; error: string }

/** sha256 hex of the normalised code — what owner_join_claim compares. */
function hashCode(code: string): string {
  return createHash('sha256').update(normaliseCode(code), 'utf8').digest('hex')
}

async function audit(db: AuthedDb, orgId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  try {
    const {
      data: { user },
    } = await db.auth.getUser()
    const { error } = await db.from('audit_log').insert({
      org_id: orgId,
      user_id: user?.id ?? null,
      action,
      entity_type: 'owner_join_code',
      entity_id: entityId,
      metadata,
    })
    if (error) console.error('[owner-join] audit failed', { entityId, code: error.code ?? null })
  } catch {
    console.error('[owner-join] audit failed', { entityId, code: 'thrown' })
  }
}

export async function issueJoinCode(unitId: string): Promise<IssueJoinCodeResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M5_APPLIED) return { ok: false, error: JOIN_NOT_LIVE }
  if (typeof unitId !== 'string' || !UUID.test(unitId)) return { ok: false, error: 'Choose a home.' }

  const db = (await getSupabaseServerClient()) as unknown as AuthedDb
  const code = formatJoinCode(randomBytes(JOIN_CODE_LENGTH))
  const expiresAt = new Date(Date.now() + JOIN_CODE_DAYS * 86_400_000).toISOString()
  const { data, error } = (await db
    .from(JOIN_CODES_TABLE)
    .insert({ organization_id: gate.orgId, unit_id: unitId, code_hash: hashCode(code), expires_at: expiresAt })
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error || !data) {
    console.error('[owner-join] issue code failed', { orgId: gate.orgId, unitId, code: error?.code ?? null })
    if (error?.code === '23503') return { ok: false, error: 'That home isn’t in your HOA.' }
    return { ok: false, error: 'We couldn’t make a code. Try again.' }
  }
  await audit(db, gate.orgId, 'members.join_code_issued', data.id, { unit_id: unitId })
  revalidatePath('/settings/members')
  return { ok: true, code, expiresAt }
}

export async function revokeJoinCode(codeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M5_APPLIED) return { ok: false, error: JOIN_NOT_LIVE }
  if (typeof codeId !== 'string' || !UUID.test(codeId)) return { ok: false, error: 'That code isn’t valid.' }

  const db = (await getSupabaseServerClient()) as unknown as AuthedDb
  const { data, error } = (await db
    .from(JOIN_CODES_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', codeId)
    .eq('organization_id', gate.orgId)
    .is('revoked_at', null)
    .select('id')) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
  if (error) {
    console.error('[owner-join] revoke failed', { codeId, code: error.code ?? null })
    return { ok: false, error: 'We couldn’t cancel that code. Try again.' }
  }
  if ((data ?? []).length === 0) return { ok: false, error: 'That code was already cancelled or isn’t on file.' }
  await audit(db, gate.orgId, 'members.join_code_revoked', codeId, {})
  revalidatePath('/settings/members')
  return { ok: true }
}
