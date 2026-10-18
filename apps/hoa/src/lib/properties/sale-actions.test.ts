import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

const h = vi.hoisted(() => ({
  gate: vi.fn(async (): Promise<unknown> => ({ ok: true, role: 'board', orgId: 'org-1' })),
  getClient: vi.fn(async (): Promise<unknown> => {
    throw new Error('must not build a client before the gate')
  }),
}))

vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'denied', requireBoardOrAdminForAction: h.gate }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: h.getClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { recordPropertySale } from './sale-actions'

// Synthetic ids and people.
const PID = '11111111-1111-4111-8111-111111111111'

function lot() {
  return memorySupabase({
    associations: [{ id: 'a1', organization_id: 'org-1', name: 'A', state: 'FL' }],
    hoa_properties: [{ id: PID, org_id: 'org-1', address: '1 Test Way', owner_name: 'Seller', owner_email: 'seller@example.test', owner_phone: null, tenure: 'owner_occupied', deleted_at: null }],
    units: [{ id: 'u1', organization_id: 'org-1', legacy_hoa_property_id: PID, created_at: '2026-01-01T00:00:00Z' }],
    ownerships: [{ id: 'o1', organization_id: 'org-1', unit_id: 'u1', owner_user_id: 'seller-user', owner_email: 'seller@example.test', valid_from: '2019-01-01', valid_to: null }],
    property_residents: [{ id: 'r1', organization_id: 'org-1', property_id: PID, full_name: 'Seller', email: 'seller@example.test', role: 'owner', moved_out_at: null, deleted_at: null }],
  })
}

const SALE = {
  settlementDate: '2026-01-15',
  buyers: [{ name: 'Buyer One', email: 'buyer@example.test' }],
  carryTenants: false,
  addBuyersAsResidents: true,
}

beforeEach(() => {
  h.gate.mockClear()
  h.getClient.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('recordPropertySale', () => {
  it('a resident is refused before any client is built', async () => {
    h.gate.mockResolvedValueOnce({ ok: false, error: 'denied' })
    expect(await recordPropertySale(PID, SALE)).toEqual({ ok: false, error: 'denied' })
    expect(h.getClient).not.toHaveBeenCalled()
  })

  it('a malformed id is not found, before any client is built', async () => {
    expect(await recordPropertySale('not-a-uuid', SALE)).toEqual({ ok: false, error: 'Property not found.' })
    expect(h.getClient).not.toHaveBeenCalled()
  })

  it('records the sale in the caller’s org and says who can be invited next', async () => {
    const m = lot()
    h.getClient.mockResolvedValueOnce(m.client)
    const r = await recordPropertySale(PID, SALE)
    expect(r).toEqual({
      ok: true,
      data: { buyers: [{ name: 'Buyer One', email: 'buyer@example.test', listed: true }], movedOut: 1, leasesEnded: 0, tenureReset: true },
    })
    expect(m.rows('ownerships').find((o) => o.id === 'o1')).toMatchObject({ valid_to: '2026-01-15' })
    expect(m.rows('ownerships').find((o) => o.source === 'sale')).toMatchObject({ valid_from: '2026-01-15', created_by: 'user-1' })
  })

  it('a future settlement date comes back as a field error (validated against the association’s today), nothing written', async () => {
    const m = lot()
    h.getClient.mockResolvedValueOnce(m.client)
    const r = await recordPropertySale(PID, { ...SALE, settlementDate: '2999-01-01' })
    expect(r).toMatchObject({ ok: false, fieldErrors: { settlementDate: expect.stringContaining('future') } })
    expect(m.calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('a repeat of the seller lands on the buyer’s email field', async () => {
    const m = lot()
    h.getClient.mockResolvedValueOnce(m.client)
    const r = await recordPropertySale(PID, { ...SALE, buyers: [{ name: 'Seller', email: 'seller@example.test' }] })
    expect(r).toMatchObject({ ok: false, fieldErrors: { 'buyers.0.email': expect.any(String) } })
  })

  it('a database failure is a plain sentence, never database text', async () => {
    const m = memorySupabase(
      {},
      { failOn: (c) => (c.table === 'hoa_properties' ? { code: '42501', message: 'permission denied for table hoa_properties' } : null) },
    )
    h.getClient.mockResolvedValueOnce(m.client)
    const r = await recordPropertySale(PID, SALE)
    expect(r).toEqual({ ok: false, error: 'Couldn’t load the property. Try again.' })
  })
})
