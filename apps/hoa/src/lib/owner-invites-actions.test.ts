import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-128 actions: board-only, confirm-count bound, guarded, batched, and
// Resend / Revoke only on invitations that are actually pending.

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: boolean; role?: 'admin' | 'board'; orgId?: string; error?: string },
  owners: [] as Array<{ email: string; name: string | null; unitIds: string[] }> | null,
  sandbox: false,
  inviteErrors: {} as Record<string, { message?: string; code?: string; status?: number }>,
  invited: [] as string[],
  memberRole: 'resident' as string | null,
  authUser: { email: 'p@x.com', email_confirmed_at: null, last_sign_in_at: null } as Record<string, unknown> | null,
  hereMember: false,
  preExisting: {} as Record<string, boolean>,
  deleted: [] as string[],
  userCalls: [] as unknown[][],
  adminCalls: [] as unknown[][],
  linked: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/app-origin', () => ({ appUrl: (p: string) => `https://app.test${p}` }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/properties/lot', () => ({
  linkOwnershipForMember: vi.fn(async (_db: unknown, input: unknown) => (h.linked.push(input), { ok: true, data: { outcome: 'linked' } })),
}))
vi.mock('@homeowner-portal/observability/outbound-guard', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/observability/outbound-guard')>()),
  fetchOrgSandbox: vi.fn(async () => h.sandbox),
}))
vi.mock('@/lib/owner-invites', async (orig) => ({
  ...(await orig<typeof import('./owner-invites')>()),
  INVITE_SPACING_MS: 0,
  loadOwnersWithoutAccount: vi.fn(async () => h.owners),
}))

function chain(log: unknown[][], table: string, result: () => unknown) {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'is', 'ilike', 'limit', 'update', 'delete', 'upsert', 'insert']) {
    b[op] = (...a: unknown[]) => (log.push([table, op, ...a]), b)
  }
  b.maybeSingle = async () => result()
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'board-1' } } }) },
    from: (t: string) =>
      chain(h.userCalls, t, () => (t === 'org_members' ? { data: [{ user_id: 'p1' }], error: null } : { data: null, error: null })),
  })),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => ({
    from: (t: string) =>
      chain(h.adminCalls, t, () => {
        if (t === 'org_members') {
          const lastSelect = [...h.adminCalls].reverse().find((c) => c[0] === 'org_members' && c[1] === 'select')
          if (lastSelect?.[2] === 'user_id') return { data: h.hereMember ? { user_id: 'existing-user' } : null, error: null }
          return { data: h.memberRole ? { role: h.memberRole } : null, error: null }
        }
        if (t === 'profiles') return { data: [{ id: 'existing-user' }], error: null }
        return { data: null, error: null }
      }),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async (email: string) => {
          const err = h.inviteErrors[email]
          if (err) return { data: { user: null }, error: err }
          h.invited.push(email)
          const created_at = h.preExisting[email] ? '2026-01-01T00:00:00Z' : new Date().toISOString()
          return { data: { user: { id: `user-${email}`, created_at } }, error: null }
        }),
        getUserById: vi.fn(async () => ({ data: { user: h.authUser }, error: null })),
        deleteUser: vi.fn(async (id: string) => (h.deleted.push(id), { error: null })),
      },
    },
  })),
}))

import { createAdminClient } from '@homeowner-portal/db'
import { INVITE_BATCH } from './owner-invites'
import { inviteAllOwners, listPendingInvitations, previewOwnerInvites, resendInvitation, revokeInvitation } from './owner-invites-actions'

