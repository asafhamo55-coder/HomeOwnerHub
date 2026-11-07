import { describe, expect, it } from 'vitest'
import { loadManagedByLine } from './managed-by-load'

function fake(rows: unknown[], calls: Array<[string, unknown[]]>) {
  const q: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'order', 'limit']) {
    q[op] = (...args: unknown[]) => (calls.push([op, args]), q)
  }
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok)
  return { from: () => q }
}

describe('loadManagedByLine', () => {
  it('reads the named association when an id is given, not the first by name', async () => {
    const calls: Array<[string, unknown[]]> = []
    const line = await loadManagedByLine(fake([{ compliance_settings: { managed_by_line: 'Managed by Homeside' } }], calls), 'org-1', 'assoc-2')
    expect(line).toBe('Managed by Homeside')
    expect(calls).toContainEqual(['eq', ['organization_id', 'org-1']])
    expect(calls).toContainEqual(['eq', ['id', 'assoc-2']])
    expect(calls.some(([op]) => op === 'order')).toBe(false)
  })
  it('falls back to the first association by name without an id', async () => {
    const calls: Array<[string, unknown[]]> = []
    await loadManagedByLine(fake([], calls), 'org-1')
    expect(calls.some(([op]) => op === 'order')).toBe(true)
    expect(calls.some(([op, a]) => op === 'eq' && a[0] === 'id')).toBe(false)
  })
  it('is empty on a failed read', async () => {
    expect(await loadManagedByLine({ from: () => { throw new Error('boom') } }, 'org-1', 'a')).toBe('')
  })
})
