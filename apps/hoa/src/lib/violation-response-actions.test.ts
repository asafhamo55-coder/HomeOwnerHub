import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-129: the action's own gates, before the shared core
// (violation-response.test.ts covers own-home vs cross-home).

const h = vi.hoisted(() => ({
  impersonating: false,
  user: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null,
  units: [{ unit_id: 'unit-1', association_id: 'assoc-1' }] as Array<{ unit_id: string; association_id: string | null }>,
  sent: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/impersonation', () => ({
  IMPERSONATION_READONLY_MSG: 'read only',
  getResidentActor: vi.fn(async () => ({ impersonating: h.impersonating })),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
vi.mock('@/lib/resident', () => ({ getResidentUnits: vi.fn(async () => h.units) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) }, tag: 'resident' })),
}))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => ({ tag: 'admin' })) }))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn(async (e: unknown) => h.sent.push(e)) } }))
vi.mock('@/lib/violation-response', () => ({
  postViolationResponse: vi.fn(async (deps: { notifyBoard: (id: string) => Promise<void> }) => {
    await deps.notifyBoard('t-1')
    return { ok: true, ticketId: 't-1', created: true }
  }),
}))

import { createAdminClient } from '@homeowner-portal/db'
import { postViolationResponse } from '@/lib/violation-response'
import { respondToMyViolation } from './violation-response-actions'

const V = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  h.impersonating = false
  h.user = { id: '11111111-1111-4111-8111-111111111111' }
  h.units = [{ unit_id: 'unit-1', association_id: 'assoc-1' }]
  h.sent = []
})

describe('respondToMyViolation', () => {
  it('posts as the signed-in resident with their own units, then tells the board as a ticket', async () => {
    expect(await respondToMyViolation(V, '  Fixed it.  ')).toEqual({ ok: true, ticketId: 't-1' })
    const [deps, input] = vi.mocked(postViolationResponse).mock.calls[0]!
    expect((deps.db as unknown as { tag: string }).tag).toBe('resident')
    expect(input).toMatchObject({ violationId: V, body: 'Fixed it.', userId: h.user!.id, orgId: 'org-1', unitIds: ['unit-1'] })
    expect(input.associationIdOf('unit-1')).toBe('assoc-1')
    expect(h.sent).toEqual([{ name: 'ticket/created', data: { ticketId: 't-1', organizationId: 'org-1' } }])
  })

  it('refuses an impersonating admin before anything else', async () => {
    h.impersonating = true
    expect(await respondToMyViolation(V, 'x')).toEqual({ ok: false, error: 'read only' })
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(postViolationResponse).not.toHaveBeenCalled()
  })

  it('refuses a bad id, an empty body, a signed-out caller and a resident with no home', async () => {
    expect((await respondToMyViolation('not-a-uuid', 'x')).ok).toBe(false)
    expect(await respondToMyViolation(V, '   ')).toMatchObject({ ok: false, fieldErrors: { body: expect.any(String) } })
    h.user = null
    expect((await respondToMyViolation(V, 'x')).ok).toBe(false)
    h.user = { id: 'u' }
    h.units = []
    expect((await respondToMyViolation(V, 'x')).ok).toBe(false)
    expect(postViolationResponse).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('passes a refusal through unchanged', async () => {
    vi.mocked(postViolationResponse).mockResolvedValueOnce({ ok: false, error: 'We couldn’t find that notice on your home.' })
    expect(await respondToMyViolation(V, 'x')).toEqual({ ok: false, error: 'We couldn’t find that notice on your home.' })
  })
})
