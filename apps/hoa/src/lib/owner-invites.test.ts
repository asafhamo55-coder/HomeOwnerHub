import { describe, expect, it, vi } from 'vitest'
import {
  INVITE_BATCH,
  groupOwners,
  isAlreadyRegistered,
  isPendingInvite,
  isRateLimited,
  loadPendingInvitations,
  planOwnerInvites,
} from './owner-invites'

// BL-128: who gets invited, what the outbound guard holds back, and what
// counts as a pending invitation.

describe('groupOwners', () => {
  it('one invitation per address across homes; members and bad addresses dropped', () => {
    const owners = groupOwners(
      [
        { unit_id: 'u1', owner_email: 'Ann@Example.com ', owner_name: 'Ann' },
        { unit_id: 'u2', owner_email: 'ann@example.com', owner_name: null },
        { unit_id: 'u3', owner_email: 'member@example.com', owner_name: 'Member' },
        { unit_id: 'u4', owner_email: 'not-an-email', owner_name: 'Typo' },
        { unit_id: 'u5', owner_email: null, owner_name: 'No email' },
      ],
      new Set(['member@example.com']),
    )
    expect(owners).toEqual([{ email: 'ann@example.com', name: 'Ann', unitIds: ['u1', 'u2'] }])
  })
})

const owners = (n: number, domain = 'example.com') =>
  Array.from({ length: n }, (_, i) => ({ email: `o${String(i).padStart(3, '0')}@${domain}`, name: null, unitIds: [`u${i}`] }))

describe('planOwnerInvites (outbound guard + batching)', () => {
  it('production, not sandboxed: everyone allowed, one batch now, the rest later', () => {
    const plan = planOwnerInvites(owners(INVITE_BATCH + 7), { orgSandbox: false, env: { VERCEL_ENV: 'production' } })
    expect(plan).toMatchObject({ total: INVITE_BATCH + 7, held: 0, remaining: 7 })
    expect(plan.batch).toHaveLength(INVITE_BATCH)
  })

  it('outside production only allowlisted addresses are sent', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = [...owners(3), { email: 'me@team.test', name: null, unitIds: ['x'] }]
    const plan = planOwnerInvites(list, { orgSandbox: false, env: { VERCEL_ENV: 'preview', OUTBOUND_ALLOWLIST: '@team.test' } })
    expect(plan.batch.map((o) => o.email)).toEqual(['me@team.test'])
    expect(plan.held).toBe(3)
    // The guard's log line carries counts, never an address.
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/example\.com|team\.test/)
    spy.mockRestore()
  })

  it('a sandboxed org in production sends nothing that is not allowlisted', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const plan = planOwnerInvites(owners(4), { orgSandbox: true, env: { VERCEL_ENV: 'production' } })
    expect(plan).toMatchObject({ total: 4, held: 4, remaining: 0 })
    expect(plan.batch).toEqual([])
    spy.mockRestore()
  })
})

describe('pending invitations', () => {
  it('pending = never confirmed and never signed in', () => {
    expect(isPendingInvite({ invited_at: 'x', email_confirmed_at: null, last_sign_in_at: null })).toBe(true)
    expect(isPendingInvite({ email_confirmed_at: '2026-10-01' })).toBe(false)
    expect(isPendingInvite({ last_sign_in_at: '2026-10-01' })).toBe(false)
    expect(isPendingInvite(null)).toBe(false)
  })

  it('lists only members whose auth user is pending; an unreadable user is left out', async () => {
    const rows = [
      { user_id: 'p1', role: 'resident', invited_at: '2026-10-02T00:00:00Z', joined_at: null, profile: { email: 'p1@x.com', full_name: 'P One' } },
      { user_id: 'j1', role: 'resident', invited_at: '2026-10-01T00:00:00Z', joined_at: null, profile: { email: 'j1@x.com', full_name: null } },
      { user_id: 'e1', role: 'board', invited_at: null, joined_at: null, profile: null },
    ]
    const eqs: unknown[][] = []
    const admin = {
      from: () => {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = (...a: unknown[]) => (eqs.push(a), b)
        b.is = async () => ({ data: rows, error: null })
        return b
      },
      auth: {
        admin: {
          getUserById: async (id: string) =>
            id === 'p1'
              ? { data: { user: { invited_at: 'x', email_confirmed_at: null, last_sign_in_at: null } }, error: null }
              : id === 'j1'
                ? { data: { user: { email_confirmed_at: '2026-10-03' } }, error: null }
                : { data: null, error: { message: 'boom' } },
        },
      },
    }
    const pending = await loadPendingInvitations(admin, 'org-1')
    expect(eqs).toEqual([['org_id', 'org-1']])
    expect(pending).toEqual([{ userId: 'p1', email: 'p1@x.com', name: 'P One', role: 'resident', invitedAt: '2026-10-02T00:00:00Z' }])
  })

  it('a failed member read is null, not "no invitations"', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = {
      from: () => {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = () => b
        b.is = async () => ({ data: null, error: { code: '57014' } })
        return b
      },
      auth: { admin: { getUserById: vi.fn() } },
    }
    expect(await loadPendingInvitations(admin, 'org-1')).toBeNull()
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('GoTrue error shapes', () => {
  it('recognises already-registered and rate limits', () => {
    expect(isAlreadyRegistered({ code: 'email_exists' })).toBe(true)
    expect(isAlreadyRegistered({ message: 'A user with this email address has already been registered' })).toBe(true)
    expect(isAlreadyRegistered({ message: 'boom' })).toBe(false)
    expect(isRateLimited({ status: 429 })).toBe(true)
    expect(isRateLimited({ code: 'over_email_send_rate_limit' })).toBe(true)
    expect(isRateLimited({ message: 'boom' })).toBe(false)
  })
})
