import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

const h = vi.hoisted(() => ({
  gate: vi.fn(async (): Promise<unknown> => ({ ok: true, role: 'board', orgId: 'org-1' })),
  client: null as unknown,
  getClient: vi.fn(async (): Promise<unknown> => {
    throw new Error('must not build a client before the gate')
  }),
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: h.gate,
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: h.getClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createProperty, deleteProperty, updateProperty } from './index'

const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}

beforeEach(() => {
  h.gate.mockClear()
  h.getClient.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createProperty', () => {
  it('creates both sides and returns the new property’s page (not /properties)', async () => {
    const m = memorySupabase({ associations: [{ id: 'assoc-1', organization_id: 'org-1', name: 'A', state: 'GA' }] })
    h.getClient.mockResolvedValueOnce(m.client)

    const r = await createProperty({}, form({ address: '1 Test Way', owner_email: 'one@example.test' }))

    const [prop] = m.rows('hoa_properties')
    expect(r).toEqual({ created: { href: `/properties/${prop.id}` } })
    expect(m.rows('units')[0]).toMatchObject({ association_id: 'assoc-1', legacy_hoa_property_id: prop.id })
    expect(m.rows('ownerships')).toHaveLength(1)
  })

  it('asks for a community when the org has several', async () => {
    const m = memorySupabase({
      associations: [
        { id: 'a1', organization_id: 'org-1', name: 'A' },
        { id: 'a2', organization_id: 'org-1', name: 'B' },
      ],
    })
    h.getClient.mockResolvedValueOnce(m.client)
    const r = await createProperty({}, form({ address: '1 Test Way' }))
    expect(r).toMatchObject({ fieldErrors: { association_id: expect.any(String) } })
    expect(m.rows('hoa_properties')).toHaveLength(0)
  })

  it('a failure returns a generic message, never the database text', async () => {
    const m = memorySupabase({}, { failOn: (c) => (c.table === 'hoa_properties' ? { code: '23505', message: 'dup (address)=(1 Test Way)' } : null) })
    h.getClient.mockResolvedValueOnce(m.client)
    const r = await createProperty({}, form({ address: '1 Test Way' }))
    expect(r).toEqual({ error: 'Couldn’t add the property. Try again.' })
  })
})

describe('board gate runs before any client', () => {
  it('createProperty / updateProperty / deleteProperty refuse a resident without a client', async () => {
    h.gate.mockResolvedValue({ ok: false, error: 'denied' })
    expect(await createProperty({}, form({ address: '1 Test Way' }))).toEqual({ error: 'denied' })
    expect(await updateProperty('p1', { address: '2 Test Way' })).toEqual({ ok: false, error: 'denied' })
    await expect(deleteProperty('p1')).rejects.toThrow('denied')
    expect(h.getClient).not.toHaveBeenCalled()
    h.gate.mockResolvedValue({ ok: true, role: 'board', orgId: 'org-1' })
  })
})
