'use server'

/**
 * BL-128: the board's bulk owner invite, and Resend / Revoke on a pending
 * invitation. Every export gates on board/admin first. See owner-invites.ts
 * for where owners and pending invitations are recorded.
 *
 * Sends are explicit board actions (a confirm step in the UI, and the
 * count the board confirmed must still match), go through the outbound
 * guard, and are batched (INVITE_BATCH a click, INVITE_SPACING_MS apart,
 * stopping at Supabase's first rate-limit answer). Audited with counts.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { fetchOrgSandbox, guardRecipients } from '@homeowner-portal/observability/outbound-guard'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { appUrl } from '@/lib/app-origin'
import { todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import { exactIlike } from '@/lib/impersonation-target'
import { linkOwnershipForMember } from '@/lib/properties/lot'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  INVITE_SPACING_MS,
  createdByThisCall,
  isAlreadyRegistered,
  isPendingInvite,
  isRateLimited,
  loadOwnersWithoutAccount,
  loadPendingInvitations,
  planOwnerInvites,
  type Db,
  type OwnerToInvite,
  type PendingInvitation,
} from '@/lib/owner-invites'

export interface OwnerInvitePreview {
  total: number
  held: number
  sendNow: number
  remaining: number
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const PREVIEW_FAILED = 'We couldn’t load the owner list. Try again.'

/** Counts for the confirm step. Nothing is sent. */
export async function previewOwnerInvites(): Promise<Result<OwnerInvitePreview>> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  const admin = createAdminClient()
  const [owners, orgSandbox] = await Promise.all([
    loadOwnersWithoutAccount(admin as unknown as Db, gate.orgId),
    fetchOrgSandbox(admin, gate.orgId),
  ])
  if (!owners) return { ok: false, error: PREVIEW_FAILED }
  const plan = planOwnerInvites(owners, { orgSandbox })
  return { ok: true, data: { total: plan.total, held: plan.held, sendNow: plan.batch.length, remaining: plan.remaining } }
}

export interface OwnerInviteOutcome {
  /** SEC-N4: includes owners whose address already has an account — the
   *  response never says which addresses those are. */
  invited: number
  failed: number
  held: number
  remaining: number
  /** Supabase refused further sends for now; the rest wait. */
  rateLimited: boolean
}

const InviteAllSchema = z.object({ expected: z.number().int().min(0) })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Invite this click's batch of owners without an account. `expected` is
 * the "send now" count the board confirmed; if the list moved since the
 * preview, nothing is sent and the board is asked to look again.
 */
export async function inviteAllOwners(expected: number): Promise<Result<OwnerInviteOutcome>> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  const parsed = InviteAllSchema.safeParse({ expected })
  if (!parsed.success) return { ok: false, error: 'Review the count and try again.' }

  const admin = createAdminClient()
  const [owners, orgSandbox] = await Promise.all([
    loadOwnersWithoutAccount(admin as unknown as Db, gate.orgId),
    fetchOrgSandbox(admin, gate.orgId),
  ])
  if (!owners) return { ok: false, error: PREVIEW_FAILED }
  const plan = planOwnerInvites(owners, { orgSandbox, ref: `invite_bulk:${gate.orgId}` })
  if (plan.batch.length !== parsed.data.expected) {
    return { ok: false, error: 'The owner list changed since you reviewed it. Review the new count and confirm again.' }
  }
  if (plan.batch.length === 0) {
    return { ok: true, data: { invited: 0, failed: 0, held: plan.held, remaining: 0, rateLimited: false } }
  }

  const supabase = await getSupabaseServerClient()
  const today = todayIn(await orgTimeZone(admin, gate.orgId))
  const out: OwnerInviteOutcome = { invited: 0, failed: 0, held: plan.held, remaining: plan.remaining, rateLimited: false }

  for (let i = 0; i < plan.batch.length; i++) {
    const owner = plan.batch[i]!
    if (i > 0) await sleep(INVITE_SPACING_MS)
    const r = await inviteOneOwner(admin, supabase, gate.orgId, owner, today)
    if (r === 'rate_limited') {
      out.rateLimited = true
      out.remaining += plan.batch.length - i
      break
    }
    out[r] += 1
  }

  // Counts only — never an address.
  const { error: auditError } = await supabase.from('audit_log').insert({
    org_id: gate.orgId,
    user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
    action: 'members.invite_bulk',
    entity_type: 'org',
    entity_id: gate.orgId,
    metadata: { ...out } as never,
  })
  if (auditError) console.error('[owner-invites] audit insert failed', { code: auditError.code ?? null })
  console.info('[owner-invites] bulk invite', { orgId: gate.orgId, ...out })

  revalidatePath('/settings/members')
  return { ok: true, data: out }
}

