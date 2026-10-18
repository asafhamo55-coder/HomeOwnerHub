import { describe, expect, it } from 'vitest'
import {
  agreesWithSuggestion,
  canRunReview,
  citationLabel,
  decisionFeedback,
  draftFor,
  readArcReviewOutput,
  readReviewRun,
  runSummary,
  type ArcReviewOutput,
} from './model'

const C1 = '11111111-1111-4111-8111-111111111111'
const D1 = '33333333-3333-4333-8333-333333333333'

const OUT: ArcReviewOutput = {
  mode: 'review',
  status: 'answered',
  summary: 'Rear fences are limited to 6 feet.',
  confidence: 'HIGH',
  rules: [
    { chunkId: C1, documentId: D1, docType: 'rules', section: '4.2', point: 'Front fences may not exceed 4 feet.', status: 'possible_conflict' },
  ],
  questions: ['Is it in the front or rear yard?'],
  missingInfo: ['colors'],
  suggestion: { decision: 'approve_with_conditions', reasoning: 'Fine if kept to 4 feet.', conditions: ['Keep it at or under 4 feet.'] },
  warnings: [],
  disclaimer: 'A suggestion only.',
}

describe('agreesWithSuggestion', () => {
  it.each([
    ['approved', 'approve', true],
    ['approved', 'approve_with_conditions', true],
    ['approved', 'deny', false],
    ['denied', 'deny', true],
    ['denied', 'need_more_info', false],
    ['more_info', 'need_more_info', true],
    ['more_info', 'approve', false],
  ] as const)('board %s vs AI %s → %s', (board, ai, expected) => {
    expect(agreesWithSuggestion(board, ai)).toBe(expected)
  })

  it('no suggestion → null (nothing to agree with)', () => {
    expect(agreesWithSuggestion('approved', null)).toBeNull()
  })
})

describe('decisionFeedback', () => {
  it('records the decision against the suggestion, with no application text', () => {
    expect(decisionFeedback('denied', 'approve_with_conditions')).toBe('Board denied. AI suggested: approve with conditions.')
    expect(decisionFeedback('more_info', null)).toBe('Board asked the resident for more information. AI suggested: no suggestion.')
  })
})

describe('citationLabel', () => {
  it('names the document and section', () => {
    expect(citationLabel({ docType: 'rules', section: '4.2' })).toBe('Rules § 4.2')
    expect(citationLabel({ docType: 'declaration', section: null })).toBe('Declaration')
    expect(citationLabel({ docType: 'policy', section: 'p.3' })).toBe('Policy, p.3')
    expect(citationLabel({ docType: 'handbook', section: '2' })).toBe('Handbook § 2')
  })
})

describe('draftFor', () => {
  it('approve: the suggested conditions', () => {
    expect(draftFor(OUT, 'approved')).toBe('Approved with these conditions:\n- Keep it at or under 4 feet.')
  })

  it('deny: the cited conflicts only', () => {
    expect(draftFor(OUT, 'denied')).toBe('The application conflicts with:\n- Rules § 4.2: Front fences may not exceed 4 feet.')
  })

  it('more info: the missing details, then the AI’s questions', () => {
    expect(draftFor(OUT, 'more_info')).toBe(
      'Before the board can decide, please send:\n- the exact colors (maker and color code)\n- Is it in the front or rear yard?',
    )
  })

  it('nothing to draft from a refusal or a missing run', () => {
    expect(draftFor(null, 'approved')).toBe('')
    expect(draftFor({ ...OUT, status: 'no_rules' }, 'denied')).toBe('')
  })

  it('deny with no cited conflict drafts nothing (the board writes the reason)', () => {
    expect(draftFor({ ...OUT, rules: [{ ...OUT.rules[0]!, status: 'fits' }] }, 'denied')).toBe('')
  })
})

describe('readArcReviewOutput', () => {
  it('round-trips a stored output', () => {
    expect(readArcReviewOutput(JSON.parse(JSON.stringify(OUT)))).toEqual(OUT)
  })

  it('a failed run’s { _error } is not an output', () => {
    expect(readArcReviewOutput({ _error: 'x' })).toBeNull()
    expect(readArcReviewOutput(null)).toBeNull()
  })

  it('drops malformed rules and unknown decisions', () => {
    const out = readArcReviewOutput({
      ...OUT,
      rules: [{ chunkId: C1 }, OUT.rules[0]],
      suggestion: { decision: 'maybe', reasoning: 'x', conditions: [] },
      missingInfo: ['colors', 'vibes'],
    })
    expect(out?.rules).toHaveLength(1)
    expect(out?.suggestion).toBeNull()
    expect(out?.missingInfo).toEqual(['colors'])
  })
})

describe('readReviewRun', () => {
  const row = {
    id: 'run-1',
    status: 'pending_human_approval',
    created_at: '2026-10-18T10:00:00Z',
    input: { mode: 'review', arcRequestId: 'arc-1', precheckRunId: 'pre-1', facts: { summary: 'Rear fence' } },
    output: OUT,
    human_approved: null,
    human_feedback: null,
  }

  it('pending, with the links from its input', () => {
    expect(readReviewRun(row)).toMatchObject({ runId: 'run-1', state: 'pending', arcRequestId: 'arc-1', precheckRunId: 'pre-1' })
    expect(runSummary(row.input)).toBe('Rear fence')
  })

  it('decided and failed', () => {
    expect(readReviewRun({ ...row, status: 'completed', human_approved: true }).state).toBe('decided')
    expect(readReviewRun({ ...row, status: 'failed', output: { _error: 'x' } })).toMatchObject({ state: 'failed', output: null })
  })
})

describe('canRunReview', () => {
  const pending = readReviewRun({
    id: 'r',
    status: 'pending_human_approval',
    created_at: null,
    input: {},
    output: OUT,
    human_approved: null,
    human_feedback: null,
  })
  it('not while one is waiting, and only on an open application', () => {
    expect(canRunReview(null, 'submitted')).toBe(true)
    expect(canRunReview(pending, 'in_review')).toBe(false)
    expect(canRunReview({ ...pending, state: 'failed' }, 'in_review')).toBe(true)
    expect(canRunReview(null, 'approved')).toBe(false)
    expect(canRunReview(null, 'withdrawn')).toBe(false)
  })
})
