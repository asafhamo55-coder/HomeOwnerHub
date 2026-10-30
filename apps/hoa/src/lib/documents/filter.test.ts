import { describe, expect, it } from 'vitest'
import { filterDocs, matchesQuery, parseLibraryType, searchDocs, typeCounts } from './filter'

const docs = [
  { name: 'Master CC&Rs 2019.pdf', type: 'ccr' },
  { name: 'Bylaws (amended).pdf', type: 'bylaws' },
  { name: 'Pool rules.pdf', type: 'rules' },
  { name: 'May minutes.pdf', type: 'minutes' },
  { name: 'Pool 100%_final.pdf', type: 'other' },
  { name: 'Legacy scan.pdf', type: 'weird' },
]

describe('query matching', () => {
  it('is case-insensitive and needs every term', () => {
    expect(matchesQuery('Pool Rules.pdf', 'POOL rules')).toBe(true)
    expect(matchesQuery('Pool Rules.pdf', 'pool bylaws')).toBe(false)
  })
  it('treats % and _ and regex characters literally', () => {
    expect(searchDocs(docs, '%').map((d) => d.name)).toEqual(['Pool 100%_final.pdf'])
    expect(searchDocs(docs, '_')).toHaveLength(1)
    expect(searchDocs(docs, '.*')).toEqual([])
    expect(searchDocs(docs, '(')).toHaveLength(1)
  })
  it('blank query matches all', () => {
    expect(searchDocs(docs, '  ')).toHaveLength(docs.length)
    expect(searchDocs(docs, null)).toHaveLength(docs.length)
  })
})

describe('type filter', () => {
  it('parses only known types', () => {
    expect(parseLibraryType('rules')).toBe('rules')
    expect(parseLibraryType('nope')).toBeNull()
    expect(parseLibraryType(undefined)).toBeNull()
  })
  it('filters by type, folding unknown types into other', () => {
    expect(filterDocs(docs, '', 'rules')).toHaveLength(1)
    expect(filterDocs(docs, '', 'other').map((d) => d.name)).toEqual(['Pool 100%_final.pdf', 'Legacy scan.pdf'])
  })
  it('combines query and type', () => {
    expect(filterDocs(docs, 'pool', 'rules').map((d) => d.name)).toEqual(['Pool rules.pdf'])
    expect(filterDocs(docs, 'pool', 'minutes')).toEqual([])
  })
})

describe('chip counts', () => {
  it('counts the searched set per type', () => {
    expect(typeCounts(docs)).toEqual({ all: 6, ccr: 1, bylaws: 1, rules: 1, minutes: 1, other: 2 })
    expect(typeCounts(searchDocs(docs, 'pool'))).toEqual({ all: 2, ccr: 0, bylaws: 0, rules: 1, minutes: 0, other: 1 })
  })
})
