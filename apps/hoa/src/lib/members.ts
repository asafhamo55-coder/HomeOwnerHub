'use server'

// Admin-only member management. Lists, invites, role changes, removes.
// All writes go through the user-bound RLS client; RLS lets admins
// of an org INSERT/UPDATE/DELETE rows in org_members for that org,
// per the policies in migration 0000 + 0001.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin, type Role } from '@/lib/auth'

export type MemberRole = Role

export interface MemberRow {
  user_id: string
  email: string | null
  full_name: string | null
  role: MemberRole
  joined_at: string | null
  invited_at: string | null
}

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Reads ───────────────────────────────────────────────────────────

export async function listMembers(): Promise<MemberRow[]> {
  const { org } = await requireAdmin()
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('org_members')
    .select(
      'user_id, role, joined_at, invited_at, profile:profiles(email, full_name)',
    )
    .eq('org_id', org.id)
    .order('joined_at', { ascending: true, nullsFirst: false })

  const rows = (data ?? []) as unknown as Array<{
    user_id: string
    role: string
    joined_at: string | null
    invited_at: string | null
    profile: { email: string | null; full_name: string | null } | null
  }>

  return rows.map((r) => ({
    user_id: r.user_id,
    email: r.profile?.email ?? null,
    full_name: r.profile?.full_name ?? null,
    role: ((['admin', 'board', 'resident'] as const).includes(r.role as MemberRole)
      ? r.role
      : 'resident') as MemberRole,
    joined_at: r.joined_at,
    invited_at: r.invited_at,
  }))
}

// ─── Invite ──────────────────────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().trim().email('Email looks invalid.'),
  role: z.enum(['admin', 'board', 'resident']),
  full_name: z.string().trim().max(200).nullable().optional(),
})

export interface InviteMemberInput {
  email: string
  role: MemberRole
  fullName?: string | null
}

export async function inviteMember(
  input: InviteMemberInput,
): Promise<ActionResult<{ userId: string; alreadyExisted: boolean }>> {
  const parsed = InviteSchema.safeParse({
    email: input.email,
    role: input.role,
    full_name: input.fullName ?? null,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const { org } = await requireAdmin()

  // We need the admin (service-role) client to create a Supabase Auth
  // user. We then INSERT into org_members via the user-bound client so
  // RLS still gates writes to that table.
  const admin = createAdminClient()

  // 1. Find or create the auth user.
  // Supabase's admin SDK exposes `auth.admin.inviteUserByEmail` which
  // creates the user (if missing) and sends a magic-link invitation.
  // If the user already exists this returns the existing user instead
  // of creating a duplicate.
  const { data: invitedUser, error: inviteErr } = await admin.auth.admin
    .inviteUserByEmail(parsed.data.email)
  if (inviteErr) {
    // If the user already exists, fall back to a direct lookup.
    const { data: list } = await admin.auth.admin.listUsers()
    const existing = list?.users.find(
      (u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase(),
    )
    if (!existing) {
      return { ok: false, error: inviteErr.message }
    }
    return await attachToOrg({
      userId: existing.id,
      email: parsed.data.email,
      fullName: parsed.data.full_name ?? null,
      role: parsed.data.role,
      orgId: org.id,
      alreadyExisted: true,
    })
  }

  return await attachToOrg({
    userId: invitedUser.user.id,
    email: parsed.data.email,
    fullName: parsed.data.full_name ?? null,
    role: parsed.data.role,
    orgId: org.id,
    alreadyExisted: false,
  })
}

async function attachToOrg(args: {
  userId: string
  email: string
  fullName: string | null
  role: MemberRole
  orgId: string
  alreadyExisted: boolean
}): Promise<ActionResult<{ userId: string; alreadyExisted: boolean }>> {
  const supabase = await getSupabaseServerClient()

  // Ensure profile exists. Use the admin client because the RLS policy on
  // profiles only allows users to edit their own row (id = auth.uid()),
  // but here the admin is writing a profile for the invited user.
  const admin = createAdminClient()
  await admin
    .from('profiles')
    .upsert({
      id: args.userId,
      email: args.email,
      full_name: args.fullName,
    } as never)

  // Insert org_members row. The unique (org_id, user_id) pk dedupes if
  // we're attaching an existing user that's already a member; in that
  // case we update the role instead.
  const { error: insertErr } = await supabase
    .from('org_members')
    .insert({
      org_id: args.orgId,
      user_id: args.userId,
      role: args.role,
      invited_at: new Date().toISOString(),
    } as never)

  if (insertErr) {
    // Likely a uniqueness violation — fall back to update.
    const { error: updateErr } = await supabase
      .from('org_members')
      .update({ role: args.role } as never)
      .eq('org_id', args.orgId)
      .eq('user_id', args.userId)
    if (updateErr) return { ok: false, error: updateErr.message }
  }

  revalidatePath('/settings/members')
  return {
    ok: true,
    data: { userId: args.userId, alreadyExisted: args.alreadyExisted },
  }
}

// ─── Change role ─────────────────────────────────────────────────────

const ChangeRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['admin', 'board', 'resident']),
})

export async function changeMemberRole(
  userId: string,
  role: MemberRole,
): Promise<ActionResult> {
  const parsed = ChangeRoleSchema.safeParse({ user_id: userId, role })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const { org } = await requireAdmin()
  const supabase = await getSupabaseServerClient()

  // Guard against removing the last admin. Count current admins in org.
  if (parsed.data.role !== 'admin') {
    const { count, data: target } = await supabase
      .from('org_members')
      .select('role', { count: 'exact' })
      .eq('org_id', org.id)
      .eq('role', 'admin')
    void target
    if ((count ?? 0) <= 1) {
      const { data: targetRow } = await supabase
        .from('org_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', parsed.data.user_id)
        .maybeSingle<{ role: string }>()
      if (targetRow?.role === 'admin') {
        return {
          ok: false,
          error: 'You can\'t demote the last admin. Promote someone else first.',
        }
      }
    }
  }

  const { error } = await supabase
    .from('org_members')
    .update({ role: parsed.data.role } as never)
    .eq('org_id', org.id)
    .eq('user_id', parsed.data.user_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/settings/members')
  return { ok: true }
}

// ─── Remove ──────────────────────────────────────────────────────────

export async function removeMember(userId: string): Promise<ActionResult> {
  const { org } = await requireAdmin()
  const supabase = await getSupabaseServerClient()

  // Same guard: don't allow removing the last admin.
  const { data: targetRow } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('user_id', userId)
    .maybeSingle<{ role: string }>()

  if (targetRow?.role === 'admin') {
    const { count } = await supabase
      .from('org_members')
      .select('role', { count: 'exact' })
      .eq('org_id', org.id)
      .eq('role', 'admin')
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: 'You can\'t remove the last admin. Promote someone else first.',
      }
    }
  }

  const { error } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', org.id)
    .eq('user_id', userId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/settings/members')
  return { ok: true }
}
