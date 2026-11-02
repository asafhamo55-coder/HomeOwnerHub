import { describe, expect, it } from 'vitest'
import { ACK_STATEMENTS, ACK_TEXT_VERSION, onlineVotingRule } from './law'
import { ALL_ELECTION_CITATIONS } from '@/lib/elections/law'
import { acknowledgementComplete, checkDraft, checkSelections, rankResults, votingWindow, type DraftInput } from './model'

const NOW = Date.parse('2026-11-02T12:00:00Z')
const draft = (over: Partial<DraftInput> = {}): DraftInput => ({
  kind: 'election',
  title: 'Board election',
  maxSelections: 2,
  options: ['Ann', 'Bo', 'Cy'],
  opensAt: '2026-11-03T12:00:00Z',
  closesAt: '2026-11-10T12:00:00Z',
  ...over,
})

describe('checkDraft', () => {
  it('accepts a contested election', () => {
    expect(checkDraft(draft(), NOW).ok).toBe(true)
  })
  it('refuses an uncontested race (no more candidates than seats)', () => {
    expect(checkDraft(draft({ options: ['Ann', 'Bo'] }), NOW).ok).toBe(false)
  })
  it('forces a question to one choice', () => {
    const r = checkDraft(draft({ kind: 'question', maxSelections: 5, options: ['Yes', 'No', 'Abstain'] }), NOW)
    expect(r.ok && r.value.maxSelections).toBe(1)
  })
  it('refuses duplicate choices ignoring case', () => {
    expect(checkDraft(draft({ options: ['Ann', 'ann', 'Cy'] }), NOW).ok).toBe(false)
  })
  it('refuses a window that closes before it opens or is already past', () => {
    expect(checkDraft(draft({ closesAt: '2026-11-03T00:00:00Z' }), NOW).ok).toBe(false)
    expect(checkDraft(draft({ opensAt: '2026-10-01T00:00:00Z', closesAt: '2026-10-02T00:00:00Z' }), NOW).ok).toBe(false)
  })
})

describe('acknowledgement', () => {
  it('needs every statement', () => {
    const all = ACK_STATEMENTS.map((s) => s.id)
    expect(acknowledgementComplete(all)).toBe(true)
    expect(acknowledgementComplete(all.slice(1))).toBe(false)
    expect(acknowledgementComplete([])).toBe(false)
  })
  it('has a versioned wording', () => {
    expect(ACK_TEXT_VERSION.length).toBeGreaterThan(0)
  })
})

describe('onlineVotingRule', () => {
  it('Georgia asks the board to check the bylaws and quotes a verified citation', () => {
    const r = onlineVotingRule('GA')
    expect(r.support).toBe('supported')
    expect(r.summary).toMatch(/bylaws decide/)
    for (const c of r.citations) expect(ALL_ELECTION_CITATIONS).toContain(c)
  })
  it('Florida cites only verified quotes and needs the documents to permit it', () => {
    const r = onlineVotingRule('FL')
    expect(r.citations.length).toBeGreaterThan(0)
    for (const c of r.citations) expect(ALL_ELECTION_CITATIONS).toContain(c)
  })
  it('California and Texas are off', () => {
    expect(onlineVotingRule('CA').support).toBe('not_supported')
    expect(onlineVotingRule('TX').support).toBe('not_supported')
  })
  it('copy has no em dashes', () => {
    for (const s of ['GA', 'FL', 'CA', 'NY']) expect(onlineVotingRule(s).summary).not.toContain('—')
    for (const a of ACK_STATEMENTS) expect(a.text).not.toContain('—')
  })
})

describe('checkSelections', () => {
  const ids = ['a', 'b', 'c']
  it('allows up to the seat count', () => {
    expect(checkSelections(['a', 'b'], ids, 2).ok).toBe(true)
  })
  it('refuses none, too many, duplicates and strangers', () => {
    expect(checkSelections([], ids, 2).ok).toBe(false)
    expect(checkSelections(['a', 'b', 'c'], ids, 2).ok).toBe(false)
    expect(checkSelections(['a', 'a'], ids, 2).ok).toBe(false)
    expect(checkSelections(['z'], ids, 2).ok).toBe(false)
  })
})

describe('votingWindow', () => {
  it('moves from not_yet to open to ended', () => {
    const o = '2026-11-03T00:00:00Z'
    const c = '2026-11-04T00:00:00Z'
    expect(votingWindow(o, c, Date.parse(o) - 1)).toBe('not_yet')
    expect(votingWindow(o, c, Date.parse(o))).toBe('open')
    expect(votingWindow(o, c, Date.parse(c))).toBe('ended')
  })
})

describe('rankResults', () => {
  const opt = (id: string, position: number, votes: number) => ({ option_id: id, label: id, position, votes })
  it('elects the top N', () => {
    const r = rankResults([opt('a', 0, 3), opt('b', 1, 9), opt('c', 2, 5)], 2)
    expect(r.map((x) => [x.optionId, x.outcome])).toEqual([['b', 'elected'], ['c', 'elected'], ['a', 'not_elected']])
  })
  it('flags a tie across the last seat and breaks nothing', () => {
    const r = rankResults([opt('a', 0, 5), opt('b', 1, 5), opt('c', 2, 9)], 2)
    expect(r.map((x) => x.outcome)).toEqual(['elected', 'tied', 'tied'])
  })
})
