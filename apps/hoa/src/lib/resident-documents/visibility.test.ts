import { describe, expect, it } from 'vitest'
import {
  RESIDENT_VISIBLE_TYPES,
  canResidentOpen,
  isResidentVisible,
  type DocSource,
} from './visibility'

// Every type value the two CHECK constraints allow today
// (0000_schema.sql hoa_documents_type_check; 0004 governing_documents).
const ALL_TYPES: Record<DocSource, string[]> = {
  hoa: ['ccr', 'bylaws', 'rules', 'minutes', 'other'],
  governing: ['declaration', 'bylaws', 'rules', 'amendment', 'policy', 'minutes', 'state_statute'],
}

describe('resident document allowlist', () => {
  it('shows the governing documents', () => {
    for (const type of ['ccr', 'bylaws', 'rules']) {
      expect(isResidentVisible({ source: 'hoa', type }), `hoa ${type}`).toBe(true)
    }
    for (const type of ['declaration', 'bylaws', 'rules', 'amendment', 'policy']) {
      expect(isResidentVisible({ source: 'governing', type }), `governing ${type}`).toBe(true)
    }
  })

  it('never shows the catch-all, minutes or statute types', () => {
    expect(isResidentVisible({ source: 'hoa', type: 'other' })).toBe(false)
    expect(isResidentVisible({ source: 'hoa', type: 'minutes' })).toBe(false)
    expect(isResidentVisible({ source: 'governing', type: 'minutes' })).toBe(false)
    expect(isResidentVisible({ source: 'governing', type: 'state_statute' })).toBe(false)
  })

  it('denies any type it does not know (default-deny)', () => {
    for (const type of ['draft', 'legal', 'collection_letter', 'internal', 'CCR', ' ccr', '', 'budget']) {
      expect(isResidentVisible({ source: 'hoa', type }), `hoa "${type}"`).toBe(false)
      expect(isResidentVisible({ source: 'governing', type }), `governing "${type}"`).toBe(false)
    }
  })

  it('does not carry a type across tables', () => {
    // "ccr" is an hoa_documents value; "declaration" a governing one.
    expect(isResidentVisible({ source: 'governing', type: 'ccr' })).toBe(false)
    expect(isResidentVisible({ source: 'hoa', type: 'declaration' })).toBe(false)
    expect(isResidentVisible({ source: 'hoa', type: 'policy' })).toBe(false)
  })

  it('hides superseded and AI-generated governing documents', () => {
    expect(isResidentVisible({ source: 'governing', type: 'bylaws', superseded: true })).toBe(false)
    expect(isResidentVisible({ source: 'governing', type: 'policy', aiGenerated: true })).toBe(false)
    expect(isResidentVisible({ source: 'governing', type: 'policy', aiGenerated: null })).toBe(true)
  })

  it('denies an unknown source', () => {
    expect(isResidentVisible({ source: 'vendor' as DocSource, type: 'bylaws' })).toBe(false)
  })

  it('the allowlist is a strict subset of the types the schema allows', () => {
    for (const source of ['hoa', 'governing'] as const) {
      for (const t of RESIDENT_VISIBLE_TYPES[source]) expect(ALL_TYPES[source]).toContain(t)
    }
  })

  it('opening also needs a file', () => {
    expect(canResidentOpen({ source: 'hoa', type: 'bylaws', storagePath: 'org/x.pdf' })).toBe(true)
    expect(canResidentOpen({ source: 'governing', type: 'rules', storagePath: null })).toBe(false)
    expect(canResidentOpen({ source: 'governing', type: 'rules', storagePath: '  ' })).toBe(false)
    expect(canResidentOpen({ source: 'hoa', type: 'other', storagePath: 'org/x.pdf' })).toBe(false)
  })
})
