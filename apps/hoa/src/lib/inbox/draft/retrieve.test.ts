import { describe, it, expect } from 'vitest'
import { collectFragments, type SourceResults } from './retrieve'

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