type OneOutcome = 'invited' | 'failed' | 'rate_limited'

/**
 * The Members page's invite, for one owner: invite the auth user, add them
 * as a resident, link every home they own on file.
 *
 * SEC-N4: an address that already has a confirmed account is NOT attached
 * to this HOA (no membership, no ownership link) unless that account is
 * already a member here — a board must not be able to pull a stranger's
 * account into its HOA, nor learn from the result that the address has an
 * account. Such owners are counted as "invited" like everyone else (GoTrue
 * cannot send an invitation to a confirmed account, and there is no
 * accept-to-join flow yet); they can join by signing in once the board
 * uses a path the account holder confirms.
 *
 * SEC-N1: when inviteUserByEmail hands back an account that existed before
 * this call (an unconfirmed invitee of any HOA), its profile is left alone.
 */
async function inviteOneOwner(
  admin: ReturnType<typeof createAdminClient>,
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  owner: OwnerToInvite,
  today: string,
): Promise<OneOutcome> {
  let userId: string | null = null
  const startedAt = Date.now()
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(owner.email, {
    redirectTo: appUrl('/auth/callback'),
    data: owner.name ? { full_name: owner.name } : undefined,
  })
  if (inviteErr) {
    if (isRateLimited(inviteErr)) return 'rate_limited'
    if (!isAlreadyRegistered(inviteErr)) {
      console.error('[owner-invites] invite failed', { orgId, code: inviteErr.code ?? inviteErr.status ?? null })
      return 'failed'
    }
    const { data: prof } = await admin.from('profiles').select('id').ilike('email', exactIlike(owner.email)).limit(1)
    userId = ((prof ?? []) as Array<{ id: string }>)[0]?.id ?? null
    // Uniform outcome: whether or not the account exists, or is ours to link.
    if (!userId) return 'invited'
    const { data: here, error: hereErr } = await admin
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()
    if (hereErr) {
      console.error('[owner-invites] membership check failed', { orgId, code: hereErr.code ?? null })
      return 'failed'
    }
    if (!here) {
      console.info('[owner-invites] existing account not attached', { orgId })
      return 'invited'
    }
    // Already a member of this HOA: linking their homes reveals nothing.
  } else {
    userId = invited.user.id
    if (createdByThisCall(invited.user, startedAt)) {
      await admin.from('profiles').upsert({ id: userId, email: owner.email, full_name: owner.name } as never)
    }
  }

  const { error: memberErr } = await supabase
    .from('org_members')
    .insert({ org_id: orgId, user_id: userId, role: 'resident', invited_at: new Date().toISOString() } as never)
  // 23505: already a member (raced another invite) — still link the homes.
  if (memberErr && memberErr.code !== '23505') {
    console.error('[owner-invites] membership insert failed', { orgId, userId, code: memberErr.code ?? null })
    return 'failed'
  }

  for (const unitId of owner.unitIds) {
    const linked = await linkOwnershipForMember(admin, {
      orgId,
      unitId,
      userId,
      email: owner.email,
      escapedEmail: exactIlike(owner.email),
      fullName: owner.name,
      today,
    })
    if (!linked.ok) console.error('[owner-invites] ownership link failed', { orgId, unitId })
  }
  return 'invited'
}

// ─── Pending: list / Resend / Revoke ─────────────────────────────────

/** Invited, never signed in. null = the list couldn't be read. */
export async function listPendingInvitations(): Promise<PendingInvitation[] | null> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return null
  const admin = createAdminClient()
  return loadPendingInvitations(admin as unknown as Parameters<typeof loadPendingInvitations>[0], gate.orgId)
}

const UserIdSchema = z.string().uuid()

/** Board members act on resident invitations only; admins on any. */
async function pendingMember(
  orgId: string,
  role: 'admin' | 'board',
  userId: string,
): Promise<
  | { ok: true; admin: ReturnType<typeof createAdminClient>; email: string; fullName: string | null; memberRole: string }
  | { ok: false; error: string }
