import { describe, expect, it } from 'vitest'
import { hasUnfilledBlanks } from '../inbox/draft/blanks'
import {
  agreesWithSuggestion,
  canRunReview,
  citationLabel,
  decisionFeedback,
  ARC_LETTER_MAX,
  decisionLetter,
  decisionLetters,
  photosChanged,
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
  photoFindings: [],
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

const P1 = '66666666-6666-4666-8666-666666666661'
const CTX = { associationName: 'Maple Ridge HOA', title: 'Front fence' }

describe('decisionLetter (BL-079)', () => {
  it('approve: a full letter citing the rules checked, with the permit footer and the signature', () => {
    const l = decisionLetter({ ...OUT, rules: [{ ...OUT.rules[0]!, status: 'fits' }] }, 'approve', CTX)
    expect(l).toMatch(/^Dear Homeowner,\n\nRe: Your architectural review application — Front fence\n\n/)
    expect(l).toContain('has reviewed your application and approves it as submitted.')
    expect(l).toContain('- Rules § 4.2: Front fences may not exceed 4 feet.')
    expect(l).toContain('is not a building permit')
    expect(l).toMatch(/Sincerely,\n\nArchitectural Review Committee\nOn behalf of the Board of Directors\nMaple Ridge HOA$/)
    expect(hasUnfilledBlanks(l)).toBe(false)
  })

  it('approve with conditions: numbers the conditions and says they are part of the approval', () => {
    const l = decisionLetter(OUT, 'approve_with_conditions', CTX)
    expect(l).toContain('approves it, subject to the conditions below.')
    expect(l).toContain('1. Keep it at or under 4 feet.')
    expect(l).toContain('Work that does not meet them is not approved.')
    expect(hasUnfilledBlanks(l)).toBe(false)
  })

  it('approve with conditions but none suggested: a blank the board must fill before sending', () => {
    const l = decisionLetter({ ...OUT, suggestion: null }, 'approve_with_conditions', CTX)
    expect(l).toContain('1. [[BLANK: condition]]')
    expect(hasUnfilledBlanks(l)).toBe(true)
  })

  it('deny: gives the cited conflicts as the reasons, and says how to reapply or ask to reconsider', () => {
    const l = decisionLetter(OUT, 'deny', CTX)
    expect(l).toContain('cannot approve it as submitted')
    expect(l).toContain('- Rules § 4.2: Front fences may not exceed 4 feet.')
    expect(l).toContain('Please do not start this work.')
    expect(l).toContain('revised application')
    expect(l).toContain('reconsider')
    expect(l).not.toContain('building permit')
  })

  it('deny with no cited conflict: the reason is a blank, never invented', () => {
    const l = decisionLetter({ ...OUT, rules: [{ ...OUT.rules[0]!, status: 'fits' }] }, 'deny', CTX)
    expect(l).toContain('[[BLANK: reason]]')
    expect(l).not.toContain('Front fences may not exceed')
  })

  it('request info: lists the missing details and questions, and says nothing is decided yet', () => {
    const l = decisionLetter(OUT, 'need_more_info', CTX)
    expect(l).toContain('needs more information before it can decide')
    expect(l).toContain('- the exact colors (maker and color code)')
    expect(l).toContain('- Is it in the front or rear yard?')
    expect(l).toContain('No decision has been made on your application yet.')
    expect(l).not.toMatch(/\bapproved\b|\bdenied\b/)
  })

  it('never puts photo findings in the letter — they are low-confidence notes for the board', () => {
    const withPhotos = { ...OUT, photoFindings: [{ attachmentId: P1, photo: 'Photo 1', finding: 'Fence appears 6 ft.', confidence: 'low' as const }] }
    for (const k of ['approve', 'approve_with_conditions', 'deny', 'need_more_info'] as const) {
      expect(decisionLetter(withPhotos, k, CTX)).not.toContain('appears 6 ft')
    }
  })

  it('a refusal still gets a letter, with blanks where the rules would go', () => {
    const refusal = { ...OUT, status: 'no_rules' as const, rules: [], suggestion: null, questions: [], missingInfo: [] }
    expect(decisionLetter(refusal, 'deny', CTX)).toContain('[[BLANK: reason]]')
    expect(decisionLetter(refusal, 'need_more_info', CTX)).toContain('[[BLANK: details]]')
    expect(decisionLetter(refusal, 'approve', CTX)).not.toContain('We checked it against')
  })

  it('no review: no letter', () => {
    expect(decisionLetter(null, 'approve', CTX)).toBe('')
  })

  it('without an association name it still signs for the board; a long title is shortened', () => {
    const l = decisionLetter(OUT, 'approve', { associationName: null, title: 'x'.repeat(300) })
    expect(l).toMatch(/On behalf of the Board of Directors$/)
    expect(l.split('\n')[2]!.length).toBeLessThan(200)
  })

  it('always fits the 4,000-character board response', () => {
    const big: ArcReviewOutput = {
      ...OUT,
      rules: Array.from({ length: 8 }, (_, i) => ({ ...OUT.rules[0]!, chunkId: `${i}`, point: 'p'.repeat(400) })),
      suggestion: { decision: 'approve_with_conditions', reasoning: 'r', conditions: Array.from({ length: 8 }, () => 'c'.repeat(300)) },
    }
    for (const k of ['approve', 'approve_with_conditions', 'deny', 'need_more_info'] as const) {
      const l = decisionLetter(big, k, CTX)
      expect(l.length).toBeLessThanOrEqual(ARC_LETTER_MAX)
      expect(l).toContain('Sincerely,')
    }
  })

  it('decisionLetters drafts all four', () => {
    const all = decisionLetters(OUT, CTX)
    expect(Object.keys(all).sort()).toEqual(['approve', 'approve_with_conditions', 'deny', 'need_more_info'])
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

  it('reads photo findings, dropping malformed ones and capping confidence at medium', () => {
    const out = readArcReviewOutput({
      ...OUT,
      photoFindings: [
        { attachmentId: P1, photo: 'Photo 1', finding: 'Wood fence.', confidence: 'low' },
        { attachmentId: P1, photo: 'Photo 1', finding: 'Dark stain.', confidence: 'high' },
        { attachmentId: P1, finding: '' },
        'nope',
      ],
    })
    expect(out?.photoFindings).toEqual([
      { attachmentId: P1, photo: 'Photo 1', finding: 'Wood fence.', confidence: 'low' },
      { attachmentId: P1, photo: 'Photo 1', finding: 'Dark stain.', confidence: 'medium' },
    ])
  })

  it('an output stored before photo findings existed reads with none', () => {
    const { photoFindings: _p, ...old } = OUT
    expect(readArcReviewOutput(old)?.photoFindings).toEqual([])
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
    expect(readReviewRun(row)).toMatchObject({ runId: 'run-1', state: 'pending', arcRequestId: 'arc-1', precheckRunId: 'pre-1', photoIds: [] })
    expect(readReviewRun({ ...row, input: { ...row.input, photos: [{ attachmentId: P1, label: 'Photo 1' }, { bad: 1 }] } }).photoIds).toEqual([P1])
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

  it('a waiting review can be re-run when the photos changed since it ran', () => {
    expect(canRunReview(pending, 'in_review', { photosChanged: true })).toBe(true)
    expect(canRunReview(pending, 'approved', { photosChanged: true })).toBe(false)
  })
})

describe('photosChanged', () => {
  const P2 = '66666666-6666-4666-8666-666666666662'
  it('compares the photos a review read with the ones it would read now, ignoring order', () => {
    expect(photosChanged([P1], [P1])).toBe(false)
    expect(photosChanged([P1, P2], [P2, P1])).toBe(false)
    expect(photosChanged([], [P1])).toBe(true)
    expect(photosChanged([P1], [P2])).toBe(true)
    expect(photosChanged([P1, P2], [P1])).toBe(true)
  })
})
