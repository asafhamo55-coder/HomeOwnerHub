import { describe, expect, it } from 'vitest'
import {
  RESIDENT_DOC_GROUPS,
  docDate,
  groupFor,
  groupResidentDocuments,
  searchResidentDocuments,
  type ResidentDocument,
} from './group'

let n = 0
function doc(over: Partial<ResidentDocument> & Pick<ResidentDocument, 'source' | 'type'>): ResidentDocument {
  n++
  return {
    id: `d${n}`,
    title: `Doc ${n}`,
    effectiveDate: null,
    addedAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    hasFile: true,
    ...over,
  }
}

describe('groupFor', () => {
  it('maps both tables onto one set of resident groups', () => {
    expect(groupFor(doc({ source: 'hoa', type: 'ccr' }))).toBe('declaration')
    expect(groupFor(doc({ source: 'governing', type: 'declaration' }))).toBe('declaration')
    expect(groupFor(doc({ source: 'hoa', type: 'bylaws' }))).toBe('bylaws')
    expect(groupFor(doc({ source: 'governing', type: 'rules' }))).toBe('rules')
    expect(groupFor(doc({ source: 'governing', type: 'amendment' }))).toBe('amendments')
    expect(groupFor(doc({ source: 'governing', type: 'policy' }))).toBe('policies')
  })

  it('puts articles of incorporation in their own group by title', () => {
    expect(groupFor(doc({ source: 'governing', type: 'declaration', title: 'Articles of Incorporation' }))).toBe('articles')
    expect(groupFor(doc({ source: 'hoa', type: 'bylaws', title: 'Amended Articles of Organization' }))).toBe('articles')
  })

  it('returns null for a type outside the allowlist', () => {
    expect(groupFor(doc({ source: 'hoa', type: 'other' }))).toBeNull()
    expect(groupFor(doc({ source: 'hoa', type: 'other', title: 'Articles of Incorporation' }))).toBeNull()
  })
})

describe('groupResidentDocuments', () => {
  it('orders groups by the fixed sequence and drops empty ones', () => {
    const groups = groupResidentDocuments([
      doc({ source: 'governing', type: 'policy' }),
      doc({ source: 'hoa', type: 'ccr' }),
      doc({ source: 'hoa', type: 'rules' }),
    ])
    expect(groups.map((g) => g.id)).toEqual(['declaration', 'rules', 'policies'])
    const order = RESIDENT_DOC_GROUPS.map((g) => g.id)
    expect(order.indexOf('declaration')).toBeLessThan(order.indexOf('rules'))
  })

  it('lists newest first within a group (effective date, then update, then added)', () => {
    const old = doc({ source: 'governing', type: 'rules', title: 'Old', effectiveDate: '2020-01-01' })
    const updated = doc({ source: 'hoa', type: 'rules', title: 'Updated', addedAt: '2019-01-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' })
    const added = doc({ source: 'hoa', type: 'rules', title: 'Added', addedAt: '2024-01-01T00:00:00Z' })
    const undated = doc({ source: 'hoa', type: 'rules', title: 'Undated', addedAt: null })
    const [rules] = groupResidentDocuments([undated, old, added, updated])
    expect(rules.docs.map((d) => d.title)).toEqual(['Updated', 'Added', 'Old', 'Undated'])
  })

  it('drops anything not resident-visible even if a caller passes it in', () => {
    const groups = groupResidentDocuments([
      doc({ source: 'hoa', type: 'other', title: 'Collection letter' }),
      doc({ source: 'governing', type: 'minutes' }),
      doc({ source: 'governing', type: 'policy', aiGenerated: true }),
    ])
    expect(groups).toEqual([])
  })

  it('docDate prefers effective date', () => {
    expect(docDate(doc({ source: 'governing', type: 'rules', effectiveDate: '2025-02-01', updatedAt: '2026-01-01' }))).toBe('2025-02-01')
    expect(docDate(doc({ source: 'hoa', type: 'rules', addedAt: null }))).toBeNull()
  })
})

describe('searchResidentDocuments', () => {
  const docs = [
    doc({ source: 'hoa', type: 'rules', title: 'Pool & Clubhouse Rules' }),
    doc({ source: 'governing', type: 'policy', title: 'Parking policy' }),
    doc({ source: 'hoa', type: 'ccr', title: 'Declaration of Covenants' }),
  ]

  it('returns everything for an empty query', () => {
    expect(searchResidentDocuments(docs, '')).toHaveLength(3)
    expect(searchResidentDocuments(docs, '   ')).toHaveLength(3)
    expect(searchResidentDocuments(docs, undefined)).toHaveLength(3)
  })

  it('matches titles case-insensitively, every word', () => {
    expect(searchResidentDocuments(docs, 'POOL').map((d) => d.title)).toEqual(['Pool & Clubhouse Rules'])
    expect(searchResidentDocuments(docs, 'pool parking')).toEqual([])
  })

  it('matches the group label too', () => {
    expect(searchResidentDocuments(docs, 'cc&rs').map((d) => d.title)).toEqual(['Declaration of Covenants'])
    expect(searchResidentDocuments(docs, 'policies').map((d) => d.title)).toEqual(['Parking policy'])
  })
})
