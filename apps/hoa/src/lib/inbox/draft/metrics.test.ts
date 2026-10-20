import { describe, it, expect } from 'vitest'
import {
  citationRetention,
  computeDraftMetrics,
  countBlankMarkers,
  draftMetricsAuditRow,
  editRatio,
  formatApproveTime,
  formatPercent,
  median,
  parseDraftMetrics,
  summarizeDraftMetrics,
  wordEditDistance,
  type DraftMetrics,
} from './metrics'

const DRAFT_ID = '11111111-1111-4111-8111-111111111111'
const THREAD_ID = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '33333333-3333-4333-8333-333333333333'

function metrics(over: Partial<DraftMetrics> = {}): DraftMetrics {
  return {
    v: 1,
    draft_id: DRAFT_ID,
    thread_id: THREAD_ID,
    ai_run_id: RUN_ID,
    edit_ratio: 0,
    edit_words: 0,
    draft_words: 10,
    sent_words: 10,
    subject_edited: false,
    blanks_at_draft: 0,
    citations_total: 0,
    citations_in_draft: 0,
    citations_kept: 0,
    seconds_to_approve: 60,
    truncated: false,
    ...over,
  }
}

describe('wordEditDistance / editRatio', () => {
  it('is 0 for identical text, ignoring whitespace layout', () => {
    expect(editRatio('Thanks for  writing.\nBest', 'Thanks for writing. Best').ratio).toBe(0)
  })

  it('counts word substitutions, insertions and deletions', () => {
    expect(wordEditDistance(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1)
    expect(wordEditDistance(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(2)
    expect(wordEditDistance(['a', 'b', 'c'], [])).toBe(3)
  })

  it('ratio is distance over the longer body, rounded to 3 decimals', () => {
    const r = editRatio('one two three four five six', 'one two three four five seven')
    expect(r.distance).toBe(1)
    expect(r.ratio).toBe(0.167)
    expect(editRatio('', '').ratio).toBe(0)
    expect(editRatio('a b', 'x y z w').ratio).toBe(1)
  })

  it('caps very long bodies and says so', () => {
    const long = Array.from({ length: 3100 }, (_, i) => `w${i}`).join(' ')
    const r = editRatio(long, long)
    expect(r.truncated).toBe(true)
    expect(r.ratio).toBe(0)
  })
})

describe('countBlankMarkers', () => {
  it('counts every marker, tolerant of spacing', () => {
    expect(countBlankMarkers('Fee is [[BLANK: money]] and [[ blank : legal ]].')).toBe(2)
    expect(countBlankMarkers('no blanks')).toBe(0)
  })
})

describe('citationRetention', () => {
  const citations = [{ quote: 'fences may not exceed six feet' }, { quote: 'not in body' }, { quote: 'quiet hours begin at 10pm' }]
  it('counts only quotes present in the draft, and how many survived', () => {
    const draft = 'Per the CC&Rs, "fences may not exceed six feet". Also quiet hours begin\nat 10pm.'
    const sent = 'Per the CC&Rs, "fences may not exceed six feet".'
    expect(citationRetention(citations, draft, sent)).toEqual({ total: 3, inDraft: 2, kept: 1 })
  })
  it('ignores malformed citations', () => {
    expect(citationRetention([{ quote: 42 }, {}], 'x', 'x')).toEqual({ total: 2, inDraft: 0, kept: 0 })
  })
})

describe('computeDraftMetrics', () => {
  const base = {
    draftId: DRAFT_ID,
    threadId: THREAD_ID,
    aiRunId: RUN_ID,
    draftSubject: 'Re: Fence height',
    draftBody: 'Hi Jane, fences may not exceed six feet. The fee is [[BLANK: money]].',
    sentSubject: 'Re: Fence height',
    sentBody: 'Hi Jane, fences may not exceed six feet. The fee is $25.',
    citations: [{ refId: 'doc:1', quote: 'fences may not exceed six feet', label: 'CC&Rs 4.2' }],
    createdAt: '2026-10-20T10:00:00.000Z',
    approvedAt: new Date('2026-10-20T10:03:00.000Z'),
  }

  it('produces the expected numbers', () => {
    const m = computeDraftMetrics(base)
    expect(m).toMatchObject({
      draft_id: DRAFT_ID,
      thread_id: THREAD_ID,
      ai_run_id: RUN_ID,
      // "[[BLANK: money]]." is two words; "$25." is one.
      edit_words: 2,
      blanks_at_draft: 1,
      citations_total: 1,
      citations_in_draft: 1,
      citations_kept: 1,
      seconds_to_approve: 180,
      subject_edited: false,
      truncated: false,
    })
    expect(m.edit_ratio).toBeGreaterThan(0)
    expect(m.edit_ratio).toBeLessThan(0.2)
  })

  it('never goes negative on clock skew and survives a bad timestamp', () => {
    expect(computeDraftMetrics({ ...base, approvedAt: new Date('2026-10-20T09:00:00Z') }).seconds_to_approve).toBe(0)
    expect(computeDraftMetrics({ ...base, createdAt: 'nope' }).seconds_to_approve).toBe(0)
  })

  it('stores no text: every string in the payload is an id', () => {
    const m = computeDraftMetrics(base)
    const row = draftMetricsAuditRow({ orgId: 'org-1', userId: 'user-1', metrics: m })
    const json = JSON.stringify(row)
    for (const fragment of ['Jane', 'Fence', 'fences', 'six feet', 'BLANK', 'CC&Rs', '$25', 'doc:1']) {
      expect(json).not.toContain(fragment)
    }
    const strings = Object.values(m).filter((v) => typeof v === 'string')
    expect(strings.sort()).toEqual([DRAFT_ID, RUN_ID, THREAD_ID].sort())
    expect(parseDraftMetrics(row.metadata)).toEqual(m)
    expect(row).toMatchObject({ action: 'inbox_draft_metrics', org_id: 'org-1', entity_type: 'inbox_draft', entity_id: DRAFT_ID })
  })
})

describe('parseDraftMetrics', () => {
  it('rejects a payload carrying any extra (text) field', () => {
    expect(parseDraftMetrics({ ...metrics(), body: 'Hi Jane' })).toBeNull()
  })
  it('rejects non-uuid ids, non-numbers and junk', () => {
    expect(parseDraftMetrics({ ...metrics(), draft_id: 'Jane Doe' })).toBeNull()
    expect(parseDraftMetrics({ ...metrics(), thread_id: 'x' })).toBeNull()
    expect(parseDraftMetrics({ ...metrics(), edit_ratio: '0.1' })).toBeNull()
    expect(parseDraftMetrics({ ...metrics(), seconds_to_approve: Number.NaN })).toBeNull()
    expect(parseDraftMetrics(null)).toBeNull()
    expect(parseDraftMetrics([])).toBeNull()
  })
  it('accepts null thread/run ids', () => {
    expect(parseDraftMetrics(metrics({ thread_id: null, ai_run_id: null }))).not.toBeNull()
  })
})

describe('summarizeDraftMetrics', () => {
  it('is all-null for no drafts', () => {
    expect(summarizeDraftMetrics([])).toEqual({
      drafts: 0,
      lightEditShare: null,
      unchangedShare: null,
      medianEditRatio: null,
      medianSecondsToApprove: null,
      medianBlanks: null,
      citationsKeptShare: null,
    })
  })

  it('computes shares and medians', () => {
    const s = summarizeDraftMetrics([
      metrics({ edit_ratio: 0, edit_words: 0, seconds_to_approve: 60, blanks_at_draft: 0 }),
      metrics({ edit_ratio: 0.1, edit_words: 3, seconds_to_approve: 180, blanks_at_draft: 1, citations_in_draft: 2, citations_kept: 2 }),
      metrics({ edit_ratio: 0.2, edit_words: 6, seconds_to_approve: 240, blanks_at_draft: 2, citations_in_draft: 1, citations_kept: 0 }),
      metrics({ edit_ratio: 0.8, edit_words: 40, seconds_to_approve: 3600, blanks_at_draft: 3 }),
    ])
    expect(s.drafts).toBe(4)
    expect(s.lightEditShare).toBe(0.75)
    expect(s.unchangedShare).toBe(0.25)
    expect(s.medianEditRatio).toBeCloseTo(0.15)
    expect(s.medianSecondsToApprove).toBe(210)
    expect(s.medianBlanks).toBe(1.5)
    expect(s.citationsKeptShare).toBe(0.5)
  })
})

describe('helpers', () => {
  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('formats', () => {
    expect(formatPercent(0.723)).toBe('72%')
    expect(formatPercent(null)).toBe('—')
    expect(formatApproveTime(45)).toBe('45 sec')
    expect(formatApproveTime(180)).toBe('3 min')
    expect(formatApproveTime(9000)).toBe('2.5 h')
    expect(formatApproveTime(86_400)).toBe('1 day')
    expect(formatApproveTime(null)).toBe('—')
  })
})
