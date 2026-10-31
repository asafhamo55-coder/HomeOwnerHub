import { describe, expect, it, vi } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

let failing = false
let rows: Record<string, unknown>[] = []
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () =>
    cappedFakeDb({ associations: rows }, failing ? { failAt: { table: 'associations' } } : {}).db,
}))

const { getLeaseCap } = await import('./leases')

describe('getLeaseCap', () => {
  it('a failed read is ok:false, not "no cap"', async () => {
    failing = true
    rows = [{ id: 'as1', lease_cap_pct: 25 }]
    expect(await getLeaseCap('as1')).toEqual({ ok: false })
  })
  it('a set cap is returned', async () => {
    failing = false
    rows = [{ id: 'as1', lease_cap_pct: '25', lease_cap_ai_suggested_pct: null }]
    const r = await getLeaseCap('as1')
    expect(r.ok && r.cap?.capPct).toBe(25)
  })
  it('a missing association is ok with cap null', async () => {
    failing = false
    rows = []
    expect(await getLeaseCap('as1')).toEqual({ ok: true, cap: null })
  })
})
