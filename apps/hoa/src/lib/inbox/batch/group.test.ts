import { describe, expect, it } from 'vitest'
import { MAX_BATCH, areSimilar, groupSimilarThreads, isBatchCandidate, stripReplyPrefixes, type GroupableThread } from './group'

// Synthetic subjects and openings only.
let n = 0
const t = (subject: string | null, snippet: string | null = null, over: Partial<GroupableThread> = {}): GroupableThread => ({
  id: `t-${++n}`,
  subject,
  snippet,
  status: 'needs_review',
  lastDirection: 'inbound',
  fromEmail: `r${n}@example.test`,
  ...over,
})

describe('stripReplyPrefixes', () => {
  it('removes stacked Re/Fwd prefixes', () => {
    expect(stripReplyPrefixes('Re: Fwd: RE: Pool hours')).toBe('Pool hours')
    expect(stripReplyPrefixes('Pool hours')).toBe('Pool hours')
  })
})

describe('areSimilar', () => {
  it('matches the same question worded differently', () => {
    expect(areSimilar(t('When will the pool reopen?'), t('Re: Pool reopening date'))).toBe(true)
    expect(
      areSimilar(
        t('Question', 'When does the pool resurfacing finish and the pool reopen?'),
        t('Hi board', 'Is there a date for the pool resurfacing to finish? When will it reopen?'),
      ),
    ).toBe(true)
  })

  it('does not match different topics or generic subjects alone', () => {
    expect(areSimilar(t('Pool hours'), t('Gate fob not working'))).toBe(false)
    expect(areSimilar(t('Question'), t('Question'))).toBe(false)
    expect(areSimilar(t('Pool fence repair', 'The fence by the pool is broken'), t('Pool hours', 'What time does the pool open'))).toBe(false)
  })
})

describe('isBatchCandidate', () => {
  it('only open threads where the resident wrote last and a sender exists', () => {
    expect(isBatchCandidate(t('x'))).toBe(true)
    expect(isBatchCandidate(t('x', null, { status: 'closed' }))).toBe(false)
    expect(isBatchCandidate(t('x', null, { status: 'waiting' }))).toBe(false)
    expect(isBatchCandidate(t('x', null, { lastDirection: 'outbound' }))).toBe(false)
    expect(isBatchCandidate(t('x', null, { fromEmail: null }))).toBe(false)
  })
})

describe('groupSimilarThreads', () => {
  it('groups look-alikes, largest first, and leaves singletons out', () => {
    const a1 = t('When will the pool reopen?')
    const b1 = t('Trash pickup day changed?')
    const a2 = t('Pool reopen date')
    const c = t('Gate fob not working')
    const b2 = t('Re: trash pickup day')
    const a3 = t('Pool reopening?', 'When will the pool reopen after resurfacing')
    const groups = groupSimilarThreads([a1, b1, a2, c, b2, a3])
    expect(groups).toEqual([
      { label: 'When will the pool reopen?', threadIds: [a1.id, a2.id, a3.id] },
      { label: 'Trash pickup day changed?', threadIds: [b1.id, b2.id] },
    ])
  })

  it('is seed-based, not transitive', () => {
    const seed = t('Pool hours summer')
    const bridge = t('Pool hours summer fence')
    const far = t('Fence hours summer repair')
    // far looks like bridge, but not like the group's seed.
    expect(areSimilar(bridge, far)).toBe(true)
    expect(areSimilar(seed, far)).toBe(false)
    const groups = groupSimilarThreads([seed, bridge, far])
    expect(groups).toEqual([{ label: 'Pool hours summer', threadIds: [seed.id, bridge.id] }])
  })

  it('skips non-candidates and caps a group at MAX_BATCH', () => {
    const many = Array.from({ length: MAX_BATCH + 3 }, () => t('Pool reopening date'))
    const closed = t('Pool reopening date', null, { status: 'closed' })
    const groups = groupSimilarThreads([...many, closed])
    expect(groups[0]!.threadIds).toHaveLength(MAX_BATCH)
    expect(groups.flatMap((g) => g.threadIds)).not.toContain(closed.id)
  })
})
