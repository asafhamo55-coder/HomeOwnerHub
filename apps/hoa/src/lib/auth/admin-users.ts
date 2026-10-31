// Server-only: takes a service-role client. Finds auth accounts without
// assuming `auth.admin.listUsers()` returns everyone (it returns one page,
// about 50 accounts by default).
//
// Every lookup returns an explicit result. A failed lookup is `ok: false`
// and must never be treated as "no account". No emails or ids are logged.
import { exactIlike } from '@/lib/impersonation-target'

export const AUTH_USERS_PER_PAGE = 1000
export const AUTH_USERS_MAX_PAGES = 50

type AuthUser = { id: string; email?: string | null }

/** The slice of the admin client this helper uses (structural, so tests can fake it). */
export interface AdminUsersClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{
        data: { user: AuthUser | null } | null
        error: { message: string; status?: number } | null
      }>
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: AuthUser[] } | null
        error: { message: string } | null
      }>
    }
  }
}

export type FindUserResult =
  | { ok: true; found: true; user: { id: string; email: string | null } }
  | { ok: true; found: false }
  | { ok: false; error: string }

export type EmailsByIdResult =
  | { ok: true; emails: Map<string, string>; failedIds: string[] }
  | { ok: false; error: string }

/**
 * Find an account by email. Tries the profiles table first (one round
 * trip), then pages through auth users (profiles can lag the auth row).
 */
export async function findAuthUserByEmail(
  admin: AdminUsersClient,
  email: string,
): Promise<FindUserResult> {
  const target = email.trim().toLowerCase()
  if (!target) return { ok: true, found: false }

  try {
    const { data, error } = await admin
      .from('profiles')
      .select('id, email')
      .ilike('email', exactIlike(target))
      .limit(1)
      .maybeSingle()
    if (!error && data?.id) {
      return { ok: true, found: true, user: { id: data.id as string, email: (data.email as string | null) ?? null } }
    }
    // A profiles error or miss is not conclusive; fall through to auth.
  } catch {
    // Same: fall through to the authoritative scan.
  }

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page++) {
    let res
    try {
      res = await admin.auth.admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'listUsers failed' }
    }
    if (res.error) return { ok: false, error: res.error.message }
    const users = res.data?.users ?? []
    const hit = users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return { ok: true, found: true, user: { id: hit.id, email: hit.email ?? null } }
    if (users.length < AUTH_USERS_PER_PAGE) return { ok: true, found: false }
  }
  // Cap reached without a short page: we cannot say the account is absent.
  console.warn('[auth-admin-users] findAuthUserByEmail hit the page cap', {
    maxPages: AUTH_USERS_MAX_PAGES,
  })
  return { ok: false, error: 'Account lookup exceeded the page cap.' }
}

/** Find an account by id (a direct lookup; never scans the list). */
export async function findAuthUserById(admin: AdminUsersClient, id: string): Promise<FindUserResult> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(id)
    if (error) {
      if (error.status === 404) return { ok: true, found: false }
      return { ok: false, error: error.message }
    }
    const user = data?.user
    if (!user) return { ok: true, found: false }
    return { ok: true, found: true, user: { id: user.id, email: user.email ?? null } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'getUserById failed' }
  }
}

/**
 * Emails for a set of user ids, via per-id getUserById in small concurrent
 * batches. Ids with no account or no email are absent from the map; ids
 * whose lookup errored are listed in `failedIds`.
 */
export async function authEmailsByIds(
  admin: AdminUsersClient,
  ids: string[],
): Promise<EmailsByIdResult> {
  const unique = [...new Set(ids)]
  const emails = new Map<string, string>()
  const failedIds: string[] = []
  const BATCH = 10
  for (let i = 0; i < unique.length; i += BATCH) {
    const results = await Promise.all(
      unique.slice(i, i + BATCH).map(async (id) => [id, await findAuthUserById(admin, id)] as const),
    )
    for (const [id, r] of results) {
      if (!r.ok) failedIds.push(id)
      else if (r.found && r.user.email) emails.set(id, r.user.email)
    }
  }
  if (unique.length > 0 && failedIds.length === unique.length) {
    return { ok: false, error: 'Every account lookup failed.' }
  }
  return { ok: true, emails, failedIds }
}
