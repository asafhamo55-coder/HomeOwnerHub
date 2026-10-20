/**
 * BL-128: invite every owner without an account at once, and see who
 * hasn't joined.
 *
 * Plain module (no 'use server'): the actions in owner-invites-actions.ts
 * and the members page call into it with clients they already gated.
 *
 * WHERE THINGS ARE RECORDED (verified 2026-10-20, no migration):
 * - An owner "without an account" is a current ownership (valid_to IS NULL)
 *   with owner_user_id NULL and an owner_email, whose email is not already
 *   a member of the org. Roster import and the property forms write these.
 * - A pending invitation is an org_members row whose auth user has never
 *   confirmed their email nor signed in. org_members.joined_at is NOT a
 *   signal: only onboarding sets it; nothing sets it when an invitee
 *   accepts. The auth user's email_confirmed_at / last_sign_in_at (admin
 *   API) is the only record that tells pending from joined.
 * - The invite itself is the same Supabase invitation email the Members
 *   page sends one at a time (auth.admin.inviteUserByEmail). Re-inviting an
 *   unconfirmed user re-sends it; a confirmed user is refused ("already
 *   registered"), which is how Resend tells "already joined".
 *
 * Every send passes the outbound guard first (outside production, or for a
 * sandboxed org, only OUTBOUND_ALLOWLIST addresses get an email). Sends are
 * batched and spaced. Logs and the audit row carry counts and ids only.
 */

import { guardRecipients, type EnvLike } from '@homeowner-portal/observability/outbound-guard'
import { readAllResult } from '@/lib/supabase/read-all'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any }

/** Most invitations one click sends. The rest wait for the next click. */
export const INVITE_BATCH = 25
/** Pause between two invitations, so Supabase's mailer is not flooded. */
export const INVITE_SPACING_MS = 250

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface OwnerToInvite {
  /** Lower-cased; one invitation per address, however many homes. */
  email: string
  name: string | null
  unitIds: string[]
}

/**
 * Owners on file with an email and no portal account in this org.
 * `admin` is the service role (profiles are per-user under RLS); the
 * caller has gated on board/admin of `orgId`. null = a read failed.
 */
export async function loadOwnersWithoutAccount(admin: Db, orgId: string): Promise<OwnerToInvite[] | null> {
  // Every page, not the first 1000 rows: a large roster must not be
  // silently cut short (BL-047).
  const [owners, members] = await Promise.all([
    readAllResult<{ unit_id: string; owner_email: string | null; owner_name: string | null }>((from, to) =>
      admin
        .from('ownerships')
        .select('id, unit_id, owner_email, owner_name')
        .eq('organization_id', orgId)
        .is('valid_to', null)
        .is('owner_user_id', null)
        .not('owner_email', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readAllResult<{ profile: { email: string | null } | null }>((from, to) =>
      admin
        .from('org_members')
        .select('user_id, profile:profiles(email)')
        .eq('org_id', orgId)
        .order('user_id', { ascending: true })
        .range(from, to),
    ),
  ])
  if (owners.error || members.error) {
    console.error('[owner-invites] roster read failed', { code: owners.error?.code ?? members.error?.code ?? null })
    return null
  }
  const memberEmails = new Set(
    (members.data ?? [])
      .map((m) => m.profile?.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  )
  return groupOwners(owners.data ?? [], memberEmails)
}

/** Pure: dedupe by address, drop members and malformed addresses. */
export function groupOwners(
  rows: Array<{ unit_id: string; owner_email: string | null; owner_name: string | null }>,
  memberEmails: ReadonlySet<string>,
): OwnerToInvite[] {
  const byEmail = new Map<string, OwnerToInvite>()
  for (const r of rows) {
    const email = r.owner_email?.trim().toLowerCase() ?? ''
    if (!EMAIL.test(email) || memberEmails.has(email)) continue
    const found = byEmail.get(email)
    if (found) {
      if (!found.unitIds.includes(r.unit_id)) found.unitIds.push(r.unit_id)
      if (!found.name && r.owner_name?.trim()) found.name = r.owner_name.trim()
    } else {
      byEmail.set(email, { email, name: r.owner_name?.trim() || null, unitIds: [r.unit_id] })
    }
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}

export interface InvitePlan {
  /** Total owners without an account. */
  total: number
  /** The outbound guard would hold these back (no email would go out). */
  held: number
  /** This click's batch: guard-allowed, at most INVITE_BATCH. */
  batch: OwnerToInvite[]
  /** Guard-allowed owners left for a later click. */
  remaining: number
}

/** Pure: split the owners into this batch, later, and held by the guard. */
export function planOwnerInvites(
  owners: OwnerToInvite[],
  opts: { orgSandbox: boolean; env?: EnvLike; ref?: string },
): InvitePlan {
  const guard = guardRecipients('email', owners, (o) => o.email, {
    orgSandbox: opts.orgSandbox,
    env: opts.env,
    ref: opts.ref,
  })
  const batch = guard.allowed.slice(0, INVITE_BATCH)
  return {
    total: owners.length,
    held: guard.blocked.length,
    batch,
    remaining: guard.allowed.length - batch.length,
  }
}

// ─── Pending invitations ─────────────────────────────────────────────

export interface AuthUserState {
  email_confirmed_at?: string | null
  confirmed_at?: string | null
  last_sign_in_at?: string | null
  invited_at?: string | null
}

/** Invited, never accepted: no confirmed email and never signed in. */
export function isPendingInvite(u: AuthUserState | null | undefined): boolean {
  if (!u) return false
  return !u.email_confirmed_at && !u.confirmed_at && !u.last_sign_in_at
}

export interface PendingInvitation {
  userId: string
  email: string | null
  name: string | null
  role: 'admin' | 'board' | 'resident'
  invitedAt: string | null
}

type AdminAuth = {
  auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: AuthUserState | null } | null; error: unknown }> } }
}

