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
  /** First active property_residents row matched on email — null if
   *  the member isn't linked to any home yet. */
  linkedProperty: {
    propertyId: string
    address: string
    unitNumber: string | null
    residencyRole: string
  } | null
}

export type ResidencyRole = 'owner' | 'tenant' | 'family_member' | 'other'

export interface PropertyOption {
  id: string
  address: string
  unit_number: string | null
}

/** Loads every property in the current org for the invite-form dropdown. */
export async function listOrgProperties(): Promise<PropertyOption[]> {
  const { org } = await requireAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('hoa_properties')
    .select('id, address, unit_number')
    .eq('org_id', org.id)
    .is('deleted_at', null)
    .order('address')
  return (data ?? []) as PropertyOption[]
}

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Reads ───────────────────────────────────────────────────────────

export async function listMembers(): Promise<MemberRow[]> {
  const { org } = await requireAdmin()

  // Use the admin (service-role) client because profiles RLS restricts
  // SELECT to `id = auth.uid()` — a per-user policy that prevents the
  // user-bound client from reading other members' profile rows. Without
  // service role here, every member except the caller comes back with
  // a null profile and renders as "(unknown user)". requireAdmin() above
  // already enforces the caller is an admin of THIS org, so the scope
  // stays tenant-isolated.
  const admin = createAdminClient()
  const { data } = await admin
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

  // Belt-and-suspenders fallback: if profile is still null (e.g., the
  // handle_new_user trigger hasn't fired yet, or the row was wiped),
  // pull the email straight from auth.users so the UI always has
  // SOMETHING to show instead of "(unknown user)".
  const missingProfileIds = rows
    .filter((r) => !r.profile?.email)
    .map((r) => r.user_id)
  const authBackfill = new Map<string, string>()
  if (missingProfileIds.length > 0) {
    // Hardened: any failure here MUST NOT take down the members page.
    // Worst case the UI falls back to user_id-only display.
    try {
      const { data: authList, error: authErr } = await admin.auth.admin.listUsers()
      if (authErr) {
        console.warn('[members] auth.admin.listUsers failed:', authErr.message)
      } else {
        const users = authList?.users ?? []
        for (const u of users) {
          if (u.id && u.email) authBackfill.set(u.id, u.email)
        }
      }
    } catch (err) {
      console.warn('[members] auth.admin.listUsers threw:', err)
    }
  }

  // property_residents has no user_id column — it matches members to
  // homes by email. Fetch all active property-resident rows for this
  // org once, then index by lower(email) for an O(1) lookup per member.
  // Only "active" (moved_out_at IS NULL) rows count; old residents
  // shouldn't pollute the column.
  const memberEmails = rows
    .map((r) => (r.profile?.email ?? authBackfill.get(r.user_id) ?? '').toLowerCase())
    .filter((e) => e.length > 0)
  const linkByEmail = new Map<string, MemberRow['linkedProperty']>()
  if (memberEmails.length > 0) {
    const { data: links } = await admin
      .from('property_residents')
      .select(
        'email, role, property:hoa_properties(id, address, unit_number)',
      )
      .eq('organization_id' as never, org.id)
      .in('email' as never, memberEmails)
      .is('moved_out_at' as never, null)
    type LinkRow = {
      email: string | null
      role: string
      property: { id: string; address: string; unit_number: string | null } | null
    }
    for (const link of (links ?? []) as unknown as LinkRow[]) {
      if (!link.email || !link.property) continue
      const key = link.email.toLowerCase()
      if (linkByEmail.has(key)) continue   // first match wins per member
      linkByEmail.set(key, {
        propertyId: link.property.id,
        address: link.property.address,
        unitNumber: link.property.unit_number,
        residencyRole: link.role,
      })
    }
  }

  return rows.map((r) => {
    const email = r.profile?.email ?? authBackfill.get(r.user_id) ?? null
    return {
      user_id: r.user_id,
      email,
      full_name: r.profile?.full_name ?? null,
      role: ((['admin', 'board', 'resident'] as const).includes(r.role as MemberRole)
        ? r.role
        : 'resident') as MemberRole,
      joined_at: r.joined_at,
      invited_at: r.invited_at,
      linkedProperty: email ? (linkByEmail.get(email.toLowerCase()) ?? null) : null,
    }
  })
}

