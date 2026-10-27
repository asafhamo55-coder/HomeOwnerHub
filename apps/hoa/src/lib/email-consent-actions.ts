'use server'

/**
 * Server actions over lib/email-consent.ts (BL-020, CA Civ. Code §4040):
 *
 *   setMyEmailConsent        a member grants / withdraws their own consent
 *                            from Account (method 'portal')
 *   recordMemberEmailConsent the board records a member's signed form or
 *                            email (method 'written' / 'email')
 *
 * Both refuse until M1_APPLIED (the table does not exist before 0064).
 * Writes go through the caller's RLS-bound client, so recorded_by is
 * really them and 0064's insert policy is the final word. Errors are
 * friendly sentences, never row values; nothing here logs.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { recordEmailConsent } from './email-consent'

export type ConsentActionResult = { ok: true } | { ok: false; error: string }

const NOT_AVAILABLE = 'Electronic-notice consent isn’t available yet.'
const SAVE_FAILED = 'Couldn’t save the consent. Try again.'

/** A member's own grant or withdrawal, from the portal. */
export async function setMyEmailConsent(granted: boolean): Promise<ConsentActionResult> {
  if (!M1_APPLIED) return { ok: false, error: NOT_AVAILABLE }
  if (typeof granted !== 'boolean') return { ok: false, error: 'Invalid choice.' }
  // Viewing as a resident is read-only: consent is the member's own act.
  const actor = await getResidentActor()
  if (actor.impersonating) return { ok: false, error: 'You’re viewing as this resident — only they can change this.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const res = await recordEmailConsent(supabase, {
    orgId: org.id,
    userId: user.id,
    recordedBy: user.id,
    granted,
    method: 'portal',
  })
  if (!res.ok) return { ok: false, error: res.error === 'not_available' ? NOT_AVAILABLE : SAVE_FAILED }
  revalidatePath('/resident/account')
  return { ok: true }
}

const METHODS = ['written', 'email'] as const
export type BoardConsentMethod = (typeof METHODS)[number]

/**
 * The board records consent (or a withdrawal) the member gave on paper
 * or by email. The member must belong to the current org: 0064's insert
 * policy checks the recorder's org, not the member's.
 */
export async function recordMemberEmailConsent(input: {
  userId: string
  granted: boolean
  method: BoardConsentMethod
  /** Where to refresh after saving (the page the board is on). */
  revalidate?: string
}): Promise<ConsentActionResult> {
  if (!M1_APPLIED) return { ok: false, error: NOT_AVAILABLE }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.userId)) return { ok: false, error: 'Unknown member.' }
  if (typeof input.granted !== 'boolean' || !(METHODS as readonly string[]).includes(input.method)) {
    return { ok: false, error: 'Choose how the member gave consent.' }
  }

  // Service role only for the membership lookup (org_members RLS hides
  // other members from the board's client); the write itself is RLS-bound.
  const { data: member, error: memberErr } = await createAdminClient()
    .from('org_members')
    .select('user_id')
    .eq('org_id', gate.orgId)
    .eq('user_id', input.userId)
    // BL-168: a CPA or attorney is not an owner or member whose notice consent we record.
    .in('role', ['admin', 'board', 'resident'])
    .maybeSingle()
  if (memberErr) return { ok: false, error: SAVE_FAILED }
  if (!member) return { ok: false, error: 'That person isn’t a member of this HOA.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const res = await recordEmailConsent(supabase, {
    orgId: gate.orgId,
    userId: input.userId,
    recordedBy: user.id,
    granted: input.granted,
    method: input.method,
  })
  if (!res.ok) return { ok: false, error: res.error === 'not_available' ? NOT_AVAILABLE : SAVE_FAILED }
  revalidatePath('/settings/members')
  if (input.revalidate && input.revalidate.startsWith('/') && !input.revalidate.startsWith('//')) revalidatePath(input.revalidate)
  return { ok: true }
}
