import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-028: inspection mode creates W3 drafts through this route with the
// photo keys it uploaded. Only the caller's own org's keys may ride on the
// draft — approving signs and files them on the violation.

const ORG = '0f0f0f0f-0000-4000-8000-000000000001'
const OTHER_ORG = '0f0f0f0f-0000-4000-8000-000000000002'

// BL-104: the shared board AI ceiling is tested in lib/api/rate-limit.test.ts.
vi.mock('@/lib/api/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/rate-limit')>()),
  requireAiQuota: vi.fn(async () => ({ usageId: null, userId: 'user-1' })),
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({ role: 'board', org: { id: ORG, name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } })),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } })) },
    from: vi.fn(() => {
      const q: Record<string, unknown> = {}
      let id = ''
      q.select = vi.fn(() => q)
      q.eq = vi.fn((col: string, v: string) => {
        if (col === 'id') id = v
        return q
      })
      q.maybeSingle = vi.fn(async () => ({ data: { id }, error: null }))
      return q
    }),
  })),
}))

const execute = vi.hoisted(() => vi.fn())
vi.mock('@homeowner-portal/workflows/W3', () => ({ violationInspector: { execute } }))

import { POST } from './route'

const UNIT = '11111111-1111-4111-8111-111111111111'
const key = (org: string, n = 1) => `${org}/1760000000000-1111111${n}-1111-4111-8111-111111111111.jpg`
const GOOD = { unitId: UNIT, violationType: 'Lawn / landscaping', description: 'Lawn / landscaping: grass over a foot tall.' }

function req(body: unknown): Request {
  return new Request('http://x/api/ai/violations/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  execute.mockReset()
  execute.mockResolvedValue({ runId: 'run-1', output: { notice: 'Dear owner' }, status: 'pending_human_approval', citations: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/violations/draft — photo keys (BL-028)', () => {
  it('passes the org’s own photo keys to W3, so they are staged on the run', async () => {
    const res = await POST(req({ ...GOOD, photoPaths: [key(ORG, 1), key(ORG, 2)] }))
    expect(res.status).toBe(200)
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: UNIT, photoPaths: [key(ORG, 1), key(ORG, 2)] }),
      { organizationId: ORG },
    )
  })

  it('another org’s key → 400 validation_failed on photoPaths, W3 never runs', async () => {
    const res = await POST(req({ ...GOOD, photoPaths: [key(ORG, 1), key(OTHER_ORG, 2)] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; issues: Array<{ path: string }> } }
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues.map((i) => i.path)).toEqual(['photoPaths'])
    expect(execute).not.toHaveBeenCalled()
  })

  it('a made-up path → 400, W3 never runs', async () => {
    const res = await POST(req({ ...GOOD, photoPaths: ['../../etc/passwd'] }))
    expect(res.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('more than 10 photos → 400', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `${ORG}/1760000000000-${String(i).padStart(8, '0')}-1111-4111-8111-111111111111.jpg`)
    const res = await POST(req({ ...GOOD, photoPaths: many }))
    expect(res.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('no photos is still fine (the wizard’s path is unchanged)', async () => {
    const res = await POST(req(GOOD))
    expect(res.status).toBe(200)
    expect(execute.mock.calls[0]![0]).not.toHaveProperty('photoPaths')
  })
})
