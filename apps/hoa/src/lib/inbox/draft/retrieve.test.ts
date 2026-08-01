import { describe, it, expect, vi } from 'vitest'
import {
  collectFragments,
  fetchGoverningDocChunkTexts,
  fetchStatuteChunkTexts,
  type SourceResults,
} from './retrieve'

/**
 * Minimal chainable `.from().select().eq().in()` stand-in. Both fetch
 * helpers await the result of `.in(...)`, so the chain only needs to be
 * thenable-compatible there — `await nonPromise` resolves immediately to
 * the value, so a plain return works without wrapping in a real Promise.
 */
function dbWithChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => result),
  }
  return { from: vi.fn(() => chain), _chain: chain }
}

describe('collectFragments', () => {
  const base: SourceResults = {
    docs: { citations: [{ chunkId: 'c1', label: 'CC&Rs §4.2', text: 'Fences may not exceed six feet.' }] },
    statutes: { citations: [] },
    property: null,
    pastReplies: [],
    degraded: [],
  }

  it('gives every fragment a refId that is unique across sources', () => {
    const withOverlap: SourceResults = {
      ...base,
      statutes: { citations: [{ chunkId: 'c1', label: 'O.C.G.A. §44-3-76', text: 'Statutory text.' }] },
    }
    const { fragments } = collectFragments(withOverlap)
    const ids = fragments.map((f) => f.refId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries degraded sources through rather than hiding them', () => {
    const { degraded } = collectFragments({ ...base, degraded: ['dues', 'past_replies'] })
    expect(degraded).toEqual(['dues', 'past_replies'])
  })

  it('produces no fragments when every source is empty', () => {
    const { fragments } = collectFragments({
      docs: { citations: [] },
      statutes: { citations: [] },
      property: null,
      pastReplies: [],
      degraded: [],
    })
    expect(fragments).toEqual([])
  })
})

describe('fetchGoverningDocChunkTexts', () => {
  it('returns the chunk\'s own text, not a synthesized answer', async () => {
    const db = dbWithChain({
      data: [{ id: 'c1', text: 'Fences may not exceed six feet in height.' }],
      error: null,
    })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1'])

    expect(failed).toBe(false)
    expect(texts.get('c1')).toBe('Fences may not exceed six feet in height.')
  })

  it('scopes the lookup to the organization', async () => {
    const db = dbWithChain({ data: [], error: null })

    await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1'])

    expect(db._chain.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(db._chain.in).toHaveBeenCalledWith('id', ['c1'])
  })

  it('omits a chunk id that returns no row, rather than inventing text for it', async () => {
    // c1 was cited but the query only found c2 — e.g. the chunk was deleted
    // after W1 retrieved it.
    const db = dbWithChain({ data: [{ id: 'c2', text: 'Some other section.' }], error: null })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1', 'c2'])

    expect(failed).toBe(false)
    expect(texts.has('c1')).toBe(false)
    expect(texts.get('c2')).toBe('Some other section.')
  })

  it('checks the read error and degrades instead of throwing', async () => {
    const db = dbWithChain({
      data: null,
      error: { code: '08006', message: 'connection reset' },
    })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1'])

    expect(failed).toBe(true)
    expect(texts.size).toBe(0)
  })

  it('does not query when there are no chunk ids', async () => {
    const db = dbWithChain({ data: [], error: null })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', [])

    expect(failed).toBe(false)
    expect(texts.size).toBe(0)
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('fetchStatuteChunkTexts', () => {
  it("returns the chunk's own text from the `content` column, and does not filter by org", async () => {
    const db = dbWithChain({
      data: [{ id: 's1', content: 'A board must give 30 days notice before a special assessment.' }],
      error: null,
    })

    const { texts, failed } = await fetchStatuteChunkTexts(db as never, ['s1'])

    expect(failed).toBe(false)
    expect(texts.get('s1')).toBe(
      'A board must give 30 days notice before a special assessment.',
    )
    expect(db._chain.eq).not.toHaveBeenCalled()
    expect(db._chain.in).toHaveBeenCalledWith('id', ['s1'])
  })

  it('omits a chunk id that returns no row', async () => {
    const db = dbWithChain({ data: [], error: null })

    const { texts, failed } = await fetchStatuteChunkTexts(db as never, ['s1'])

    expect(failed).toBe(false)
    expect(texts.has('s1')).toBe(false)
  })

  it('checks the read error and degrades instead of throwing', async () => {
    const db = dbWithChain({
      data: null,
      error: { code: '08006', message: 'connection reset' },
    })

    const { texts, failed } = await fetchStatuteChunkTexts(db as never, ['s1'])

    expect(failed).toBe(true)
    expect(texts.size).toBe(0)
  })
})
