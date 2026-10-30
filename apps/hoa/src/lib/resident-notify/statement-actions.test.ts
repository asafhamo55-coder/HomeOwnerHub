import { beforeEach, describe, expect, it, vi } from 'vitest'

// The board action behind "Email to owner". A public POST endpoint, so it
// must refuse a non-board caller before reading or sending anything. The
// runner is faked: no test reaches a transport.

const PROPERTY = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as Record<string, unknown>,
  run: vi.fn(async (..._a: unknown[]) => ({ status: 'sent' }) as Record<string, unknown>),
  client: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => {
    h.client()
    return { auth: { getUser: async () => ({ data: { user: { id: 'board-1' } } }) } }
  },
}))
vi.mock('./deps', () => ({ residentNotifyDeps: {} }))
vi.mock('./statement-store', () => ({ supabaseStatementEmailStore: () => ({}) }))
vi.mock('./statement-run', () => ({ runStatementEmail: h.run }))

import { emailStatementToOwner } from './statement-actions'

const good = { propertyId: PROPERTY, from: '2025-10-01', to: '2026-10-01' }

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.run.mockClear()
  h.run.mockResolvedValue({ status: 'sent' })
  h.client.mockClear()
})

describe('emailStatementToOwner', () => {
  it('refuses a resident before any client or send', async () => {
    h.gate = { ok: false, error: 'denied' }
    const r = await emailStatementToOwner(good)
    expect(r).toMatchObject({ ok: false, status: 'forbidden' })
    expect(h.client).not.toHaveBeenCalled()
    expect(h.run).not.toHaveBeenCalled()
  })

  it('rejects bad input without sending', async () => {
    for (const bad of [{ ...good, propertyId: 'nope' }, { ...good, from: '2025-02-30' }, { ...good, to: 'x' }]) {
      expect(await emailStatementToOwner(bad)).toMatchObject({ ok: false, status: 'invalid' })
    }
    expect(h.run).not.toHaveBeenCalled()
  })

  it('scopes the run to the caller org and role, and passes no address from the client', async () => {
    const hostile = { ...good, email: 'attacker@evil.test', organizationId: 'other-org' } as typeof good
    await emailStatementToOwner(hostile)
    const event = h.run.mock.calls[0]![2] as Record<string, unknown>
    expect(event).toEqual({
      propertyId: PROPERTY,
      from: '2025-10-01',
      to: '2026-10-01',
      actorUserId: 'board-1',
      actorRole: 'board',
      organizationId: 'org-1',
    })
  })

  it('swaps an inverted period', async () => {
    await emailStatementToOwner({ ...good, from: '2026-10-01', to: '2025-10-01' })
    expect(h.run.mock.calls[0]![2]).toMatchObject({ from: '2025-10-01', to: '2026-10-01' })
  })

  it.each([
    ['sent', true, 'Statement sent'],
    ['held', true, 'test mode'],
    ['opted_out', false, 'This owner has turned off email from the association.'],
    ['duplicate', false, 'already emailed in the last 24 hours'],
    ['no_email', false, 'no email address on file'],
  ])('reports %s plainly', async (status, ok, text) => {
    h.run.mockResolvedValue({ status })
    const r = await emailStatementToOwner(good)
    expect(r.ok).toBe(ok)
    expect(JSON.stringify(r)).toContain(text)
    expect(JSON.stringify(r)).not.toContain('—')
  })
})
