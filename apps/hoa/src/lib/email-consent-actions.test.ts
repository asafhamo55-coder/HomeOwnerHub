import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-020 server actions: inert until M1_APPLIED; with it on, a member
// writes only their own 'portal' row, the board only 'written'/'email'
// rows for a member of its own org.

const m1 = vi.hoisted(() => ({ value: false }))
vi.mock('@homeowner-portal/db/m1', () => ({
  get M1_APPLIED() {
    return m1.value
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const gate = vi.hoisted(() => ({ value: { ok: true, role: 'board', orgId: 'org-1' } as { ok: boolean; role?: string; orgId?: string; error?: string } }))
vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'denied', requireBoardOrAdminForAction: vi.fn(async () => gate.value) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
const actor = vi.hoisted(() => ({ impersonating: false }))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: vi.fn(async () => actor) }))

const ME = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'

const inserts: unknown[] = []
const insertResult = { error: null as { code: string } | null }
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: ME } } }) },
    from: (table: string) => ({
      insert: async (row: unknown) => {
        inserts.push([table, row])
        return insertResult
      },
    }),
  }),
}))
const membership = vi.hoisted(() => ({ data: { user_id: 'x' } as unknown, error: null as unknown }))
const memberQueries: unknown[][] = []
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => {
    const b: Record<string, unknown> = {}
    for (const op of ['from', 'select', 'eq']) {
      b[op] = (...args: unknown[]) => {
        memberQueries.push([op, ...args])
        return b
      }
    }
    b.maybeSingle = async () => membership
    return b
  },
}))

const { setMyEmailConsent, recordMemberEmailConsent } = await import('./email-consent-actions')

beforeEach(() => {
  m1.value = false
  inserts.length = 0
  memberQueries.length = 0
  insertResult.error = null
  actor.impersonating = false
  gate.value = { ok: true, role: 'board', orgId: 'org-1' }
  membership.data = { user_id: MEMBER }
  membership.error = null
})

describe('setMyEmailConsent', () => {
  it('flag off: refuses and writes nothing', async () => {
    expect(await setMyEmailConsent(true)).toEqual({ ok: false, error: expect.stringContaining('isn’t available') })
    expect(inserts).toEqual([])
  })

  it('flag on: appends my own portal row', async () => {
    m1.value = true
    expect(await setMyEmailConsent(false)).toEqual({ ok: true })
    expect(inserts).toEqual([
      ['member_email_consent_events', { organization_id: 'org-1', user_id: ME, recorded_by: ME, granted: false, method: 'portal' }],
    ])
  })

  it('refuses while a board member views as the resident', async () => {
    m1.value = true
    actor.impersonating = true
    expect((await setMyEmailConsent(true)).ok).toBe(false)
    expect(inserts).toEqual([])
  })

  it('a failed write is a friendly error, not the database code', async () => {
    m1.value = true
    insertResult.error = { code: '42501' }
    const r = await setMyEmailConsent(true)
    expect(r).toEqual({ ok: false, error: 'Couldn’t save the consent. Try again.' })
  })
})

describe('recordMemberEmailConsent', () => {
  const input = { userId: MEMBER, granted: true, method: 'written' as const }

  it('flag off: refuses before the gate or any read', async () => {
    expect((await recordMemberEmailConsent(input)).ok).toBe(false)
    expect(memberQueries).toEqual([])
    expect(inserts).toEqual([])
  })

  it('residents are refused by the board gate', async () => {
    m1.value = true
    gate.value = { ok: false, error: 'denied' }
    expect(await recordMemberEmailConsent(input)).toEqual({ ok: false, error: 'denied' })
    expect(inserts).toEqual([])
  })

  it('only written or email', async () => {
    m1.value = true
    expect((await recordMemberEmailConsent({ ...input, method: 'portal' as never })).ok).toBe(false)
    expect(inserts).toEqual([])
  })

  it('refuses a person outside the org', async () => {
    m1.value = true
    membership.data = null
    expect(await recordMemberEmailConsent(input)).toEqual({ ok: false, error: 'That person isn’t a member of this HOA.' })
    expect(memberQueries).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(inserts).toEqual([])
  })

  it('records the member’s consent as the board user', async () => {
    m1.value = true
    expect(await recordMemberEmailConsent({ ...input, method: 'email', granted: false })).toEqual({ ok: true })
    expect(inserts).toEqual([
      ['member_email_consent_events', { organization_id: 'org-1', user_id: MEMBER, recorded_by: ME, granted: false, method: 'email' }],
    ])
  })
})
