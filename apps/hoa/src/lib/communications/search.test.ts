import { beforeEach, describe, expect, it, vi } from 'vitest'
import { communicationsHref, normalizeSearchTerm, recentCutoff, subjectSearchPattern } from './search'

type Call = [string, ...unknown[]]
let calls: Call[] = []
let tableCalls: string[] = []
let result: { data: unknown[]; error: unknown; count: number }

function builder(): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'in', 'ilike', 'order', 'range']) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return b
    }
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    from: (t: string) => {
      tableCalls.push(t)
      return builder()
    },
  }),
}))
vi.mock('@/lib/load-or-fail', () => ({
  loadOrFail: async (_w: string, q: PromiseLike<{ data: unknown; error: unknown; count?: number }>) => {
    const r = await q
    return r.error ? { ok: false } : { ok: true, data: r.data, count: r.count ?? null }
  },
}))

import { getCommunicationsStrip, listCommunications } from './queries'

beforeEach(() => {
  calls = []
  tableCalls = []
  result = { data: [], error: null, count: 0 }
})

describe('subjectSearchPattern', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(subjectSearchPattern('50%_off\\')).toBe('%50\\%\\_off\\\\%')
  })
  it('strips characters that break a PostgREST filter', () => {
    expect(subjectSearchPattern('a,b(c)"d')).toBe('%a b c d%')
  })
  it('is null for blank input and caps length', () => {
    expect(subjectSearchPattern('   ')).toBeNull()
    expect(subjectSearchPattern(undefined)).toBeNull()
    expect(normalizeSearchTerm('x'.repeat(200))).toHaveLength(80)
  })
})

describe('communicationsHref', () => {
  it('keeps category, status, q and omits page 1', () => {
    expect(communicationsHref({ category: 'dues', status: 'sent', q: 'pool', page: 1 })).toBe(
      '/communications?category=dues&status=sent&q=pool',
    )
    expect(communicationsHref({ q: 'a b', page: 3 })).toBe('/communications?q=a+b&page=3')
    expect(communicationsHref({})).toBe('/communications')
  })
})

describe('listCommunications search', () => {
  it('combines q with category, status, org scope and soft-delete', async () => {
    await listCommunications('assoc-1', { q: '50%', category: 'dues', status: 'sent' })
    expect(tableCalls).toEqual(['communications'])
    expect(calls).toContainEqual(['eq', 'association_id', 'assoc-1'])
    expect(calls).toContainEqual(['is', 'deleted_at', null])
    expect(calls).toContainEqual(['eq', 'category', 'dues'])
    expect(calls).toContainEqual(['eq', 'status', 'sent'])
    expect(calls).toContainEqual(['ilike', 'subject', '%50\\%%'])
  })
  it('adds no ilike for an empty term', async () => {
    await listCommunications('assoc-1', { q: ' ' })
    expect(calls.some((c) => c[0] === 'ilike')).toBe(false)
  })
  it('failedOnly filters on the aliased embed, not the counted one', async () => {
    await listCommunications('assoc-1', { failedOnly: true })
    expect(calls).toContainEqual(['in', 'failed_only.delivery_status', ['failed', 'bounced']])
  })
  it('recentOnly limits to sent in the window', async () => {
    await listCommunications('assoc-1', { recentOnly: true })
    expect(calls).toContainEqual(['eq', 'status', 'sent'])
    expect(calls.some((c) => c[0] === 'gte' && c[1] === 'sent_at')).toBe(true)
  })
})

describe('getCommunicationsStrip', () => {
  it('runs three head count queries, each scoped to the association', async () => {
    result = { data: [], error: null, count: 7 }
    const s = await getCommunicationsStrip('assoc-9')
    expect(s).toEqual({ sentRecently: 7, drafts: 7, failedDeliveries: 7 })
    expect(calls.filter((c) => c[0] === 'eq' && c[1] === 'association_id' && c[2] === 'assoc-9')).toHaveLength(3)
    expect(calls.filter((c) => c[0] === 'select').every((c) => (c[2] as { head?: boolean }).head === true)).toBe(true)
    expect(calls.some((c) => c[0] === 'range')).toBe(false)
  })
  it('reports null, not zero, when a count fails', async () => {
    result = { data: [], error: { message: 'x' }, count: 0 }
    expect(await getCommunicationsStrip('a')).toEqual({ sentRecently: null, drafts: null, failedDeliveries: null })
  })
})

describe('recentCutoff', () => {
  it('is 30 days before now', () => {
    expect(recentCutoff(new Date('2026-10-31T00:00:00.000Z'))).toBe('2026-10-01T00:00:00.000Z')
  })
})
