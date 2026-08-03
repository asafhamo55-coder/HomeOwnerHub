import { describe, expect, it } from 'vitest'
import { computeDirection } from './ingest'

/**
 * `computeDirection` is the fix for the Phase B bug where every ingested
 * message (including the HOA's own sent replies, now in scope per
 * `buildScopeQuery`'s `from:<mailbox address>` clause) was hardcoded
 * 'inbound'. See the doc comment on `computeDirection` in ./ingest.ts for
 * the full story.
 */
describe('computeDirection', () => {
  it('is outbound when the From address equals the mailbox address', () => {
    expect(computeDirection('board@oakwoodhoa.org', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('is inbound when the From address differs from the mailbox address', () => {
    expect(computeDirection('resident@gmail.com', 'board@oakwoodhoa.org')).toBe('inbound')
  })

  it('matches case-insensitively', () => {
    expect(computeDirection('Board@OakwoodHOA.org', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('matches after trimming surrounding whitespace', () => {
    expect(computeDirection('  board@oakwoodhoa.org  ', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('matches case-insensitively AND after trimming, combined', () => {
    expect(computeDirection('  Board@OakwoodHOA.org  ', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('is inbound (not a crash, not a match) when fromEmail is null', () => {
    expect(computeDirection(null, 'board@oakwoodhoa.org')).toBe('inbound')
  })

  it('does not coerce null to the string "null" and match a literal "null" address', () => {
    // Guards against `String(null) === 'null'` sneaking a match through.
    expect(computeDirection(null, 'null')).toBe('inbound')
  })
})