/**
 * Members of `orgId` who were invited and never accepted. Only rows with
 * joined_at NULL are checked (the org's creator has it set), eight at a
 * time against the auth admin API. A member whose auth state can't be read
 * is left out rather than shown as pending. null = the member read failed.
 */
export async function loadPendingInvitations(admin: Db & AdminAuth, orgId: string): Promise<PendingInvitation[] | null> {
  const { data, error } = await admin
    .from('org_members')
    .select('user_id, role, invited_at, joined_at, profile:profiles(email, full_name)')
    .eq('org_id', orgId)
    .is('joined_at', null)
  if (error) {
    console.error('[owner-invites] members read failed', { code: error.code ?? null })
    return null
  }
  const rows = (data ?? []) as Array<{
    user_id: string
    role: string
    invited_at: string | null
    profile: { email: string | null; full_name: string | null } | null
  }>
  const pending: PendingInvitation[] = []
  for (let i = 0; i < rows.length; i += 8) {
    const chunk = rows.slice(i, i + 8)
    const states = await Promise.all(
      chunk.map(async (r) => {
        try {
          const res = await admin.auth.admin.getUserById(r.user_id)
          return res.error ? null : (res.data?.user ?? null)
        } catch {
          return null
        }
      }),
    )
    chunk.forEach((r, j) => {
      if (!isPendingInvite(states[j])) return
      pending.push({
        userId: r.user_id,
        email: r.profile?.email ?? null,
        name: r.profile?.full_name ?? null,
        role: r.role === 'admin' || r.role === 'board' ? r.role : 'resident',
        invitedAt: r.invited_at ?? states[j]?.invited_at ?? null,
      })
    })
  }
  return pending.sort((a, b) => (b.invitedAt ?? '').localeCompare(a.invitedAt ?? ''))
}

/** "already registered" from GoTrue: the user exists and has confirmed. */
export function isAlreadyRegistered(err: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'email_exists' || err.code === 'user_already_exists') return true
  return /already (been )?registered|already exists/i.test(err.message ?? '')
}

export function isRateLimited(err: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!err) return false
  return err.status === 429 || err.code === 'over_email_send_rate_limit' || /rate limit/i.test(err.message ?? '')
}
