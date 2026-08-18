import { describe, it, expect } from 'vitest'

import { buildRecipientIdentityFilters, pickRowPerCommunication } from './resident-scope'

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
