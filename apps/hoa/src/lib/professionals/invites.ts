'use server'

// BL-168 — accepting an invitation to be a CPA or attorney for an account
// that already exists. The board's invite (actions.ts inviteProfessional)
// only records a professional_invites row and emails a signed link; this is
// the one place the membership is created for that path.
//
// Authorization is the signed link PLUS being signed in as the invited
// email (confirmed). A forwarded link is useless to anyone else; a link
// that was cancelled, already used or past its seven days does nothing.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import { getSignedInUser } from '@/lib/orgs'
import { NOT_LIVE, NOT_SIGNED_IN, type ActionResult } from './guard'
import { writeProAudit } from './audit'
import { inviteSecret, verifyInvite } from './invite-token'
import { PRO_AUDIT, expiryProblem, MatterRefSchema } from './model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
const GENERIC = 'This invitation can’t be accepted. Ask the board to send a new one.'

export async function acceptProfessionalInvite(inviteId: string, sig: string): Promise<ActionResult> {
  if (!M6_APPLIED) return fail(NOT_LIVE)
  const user = await getSignedInUser()
  if (!user) return fail(NOT_SIGNED_IN)
  const secret = inviteSecret()
  if (!secret || !/^[0-9a-f-]{36}$/i.test(inviteId) || !verifyInvite(inviteId, sig, secret)) return fail(GENERIC)

  const admin = createAdminClient() as Loose
  const { data: inv, error } = await admin
    .from('professional_invites')
    .select('id, organization_id, email, role, access_expires_on, general_counsel, matters, created_by, link_expires_at, accepted_at, revoked_at')
    .eq('id', inviteId)
    .maybeSingle()
  if (error) return fail('We couldn’t check that invitation. Try again.')
  if (!inv || inv.accepted_at || inv.revoked_at || Date.parse(inv.link_expires_at) <= Date.now()) return fail(GENERIC)

  // Signed in as the invited address, and that address confirmed.
  if (!user.email_confirmed_at || (user.email ?? '').toLowerCase() !== inv.email) {
    return fail('Sign in with the email address this invitation was sent to, then open the link again.')
  }
  const today = todayIn(await orgTimeZone(createAdminClient(), inv.organization_id))
  if (expiryProblem(inv.access_expires_on, today)) return fail(GENERIC)

  // Claim it (single use), then create the membership.
  const { data: claimed, error: claimErr } = await admin
    .from('professional_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', inv.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')
  if (claimErr || !claimed || claimed.length === 0) return fail(GENERIC)

  const release = () => admin.from('professional_invites').update({ accepted_at: null, accepted_by: null }).eq('id', inv.id)
  const { error: memberErr } = await admin.from('org_members').insert({
    org_id: inv.organization_id,
    user_id: user.id,
    role: inv.role,
    invited_at: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    access_expires_at: `${inv.access_expires_on}T23:59:59Z`,
    general_counsel: inv.role === 'attorney' && inv.general_counsel === true,
  })
  if (memberErr) {
    await release()
    return fail(memberErr.code === '23505' ? 'You already have access to this HOA.' : GENERIC)
  }

  let assigned = 0
  for (const raw of Array.isArray(inv.matters) ? inv.matters : []) {
    const m = MatterRefSchema.safeParse(raw)
    if (!m.success) continue
    const { error: asgErr } = await admin.from('matter_assignments').insert({
      organization_id: inv.organization_id,
      user_id: user.id,
      matter_type: m.data.type,
      matter_id: m.data.id,
      created_by: inv.created_by,
    })
    if (!asgErr) assigned += 1
  }
  await writeProAudit(admin, {
    orgId: inv.organization_id,
    userId: user.id,
    action: PRO_AUDIT.inviteAccepted,
    entityType: 'professional_invite',
    entityId: inv.id,
    metadata: { role: inv.role, expires_on: inv.access_expires_on, matters: assigned },
  })
  revalidatePath('/settings/professionals')
  revalidatePath('/pro', 'layout')
  return { ok: true, data: undefined }
}
