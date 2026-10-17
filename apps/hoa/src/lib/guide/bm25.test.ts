import { describe, expect, it } from 'vitest'
import { buildBm25, searchBm25 } from './bm25'
import { expandQuery, stem, tokenize } from './text'

describe('tokenize', () => {
  it('lowercases, strips punctuation and stopwords', () => {
    expect(tokenize('How do I Record a Payment?')).toEqual(['record', 'payment'])
  })

  it('folds accents and keeps digits', () => {
    expect(tokenize('Café 720.303 rules')).toEqual(['cafe', '720', '303', 'rule'])
  })

  it('stems plurals and -ing/-ed the same way at build and query time', () => {
    expect(stem('payments')).toBe('payment')
    expect(stem('properties')).toBe('property')
    expect(stem('reminders')).toBe('reminder')
    expect(stem('sending')).toBe('send')
    expect(stem('approved')).toBe('approv')
    expect(stem('approve')).toBe('approv')
    expect(stem('dues')).toBe('due')
    expect(stem('glass')).toBe('glass')
  })
})

describe('expandQuery', () => {
  it('adds synonyms for words users type', () => {
    expect(expandQuery('cheque')).toContain('check')
    expect(expandQuery('assessment')).toContain('due')
  })
})

describe('BM25', () => {
  const index = buildBm25([
    { id: 'pay', fields: [{ text: 'Record a payment by check or cash', weight: 3 }, { text: 'cheque paid ledger', weight: 1 }] },
    { id: 'gen', fields: [{ text: 'Bill this month’s dues', weight: 3 }, { text: 'generate charges for every property', weight: 1 }] },
    { id: 'vio', fields: [{ text: 'Report a violation and approve the letter', weight: 3 }] },
  ])

  it('ranks the document that matches best first', () => {
    const hits = searchBm25(index, 'record payment')
    expect(hits[0]?.id).toBe('pay')
  })

  it('returns nothing for a query with no matching terms', () => {
    expect(searchBm25(index, 'clubhouse booking')).toEqual([])
    expect(searchBm25(index, '')).toEqual([])
    expect(searchBm25(index, 'the and of')).toEqual([])
  })

  it('matches the last word as a prefix so results appear while typing', () => {
    expect(searchBm25(index, 'viol', { prefixLast: true })[0]?.id).toBe('vio')
    expect(searchBm25(index, 'viol')).toEqual([])
  })

  it('uses synonyms (cheque finds the check article)', () => {
    expect(searchBm25(index, 'cheque')[0]?.id).toBe('pay')
  })

  it('weights fields: a title hit outranks a body hit', () => {
    const idx = buildBm25([
      { id: 'body', fields: [{ text: 'Meetings', weight: 3 }, { text: 'dues dues', weight: 1 }] },
      { id: 'title', fields: [{ text: 'Dues', weight: 3 }, { text: 'other words here', weight: 1 }] },
    ])
    expect(searchBm25(idx, 'dues')[0]?.id).toBe('title')
  })

  it('can be restricted to an allowed set of ids (role filter)', () => {
    const hits = searchBm25(index, 'payment dues violation', { allow: new Set(['gen']) })
    expect(hits.map((h) => h.id)).toEqual(['gen'])
  })

  it('is deterministic: postings keys are sorted', () => {
    const keys = Object.keys(index.postings)
    expect(keys).toEqual([...keys].sort())
  })

  it('survives a JSON round trip (it is written into a generated module)', () => {
    const copy = JSON.parse(JSON.stringify(index))
    expect(searchBm25(copy, 'record payment')).toEqual(searchBm25(index, 'record payment'))
  })
})
