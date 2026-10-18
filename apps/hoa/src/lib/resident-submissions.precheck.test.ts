import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-078 — createArcRequest only forwards a pre-check run id to the board's
// W37 review after bindPrecheckRun has proven it is this resident's own
// pre-check in this org. bindPrecheckRun itself is tested on its own
// (lib/arc-review/precheck-binding.test.ts); here it is mocked to pin the
// wiring: what it is asked, and that only its answer reaches the review.

const UNIT = '11111111-1111-4111-8111-111111111111'
const RUN = '55555555-5555-4555-8555-555555555555'

const h = vi.hoisted(() => ({
  afterFns: [] as Array<() => unknown>,
  bind: vi.fn(),
  startReview: vi.fn(),
  admin: { tag: 'admin-client' },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void h.afterFns.push(fn) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'HOA', hub_type: 'hoa' })) }))
vi.mock('@/lib/resident', () => ({ getResidentUnits: vi.fn(async () => [{ unit_id: UNIT, association_id: 'assoc-1' }]) }))
vi.mock('@/lib/impersonation', () => ({
  getResidentActor: vi.fn(async () => ({ impersonating: false })),
  IMPERSONATION_READONLY_MSG: 'read only',
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const q = {
      insert: () => q,
      select: () => q,
      single: async () => ({ data: { id: 'arc-1' }, error: null }),
    }
    return { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }, from: () => q }
  }),
}))
vi.mock('@/lib/arc-review/server', () => ({ startBoardArcReview: h.startReview, closeArcReviewsOnWithdraw: vi.fn() }))
vi.mock('@/lib/arc-review/precheck-binding', () => ({ bindPrecheckRun: h.bind }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => h.admin }))

const { createArcRequest } = await import('./resident-submissions')

const INPUT = {
  unitId: UNIT,
  category: 'fence' as const,
  summary: 'Replace rear fence',
  scopeDescription: 'Six foot white vinyl privacy fence on the rear line.',
}

beforeEach(() => {
  h.afterFns = []
  h.bind.mockReset()
  h.startReview.mockReset()
})

async function submitAndRunAfter(precheckRunId: string | null) {
  const r = await createArcRequest({ ...INPUT, precheckRunId })
  for (const fn of h.afterFns) await fn()
  return r
}

describe('createArcRequest — pre-check run binding (BL-078)', () => {
  it('asks bindPrecheckRun with the signed-in user and current org, and forwards a bound id', async () => {
    h.bind.mockResolvedValue({ runId: RUN, reason: 'ok' })
    const r = await submitAndRunAfter(RUN)
    expect(r).toEqual({ ok: true, data: { requestId: 'arc-1' } })
    expect(h.bind).toHaveBeenCalledWith(h.admin, { runId: RUN, orgId: 'org-1', userId: 'user-1' })
    expect(h.startReview).toHaveBeenCalledWith({ orgId: 'org-1', arcId: 'arc-1', precheckRunId: RUN })
  })

  it('a run id that is not this resident’s is dropped: the application still submits, the review gets null', async () => {
    h.bind.mockResolvedValue({ runId: null, reason: 'not_owner' })
    const r = await submitAndRunAfter(RUN)
    expect(r.ok).toBe(true)
    expect(h.startReview).toHaveBeenCalledWith({ orgId: 'org-1', arcId: 'arc-1', precheckRunId: null })
  })

  it('no run id: still asks (it answers "none"), review gets null', async () => {
    h.bind.mockResolvedValue({ runId: null, reason: 'none' })
    await submitAndRunAfter(null)
    expect(h.bind).toHaveBeenCalledWith(h.admin, { runId: null, orgId: 'org-1', userId: 'user-1' })
    expect(h.startReview).toHaveBeenCalledWith(expect.objectContaining({ precheckRunId: null }))
  })
})
