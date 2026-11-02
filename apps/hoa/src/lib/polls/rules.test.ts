import { describe, expect, it } from 'vitest'
import { acceptsAnswers, buildTally, canSeeResults, effectiveStatus, parsePollInput, POLL_NOT_A_VOTE } from './rules'

const base = {
  title: 'Pool hours',
  description: '',
  optionsText: 'Open until 9\nOpen until 10\n',
  allowMultiple: false,
  resultsVisibility: 'after_close' as const,
  closesOn: '',
}

describe('parsePollInput', () => {
  it('accepts a simple poll and trims', () => {
    const r = parsePollInput({ ...base, title: '  Pool hours ' }, '2026-11-02')
    expect(r.ok && r.value.options).toEqual(['Open until 9', 'Open until 10'])
    expect(r.ok && r.value.title).toBe('Pool hours')
  })
  it('drops blank and duplicate answers, then needs two', () => {
    expect(parsePollInput({ ...base, optionsText: 'Yes\n\nyes\n' }, '2026-11-02').ok).toBe(false)
  })
  it('caps answers at 20', () => {
    const many = Array.from({ length: 21 }, (_, i) => `A${i}`).join('\n')
    expect(parsePollInput({ ...base, optionsText: many }, '2026-11-02').ok).toBe(false)
  })
  it('rejects a past last day, allows today', () => {
    expect(parsePollInput({ ...base, closesOn: '2026-11-01' }, '2026-11-02').ok).toBe(false)
    expect(parsePollInput({ ...base, closesOn: '2026-11-02' }, '2026-11-02').ok).toBe(true)
  })
})

describe('status and visibility', () => {
  const now = new Date('2026-11-10T12:00:00Z')
  it('an open poll past its end is finished', () => {
    expect(effectiveStatus({ status: 'open', closes_at: '2026-11-09T00:00:00Z' }, now)).toBe('closed')
    expect(acceptsAnswers({ status: 'open', closes_at: '2026-11-11T00:00:00Z' }, now)).toBe(true)
    expect(acceptsAnswers({ status: 'draft', closes_at: null }, now)).toBe(false)
  })
  it('residents see results only live or after close; the board always', () => {
    const open = { status: 'open' as const, closes_at: null, results_visibility: 'after_close' as const }
    expect(canSeeResults(open, 'resident', now)).toBe(false)
    expect(canSeeResults({ ...open, results_visibility: 'live' }, 'resident', now)).toBe(true)
    expect(canSeeResults({ ...open, status: 'closed' }, 'resident', now)).toBe(true)
    expect(canSeeResults(open, 'board', now)).toBe(true)
  })
})

describe('buildTally', () => {
  it('computes percent of homes and marks leaders', () => {
    const t = buildTally([
      { option_id: 'b', label: 'B', option_position: 1, votes: 1, homes_answered: 4 },
      { option_id: 'a', label: 'A', option_position: 0, votes: 3, homes_answered: 4 },
    ])
    expect(t.homesAnswered).toBe(4)
    expect(t.rows.map((r) => [r.label, r.percent, r.leading])).toEqual([
      ['A', 75, true],
      ['B', 25, false],
    ])
  })
  it('handles no answers', () => {
    const t = buildTally([{ option_id: 'a', label: 'A', option_position: 0, votes: 0, homes_answered: 0 }])
    expect(t.rows[0]).toMatchObject({ percent: 0, leading: false })
  })
})

it('the notice says it is not a vote and has no em dash', () => {
  expect(POLL_NOT_A_VOTE).toMatch(/not a vote/)
  expect(POLL_NOT_A_VOTE).not.toContain('—')
})