const owner = (i: number, domain = 'example.com') => ({ email: `o${i}@${domain}`, name: null, unitIds: [`u${i}`, `v${i}`] })
const P1 = '11111111-1111-4111-8111-111111111111'
const savedEnv = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VERCEL_ENV = 'production'
  delete process.env.OUTBOUND_ALLOWLIST
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.owners = [owner(1), owner(2)]
  h.sandbox = false
  h.inviteErrors = {}
  h.invited = []
  h.memberRole = 'resident'
  h.authUser = { email: 'p@x.com', email_confirmed_at: null, last_sign_in_at: null }
  h.hereMember = false
  h.preExisting = {}
  h.deleted = []
  h.userCalls = []
  h.adminCalls = []
  h.linked = []
})
afterEach(() => {
  process.env = { ...savedEnv }
})

describe('board-only gate', () => {
  it('every action refuses a non-board caller before any service-role client exists', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await previewOwnerInvites()).toEqual({ ok: false, error: 'denied' })
    expect(await inviteAllOwners(2)).toEqual({ ok: false, error: 'denied' })
    expect(await resendInvitation(P1)).toEqual({ ok: false, error: 'denied' })
    expect(await revokeInvitation(P1)).toEqual({ ok: false, error: 'denied' })
    expect(await listPendingInvitations()).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('inviteAllOwners', () => {
  it('preview counts and sends nothing', async () => {
    expect(await previewOwnerInvites()).toEqual({ ok: true, data: { total: 2, held: 0, sendNow: 2, remaining: 0 } })
    expect(h.invited).toEqual([])
  })

  it('sends the confirmed batch, links every home, audits counts only', async () => {
    const r = await inviteAllOwners(2)
    expect(r).toEqual({ ok: true, data: { invited: 2, failed: 0, held: 0, remaining: 0, rateLimited: false } })
    expect(h.invited).toEqual(['o1@example.com', 'o2@example.com'])
    expect(h.linked).toHaveLength(4)
    const memberInserts = h.userCalls.filter((c) => c[0] === 'org_members' && c[1] === 'insert')
    expect(memberInserts.map((c) => (c[2] as { role: string }).role)).toEqual(['resident', 'resident'])
    const audit = h.userCalls.find((c) => c[0] === 'audit_log' && c[1] === 'insert')![2] as Record<string, unknown>
    expect(audit).toMatchObject({ action: 'members.invite_bulk', org_id: 'org-1' })
    expect(JSON.stringify(audit)).not.toMatch(/@/)
  })

  it('refuses when the list moved since the board confirmed (nothing sent)', async () => {
    expect(await inviteAllOwners(5)).toMatchObject({ ok: false })
    expect(h.invited).toEqual([])
  })

  it('the outbound guard holds back non-allowlisted owners outside production', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.OUTBOUND_ALLOWLIST = '@team.test'
    h.owners = [owner(1), owner(2, 'team.test')]
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await inviteAllOwners(1)
    spy.mockRestore()
    expect(r).toMatchObject({ ok: true, data: { invited: 1, held: 1 } })
    expect(h.invited).toEqual(['o2@team.test'])
  })

  it('a sandboxed org sends nothing', async () => {
    h.sandbox = true
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await inviteAllOwners(0)).toEqual({
      ok: true,
      data: { invited: 0, failed: 0, held: 2, remaining: 0, rateLimited: false },
    })
    spy.mockRestore()
    expect(h.invited).toEqual([])
  })

  it(`sends at most ${INVITE_BATCH} a click and stops at the first rate limit`, async () => {
    h.owners = Array.from({ length: INVITE_BATCH + 5 }, (_, i) => owner(i))
    h.inviteErrors['o3@example.com'] = { status: 429, message: 'email rate limit exceeded' }
    const r = await inviteAllOwners(INVITE_BATCH)
    expect(r).toMatchObject({ ok: true, data: { invited: 3, rateLimited: true, remaining: 5 + INVITE_BATCH - 3 } })
    expect(h.invited).toHaveLength(3)
  })

  it('SEC-N4: a confirmed account elsewhere is not attached, and is reported as invited like everyone else', async () => {
    h.inviteErrors['o1@example.com'] = { code: 'email_exists', message: 'already been registered' }
    const r = await inviteAllOwners(2)
    expect(r).toEqual({ ok: true, data: { invited: 2, failed: 0, held: 0, remaining: 0, rateLimited: false } })
    expect(JSON.stringify(r)).not.toMatch(/linked/)
    const memberInserts = h.userCalls.filter((c) => c[0] === 'org_members' && c[1] === 'insert')
    expect(memberInserts.map((c) => (c[2] as { user_id: string }).user_id)).toEqual(['user-o2@example.com'])
    expect(h.linked.map((l) => (l as { userId: string }).userId)).toEqual(['user-o2@example.com', 'user-o2@example.com'])
    expect(h.adminCalls.some((c) => c[0] === 'profiles' && c[1] === 'upsert' && (c[2] as { id: string }).id === 'existing-user')).toBe(false)
  })

  it('SEC-N4: a confirmed account that is already a member here gets its homes linked (same uniform count)', async () => {
    h.inviteErrors['o1@example.com'] = { code: 'email_exists', message: 'already been registered' }
    h.hereMember = true
    const r = await inviteAllOwners(2)
    expect(r).toMatchObject({ ok: true, data: { invited: 2, failed: 0 } })
    expect(h.linked.filter((l) => (l as { userId: string }).userId === 'existing-user')).toHaveLength(2)
  })

  it('SEC-N1: a new account gets its profile written; a pre-existing (unconfirmed) one is left untouched', async () => {
    h.preExisting['o1@example.com'] = true
    await inviteAllOwners(2)
    const upserts = h.adminCalls.filter((c) => c[0] === 'profiles' && c[1] === 'upsert').map((c) => (c[2] as { id: string }).id)
    expect(upserts).toEqual(['user-o2@example.com'])
  })
})

