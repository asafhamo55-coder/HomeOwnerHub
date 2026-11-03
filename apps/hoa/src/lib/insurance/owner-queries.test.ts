import { describe, expect, it } from 'vitest'
import { loadOwnerInsurancePolicies, type LooseDb } from './queries'

const A = 'assoc-a'
const B = 'assoc-b'

function row(id: string, association_id: string | null) {
  return { id, association_id, kind: 'property', carrier: 'c', expires_on: '2027-01-01' }
}

function db(rows: unknown[]): LooseDb {
  const q: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'order']) q[op] = () => q
  q.range = () => Promise.resolve({ data: rows, error: null })
  return { from: () => q }
}

describe('loadOwnerInsurancePolicies association scope', () => {
  const rows = [row('p-a', A), row('p-b', B), row('p-org', null)]

  it('a resident sees their own association and organization-wide policies only', async () => {
    const out = await loadOwnerInsurancePolicies(db(rows), 'org', true, [A])
    expect(out?.map((p) => p.id)).toEqual(['p-a', 'p-org'])
  })

  it('a resident with no association sees organization-wide policies only', async () => {
    const out = await loadOwnerInsurancePolicies(db(rows), 'org', true, [])
    expect(out?.map((p) => p.id)).toEqual(['p-org'])
  })
})