> {
  const admin = createAdminClient()
  const { data: member, error } = await admin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { ok: false, error: 'We couldn’t check that invitation. Try again.' }
  if (!member) return { ok: false, error: 'That invitation is no longer on file.' }
  const memberRole = (member as { role: string }).role
  if (role !== 'admin' && memberRole !== 'resident') {
    return { ok: false, error: 'Board members can only manage resident invitations.' }
  }
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId)
  if (authErr || !authUser?.user) return { ok: false, error: 'We couldn’t check that invitation. Try again.' }
  if (!isPendingInvite(authUser.user)) return { ok: false, error: 'They’ve already joined, so there is no invitation to change.' }
  const email = authUser.user.email
  if (!email) return { ok: false, error: 'That invitation has no email address.' }
  const fullName = (authUser.user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null
  return { ok: true, admin, email, fullName, memberRole }
}

export async function resendInvitation(userId: string): Promise<Result<{ sent: boolean }>> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!UserIdSchema.safeParse(userId).success) return { ok: false, error: 'That invitation isn’t valid.' }
  const found = await pendingMember(gate.orgId, gate.role, userId)
  if (!found.ok) return found

  const orgSandbox = await fetchOrgSandbox(found.admin, gate.orgId)
  const guard = guardRecipients('email', [found.email], (e) => e, { orgSandbox, ref: `invite_resend:${userId}` })
  if (guard.allowed.length === 0) {
    return { ok: false, error: 'Sending is switched off for this address (test or sandbox mode), so nothing was sent.' }
  }

  // Re-inviting an unconfirmed user re-sends the same invitation email.
  const { error } = await found.admin.auth.admin.inviteUserByEmail(found.email, {
    redirectTo: appUrl('/auth/callback'),
    data: found.fullName ? { full_name: found.fullName } : undefined,
  })
  if (error) {
    if (isRateLimited(error)) return { ok: false, error: 'Too many emails just went out. Try again in a few minutes.' }
    if (isAlreadyRegistered(error)) return { ok: false, error: 'They’ve already joined, so there is no invitation to resend.' }
    console.error('[owner-invites] resend failed', { userId, code: error.code ?? error.status ?? null })
    return { ok: false, error: 'We couldn’t resend the invitation. Try again.' }
  }

  const supabase = await getSupabaseServerClient()
  await supabase
    .from('org_members')
    .update({ invited_at: new Date().toISOString() } as never)
    .eq('org_id', gate.orgId)
    .eq('user_id', userId)
  revalidatePath('/settings/members')
  return { ok: true, data: { sent: true } }
}

/**
 * Withdraw an invitation that was never accepted: this HOA's membership
 * goes and the account link on this HOA's ownerships is cleared (so the
 * owner shows as "without an account" again). The roster (owner name and
 * email) is untouched.
 *
 * SEC-N1: Revoke never deletes the auth account. "Belongs to no other HOA"
 * is not proof the account is this board's to delete — it may be another
 * tenant's pending invitee or a pending platform admin (platform_admins is
 * not an org membership). An unconfirmed account with no membership is
 * harmless: signing in through the old link lands on an empty account
 * with no HOA, and the next invitation from anyone reuses it.
 */
export async function revokeInvitation(userId: string): Promise<Result<{ revoked: boolean }>> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!UserIdSchema.safeParse(userId).success) return { ok: false, error: 'That invitation isn’t valid.' }
  const found = await pendingMember(gate.orgId, gate.role, userId)
  if (!found.ok) return found

  const supabase = await getSupabaseServerClient()
  // The caller's own client: 0058 RLS still bounds who removes whom.
  const { data: removed, error } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', gate.orgId)
    .eq('user_id', userId)
    .select('user_id')
  if (error || !removed || removed.length === 0) {
    console.error('[owner-invites] revoke failed', { userId, code: error?.code ?? null })
    return { ok: false, error: 'We couldn’t revoke the invitation. Refresh and try again.' }
  }

  const { error: unlinkErr } = await found.admin
    .from('ownerships')
    .update({ owner_user_id: null } as never)
    .eq('organization_id', gate.orgId)
    .eq('owner_user_id', userId)
  if (unlinkErr) console.error('[owner-invites] ownership unlink failed', { userId, code: unlinkErr.code ?? null })

  revalidatePath('/settings/members')
  return { ok: true, data: { revoked: true } }
}