describe('resend / revoke', () => {
  it('resend re-sends the invitation through the guard', async () => {
    expect(await resendInvitation(P1)).toEqual({ ok: true, data: { sent: true } })
  })

  it('resend is refused in test mode for a non-allowlisted address', async () => {
    process.env.VERCEL_ENV = 'preview'
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await resendInvitation(P1)).ok).toBe(false)
    spy.mockRestore()
    const admin = vi.mocked(createAdminClient).mock.results[0]!.value as { auth: { admin: { inviteUserByEmail: ReturnType<typeof vi.fn> } } }
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('refuses someone who already joined, and a board member acting on a board invitation', async () => {
    h.authUser = { email: 'p@x.com', email_confirmed_at: '2026-10-01' }
    expect((await resendInvitation(P1)).ok).toBe(false)
    expect((await revokeInvitation(P1)).ok).toBe(false)
    h.authUser = { email: 'p@x.com' }
    h.memberRole = 'board'
    expect(await revokeInvitation(P1)).toMatchObject({ ok: false, error: expect.stringMatching(/resident/) })
    h.memberRole = null
    expect((await revokeInvitation(P1)).ok).toBe(false)
    expect(h.deleted).toEqual([])
  })

  it('revoke removes the membership and unlinks this HOA’s homes, and never deletes the account (SEC-N1)', async () => {
    expect(await revokeInvitation(P1)).toEqual({ ok: true, data: { revoked: true } })
    expect(h.userCalls.some((c) => c[0] === 'org_members' && c[1] === 'delete')).toBe(true)
    expect(h.adminCalls).toContainEqual(['ownerships', 'update', { owner_user_id: null }])
    expect(h.deleted).toEqual([])
    const admin = vi.mocked(createAdminClient).mock.results[0]!.value as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } }
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('revoke by an admin of a pending admin-role invitation still never deletes the account', async () => {
    h.gate = { ok: true, role: 'admin', orgId: 'org-1' }
    h.memberRole = 'admin'
    expect((await revokeInvitation(P1)).ok).toBe(true)
    expect(h.deleted).toEqual([])
  })

  it('rejects a malformed id', async () => {
    expect((await resendInvitation('nope')).ok).toBe(false)
    expect((await revokeInvitation('nope')).ok).toBe(false)
  })
})