// ─── Invite ──────────────────────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().trim().email('Email looks invalid.'),
  role: z.enum(['admin', 'board', 'resident']),
  full_name: z.string().trim().max(200).nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  residencyRole: z.enum(['owner', 'tenant', 'family_member', 'other']).nullable().optional(),
})

export interface InviteMemberInput {
  email: string
  role: MemberRole
  fullName?: string | null
  /** Optional — when set, also creates a property_residents row matching
   *  email + property so the member appears under "Linked to:" in lists. */
  propertyId?: string | null
  residencyRole?: ResidencyRole | null
}

export async function inviteMember(
  input: InviteMemberInput,
): Promise<ActionResult<{ userId: string; alreadyExisted: boolean }>> {
  const parsed = InviteSchema.safeParse({
    email: input.email,
    role: input.role,
    full_name: input.fullName ?? null,
    propertyId: input.propertyId ?? null,
    residencyRole: input.residencyRole ?? null,
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
  //
  // redirectTo: the magic-link in the email points here. Without it,
  // Supabase falls back to the project's "Site URL" which may be wrong.
  // We send the user to /auth/callback which exchanges the magic-link
  // code for a session and then forwards to the dashboard.
  //
  // data: the trigger handle_new_user reads raw_user_meta_data->>full_name
  // to seed profiles.full_name. Passing the invited name here means the
  // user shows up with a real name even before they complete sign-in.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.homeownerledger.com'
  const inviteOptions = {
    redirectTo: `${appUrl}/auth/callback`,
    data: parsed.data.full_name
      ? { full_name: parsed.data.full_name }
      : undefined,
  }
  const { data: invitedUser, error: inviteErr } = await admin.auth.admin
    .inviteUserByEmail(parsed.data.email, inviteOptions)
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
      propertyId: parsed.data.propertyId ?? null,
      residencyRole: parsed.data.residencyRole ?? null,
    })
  }

  return await attachToOrg({
    userId: invitedUser.user.id,
    email: parsed.data.email,
    fullName: parsed.data.full_name ?? null,
    role: parsed.data.role,
    orgId: org.id,
    alreadyExisted: false,
    propertyId: parsed.data.propertyId ?? null,
    residencyRole: parsed.data.residencyRole ?? null,
  })
}

async function attachToOrg(args: {
  userId: string
  email: string
  fullName: string | null
  role: MemberRole
  orgId: string
  alreadyExisted: boolean
  propertyId?: string | null
  residencyRole?: ResidencyRole | null
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

  // Optionally link to a property. property_residents has no user_id —
  // it matches members on email at read time. If a row already exists
  // for this (org, property, email), skip; otherwise insert. Failure
  // here is non-fatal — the member is still attached to the org, we
  // just don't get the property link.
  if (args.propertyId) {
    const residencyRole = args.residencyRole ?? 'owner'
    const { data: existing } = await admin
      .from('property_residents')
      .select('id')
      .eq('organization_id' as never, args.orgId)
      .eq('property_id' as never, args.propertyId)
      .ilike('email' as never, args.email)
      .is('moved_out_at' as never, null)
      .maybeSingle<{ id: string }>()

    if (!existing) {
      const { error: residErr } = await admin
        .from('property_residents')
        .insert({
          organization_id: args.orgId,
          property_id: args.propertyId,
          full_name: args.fullName ?? args.email.split('@')[0],
          email: args.email,
          role: residencyRole,
          is_primary: false,
          moved_in_at: new Date().toISOString().slice(0, 10),
        } as never)
      if (residErr) {
        console.warn('[members] property_residents insert failed:', residErr.message)
      }
    }
  }

  revalidatePath('/settings/members')
  revalidatePath('/')
  if (args.propertyId) revalidatePath(`/properties/${args.propertyId}`)
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
