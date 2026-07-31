import { describe, expect, it } from 'vitest'
import { decideMatch, extractAddressCandidates } from './match'
import type { MatchSignals } from './match'
import type { PropertyMatch } from '../properties/resolve'

function emptySignals(over: Partial<MatchSignals> = {}): MatchSignals {
  return {
    threadUnitId: null,
    aliasUnitId: null,
    aliasResidentId: null,
    emailMatches: [],
    addressUnitIds: [],
    nameMatches: [],
    ...over,
  }
}

function propertyMatch(unitId: string, residentId: string | null): PropertyMatch {
  return {
    ref: {
      unitId,
      legacyPropertyId: `legacy-${unitId}`,
      associationId: 'assoc-1',
      address: `${unitId} Oak Ln`,
      unitNumber: null,
    },
    residentId,
    residentName: 'Jenna Rivera',
    source: 'property_resident',
  }
}

describe('decideMatch — signal precedence', () => {
  it('1. thread continuity wins over everything else', () => {
    const outcome = decideMatch(
      emptySignals({
        threadUnitId: 'unit-thread',
        aliasUnitId: 'unit-alias',
        emailMatches: [propertyMatch('unit-email', 'res-1')],
      }),
    )
    expect(outcome.unitId).toBe('unit-thread')
    expect(outcome.rule).toBe('thread_continuity')
    expect(outcome.confidence).toBe('high')
    expect(outcome.status).toBe('open')
  })

  it('2. a remembered sender alias beats an email lookup', () => {
    const outcome = decideMatch(
      emptySignals({
        aliasUnitId: 'unit-alias',
        aliasResidentId: 'res-alias',
        emailMatches: [propertyMatch('unit-email', 'res-1')],
      }),
    )
    expect(outcome.unitId).toBe('unit-alias')
    expect(outcome.residentId).toBe('res-alias')
    expect(outcome.rule).toBe('sender_alias')
    expect(outcome.confidence).toBe('high')
  })

  it('3. exactly one email match is high confidence and auto-attaches', () => {
    const outcome = decideMatch(
      emptySignals({ emailMatches: [propertyMatch('unit-1', 'res-1')] }),
    )
    expect(outcome.unitId).toBe('unit-1')
    expect(outcome.residentId).toBe('res-1')
    expect(outcome.rule).toBe('resident_email')
    expect(outcome.confidence).toBe('high')
    expect(outcome.status).toBe('open')
  })

  it('4. multiple email matches are medium and do NOT auto-attach', () => {
    // An owner of three units. Guessing would misfile mail and feed the
    // wrong property context to Phase B's drafting agent.
    const outcome = decideMatch(
      emptySignals({
        emailMatches: [propertyMatch('unit-1', 'res-1'), propertyMatch('unit-2', 'res-2')],
      }),
    )
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('resident_email_ambiguous')
    expect(outcome.confidence).toBe('medium')
    expect(outcome.status).toBe('needs_review')
    expect(outcome.reason.candidate_unit_ids).toEqual(['unit-1', 'unit-2'])
  })

  it('5. exactly one address in the body is medium and does NOT auto-attach', () => {
    const outcome = decideMatch(emptySignals({ addressUnitIds: ['unit-9'] }))
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('address_in_body')
    expect(outcome.confidence).toBe('medium')
    expect(outcome.status).toBe('needs_review')
    expect(outcome.reason.candidate_unit_ids).toEqual(['unit-9'])
  })

  it('5b. multiple addresses in the body yield no match', () => {
    const outcome = decideMatch(emptySignals({ addressUnitIds: ['unit-9', 'unit-10'] }))
    expect(outcome.rule).toBe('none')
    expect(outcome.confidence).toBe('none')
  })

  it('6. exactly one sender-name match is low confidence', () => {
    const outcome = decideMatch(
      emptySignals({
        nameMatches: [{ unitId: 'unit-3', residentId: 'res-3', residentName: 'Dana Okafor' }],
      }),
    )
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('sender_name')
    expect(outcome.confidence).toBe('low')
    expect(outcome.status).toBe('needs_review')
  })

  it('6b. ambiguous names yield no match', () => {
    const outcome = decideMatch(
      emptySignals({
        nameMatches: [
          { unitId: 'u1', residentId: 'r1', residentName: 'J Smith' },
          { unitId: 'u2', residentId: 'r2', residentName: 'J Smith' },
        ],
      }),
    )
    expect(outcome.rule).toBe('none')
  })

  it('no signals → triage', () => {
    const outcome = decideMatch(emptySignals())
    expect(outcome.unitId).toBeNull()
    expect(outcome.residentId).toBeNull()
    expect(outcome.confidence).toBe('none')
    expect(outcome.rule).toBe('none')
    expect(outcome.status).toBe('needs_review')
  })

  it('every outcome carries an auditable reason', () => {
    const outcome = decideMatch(
      emptySignals({ emailMatches: [propertyMatch('unit-1', 'res-1')] }),
    )
    // match_reason must explain itself in the UI — "matched via X on Y".
    expect(outcome.reason.rule).toBe('resident_email')
    expect(outcome.reason.matched_on).toBe('property_resident')
  })

  it('only high confidence ever auto-attaches', () => {
    const highs = [
      decideMatch(emptySignals({ threadUnitId: 'u' })),
      decideMatch(emptySignals({ aliasUnitId: 'u' })),
      decideMatch(emptySignals({ emailMatches: [propertyMatch('u', null)] })),
    ]
    for (const outcome of highs) {
      expect(outcome.confidence).toBe('high')
      expect(outcome.unitId).not.toBeNull()
      expect(outcome.status).toBe('open')
    }

    const lowers = [
      decideMatch(emptySignals({ addressUnitIds: ['u'] })),
      decideMatch(
        emptySignals({
          nameMatches: [{ unitId: 'u', residentId: null, residentName: 'X' }],
        }),
      ),
    ]
    for (const outcome of lowers) {
      expect(outcome.unitId).toBeNull()
      expect(outcome.status).toBe('needs_review')
    }
  })
})

describe('extractAddressCandidates', () => {
  it('finds a street address in prose', () => {
    expect(extractAddressCandidates('I live at 214 Oak Lane and the gate broke.')).toContain(
      '214 Oak Lane',
    )
  })

  it('finds an address with a street-type abbreviation', () => {
    expect(extractAddressCandidates('Re: 31 Birch Ct fence')).toContain('31 Birch Ct')
  })

  it('finds a multi-word street name', () => {
    expect(extractAddressCandidates('at 88 North Maple Drive today')).toContain(
      '88 North Maple Drive',
    )
  })

  it('finds several distinct addresses', () => {
    const found = extractAddressCandidates('Both 214 Oak Ln and 31 Birch Ct are affected.')
    expect(found).toHaveLength(2)
  })

  it('ignores numbers that are not addresses', () => {
    expect(extractAddressCandidates('Invoice 4417 for $340 due on 15 July')).toEqual([])
  })

  it('handles null and empty input', () => {
    expect(extractAddressCandidates(null)).toEqual([])
    expect(extractAddressCandidates('')).toEqual([])
  })

  it('deduplicates repeats', () => {
    expect(
      extractAddressCandidates('214 Oak Ln — again, 214 Oak Ln is the problem'),
    ).toHaveLength(1)
  })
})
