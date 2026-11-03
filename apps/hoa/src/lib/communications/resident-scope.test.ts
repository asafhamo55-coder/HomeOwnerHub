import { describe, it, expect } from 'vitest'

import { buildRecipientIdentityFilters, chargesFromByUnit, pickRowPerCommunication } from './resident-scope'

describe('buildRecipientIdentityFilters', () => {
  it('matches on every identity the reader has', () => {
    expect(
      buildRecipientIdentityFilters({
        unitIds: ['unit-a', 'unit-b'],
        userId: 'user-1',
        email: 'dana@example.com',
      }),
    ).toEqual([
      'unit_id.in.(unit-a,unit-b)',
      'user_id.eq.user-1',
      'email.eq."dana@example.com"',
    ])
  })

  it('omits the unit clause entirely when the reader owns nothing', () => {
    expect(buildRecipientIdentityFilters({ unitIds: [], userId: 'user-1', email: null })).toEqual([
      'user_id.eq.user-1',
    ])
  })

  it('ignores unit-matched rows sent before that unit charges_from, keeps other matches', () => {
    expect(
      buildRecipientIdentityFilters({
        unitIds: ['unit-a', 'unit-b'],
        unitChargesFrom: { 'unit-a': '2026-05-01', 'unit-b': null },
        userId: 'user-1',
        email: 'dana@example.com',
      }),
    ).toEqual([
      'unit_id.in.(unit-b)',
      'and(unit_id.eq.unit-a,sent_at.gte.2026-05-01)',
      'user_id.eq.user-1',
      'email.eq."dana@example.com"',
    ])
  })

  it('drops a unit whose cutoff is not a plain date rather than matching everything', () => {
    expect(
      buildRecipientIdentityFilters({
        unitIds: ['unit-a'],
        unitChargesFrom: { 'unit-a': 'x),unit_id.neq.0' },
        userId: null,
        email: null,
      }),
    ).toEqual([])
  })

  it('accepts ISO timestamps with Z, fractional seconds and offsets', () => {
    for (const from of ['2026-05-01T00:00:00Z', '2026-05-01T00:00:00.123Z', '2026-05-01T00:00:00+00:00', '2026-05-01T09:30:00-05:00', '2026-05-01T09:30:00+0530']) {
      expect(
        buildRecipientIdentityFilters({ unitIds: ['u'], unitChargesFrom: { u: from }, userId: null, email: null }),
        from,
      ).toEqual([`and(unit_id.eq.u,sent_at.gte.${from})`])
    }
  })

  it('fails closed on input that is not a real date or timestamp', () => {
    for (const from of ['2026-13-45', 'yesterday', '2026-05-01T00:00:00Z),unit_id.neq.0', '2026-05-01 00:00:00', '2026-05-01T25:00:00Z']) {
      expect(
        buildRecipientIdentityFilters({ unitIds: ['u'], unitChargesFrom: { u: from }, userId: null, email: null }),
        from,
      ).toEqual([])
    }
  })

  it('a buyer is bounded by the sale date and a long-time owner is not', () => {
    const units = [
      { unit_id: 'bought', charges_from: '2026-05-01' },
      { unit_id: 'owned', charges_from: null },
      { unit_id: 'imported' },
    ]
    expect(chargesFromByUnit(units)).toEqual({ bought: '2026-05-01' })
    expect(
      buildRecipientIdentityFilters({
        unitIds: units.map((u) => u.unit_id),
        unitChargesFrom: chargesFromByUnit(units),
        userId: null,
        email: null,
      }),
    ).toEqual(['unit_id.in.(owned,imported)', 'and(unit_id.eq.bought,sent_at.gte.2026-05-01)'])
  })

  it('returns nothing when there is no identity to match on', () => {
    // The caller MUST skip the query on this. An empty or() matches rows.
    expect(buildRecipientIdentityFilters({ unitIds: [], userId: null, email: null })).toEqual([])
  })

  it('quotes the email so a comma cannot split it into two filters', () => {
    const [clause] = buildRecipientIdentityFilters({
      unitIds: [],
      userId: null,
      email: 'a,b@example.com',
    })
    expect(clause).toBe('email.eq."a,b@example.com"')
  })
})

describe('pickRowPerCommunication', () => {
  const row = (id: string, subject: string | null, unit = 'unit-a') => ({
    communication_id: id,
    rendered_subject: subject,
    unit_id: unit,
    sent_at: '2026-08-14T12:00:00Z',
  })

  it('collapses one message delivered on several channels into one entry', () => {
    const m = pickRowPerCommunication([row('c1', 'Dues — $310.00'), row('c1', 'Dues — $310.00')])
    expect(m.size).toBe(1)
  })

  it('keeps the row carrying a rendered subject over one without', () => {
    const m = pickRowPerCommunication([row('c1', null), row('c1', 'Dues — $310.00')])
    expect(m.get('c1')?.rendered_subject).toBe('Dues — $310.00')
  })

  it('does not let a later blank row overwrite a subject already found', () => {
    const m = pickRowPerCommunication([row('c1', 'Dues — $310.00'), row('c1', null)])
    expect(m.get('c1')?.rendered_subject).toBe('Dues — $310.00')
  })

  it('preserves insertion order, which is the sent_at ordering the caller applied', () => {
    const m = pickRowPerCommunication([row('c2', null), row('c1', null)])
    expect([...m.keys()]).toEqual(['c2', 'c1'])
  })
})
