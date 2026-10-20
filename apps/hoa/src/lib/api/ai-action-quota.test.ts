import { beforeEach, describe, expect, it, vi } from 'vitest'

// M-1: chargeAiActionQuota refuses non-board callers for the board
// buckets (board_ai, compose) before anything is counted — fail closed,
// even if the calling action forgot its own gate.

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null | 'throw',
  record: vi.fn(async () => ({ limit: 10, remaining: 9 })),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRoleInOrg: vi.fn(async () => {
    if (h.role === 'throw') throw new Error('membership read failed')
    return h.role
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  })),
}))
vi.mock('./rate-limit', () => ({ checkAndRecordAiUsage: h.record }))

const { chargeAiActionQuota } = await import('./ai-action-quota')
const { BOARD_ONLY_DENIED } = await import('@/lib/accounting/guard')

beforeEach(() => {
  h.role = 'board'
  h.record.mockClear()
})

describe('chargeAiActionQuota role check', () => {
  for (const bucket of ['board_ai', 'compose'] as const) {
    it(`${bucket}: a resident is refused before anything is recorded`, async () => {
      h.role = 'resident'
      expect(await chargeAiActionQuota(bucket, 'org-1')).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
      expect(h.record).not.toHaveBeenCalled()
    })

    it(`${bucket}: no membership in that org is refused`, async () => {
      h.role = null
      expect(await chargeAiActionQuota(bucket, 'org-2')).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
      expect(h.record).not.toHaveBeenCalled()
    })

    it(`${bucket}: a failed role read fails closed`, async () => {
      h.role = 'throw'
      expect(await chargeAiActionQuota(bucket, 'org-1')).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
      expect(h.record).not.toHaveBeenCalled()
    })

    it(`${bucket}: board is charged`, async () => {
      const res = await chargeAiActionQuota(bucket, 'org-1')
      expect(res.ok).toBe(true)
      expect(h.record).toHaveBeenCalledWith(bucket, { orgId: 'org-1', userId: 'user-1' })
    })
  }

  it('resident buckets are not role-checked here', async () => {
    h.role = 'resident'
    expect((await chargeAiActionQuota('ask_docs', 'org-1')).ok).toBe(true)
  })
})
