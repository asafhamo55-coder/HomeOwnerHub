import { describe, expect, it, vi } from 'vitest'
import { needsHomeLink, resolveOrgAssociationScope } from './association-scope'

function dbWith(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.limit = () => Promise.resolve(result)
  return { from: vi.fn(() => q) } as never
}

describe('resolveOrgAssociationScope', () => {
  it('one association is the scope', async () => {
    expect(await resolveOrgAssociationScope(dbWith({ data: [{ id: 'a1', state: 'GA' }], error: null }), 'o')).toEqual({
      status: 'one',
      associationId: 'a1',
      state: 'GA',
    })
  })
  it('several associations are ambiguous', async () => {
    const data = [
      { id: 'a1', state: 'GA' },
      { id: 'a2', state: 'FL' },
    ]
    expect(await resolveOrgAssociationScope(dbWith({ data, error: null }), 'o')).toEqual({ status: 'many' })
  })
  it('none and a failed read are not scopes', async () => {
    expect(await resolveOrgAssociationScope(dbWith({ data: [], error: null }), 'o')).toEqual({ status: 'none' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await resolveOrgAssociationScope(dbWith({ data: null, error: { code: 'x', message: 'y' } }), 'o')).toEqual({
      status: 'error',
    })
  })
})

describe('needsHomeLink', () => {
  it('only an unfiled thread in a multi-association org needs the note', () => {
    expect(needsHomeLink({ status: 'many' }, false)).toBe(true)
    expect(needsHomeLink({ status: 'many' }, true)).toBe(false)
    expect(needsHomeLink({ status: 'one', associationId: 'a', state: null }, false)).toBe(false)
    expect(needsHomeLink({ status: 'none' }, false)).toBe(false)
    expect(needsHomeLink({ status: 'error' }, false)).toBe(false)
  })
})
