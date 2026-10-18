import { describe, expect, it, vi } from 'vitest'

// The workflow wrapper persists to ai_runs through the admin client; these
// tests drive the pure halves and the run body only — no DB, no model.
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => {
    throw new Error('no db in unit tests')
  },
}))

import { findContactPII } from '@homeowner-portal/ai/pii'
import {
  buildArcFacts,
  detectMissingInfo,
  processArcReviewResponse,
  retrievalQueryFor,
  runArcReview,
  stripVerdicts,
  ARC_PRECHECK_REFUSAL,
  type ArcReviewInput,
  type ArcReviewModel,
  type ArcRetrieve,
} from './index'
import { PRECHECK_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT, userPromptFor } from './prompt'
import { ARC_EVAL_CASES } from './eval'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const D1 = '33333333-3333-4333-8333-333333333333'
const ARC = '44444444-4444-4444-8444-444444444444'
const ORG = '55555555-5555-4555-8555-555555555555'

const CHUNKS = [
  { id: C1, documentId: D1, docType: 'rules', section: '4.2', effectiveDate: null, text: 'Fences may not exceed 6 feet in rear yards.', score: 0.8 },
  { id: C2, documentId: D1, docType: 'declaration', section: '7.1', effectiveDate: null, text: 'Exterior changes need prior ARC approval.', score: 0.6 },
]

const FENCE = buildArcFacts({
  category: 'fence',
  summary: 'Replace back-yard fence',
  scopeDescription: 'Replace the old fence with a 6 ft white vinyl privacy fence along the rear lot line.',
  proposedStart: '2026-11-01',
  proposedCompletion: null,
  contractorName: 'Sample Fence Co',
  contractorLicense: null,
})

function reply(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    summary: 'Rear fences are limited to 6 feet and need ARC approval first.',
    confidence: 'HIGH',
    rules: [
      { chunk_id: C1, point: 'Rear-yard fences can be at most 6 feet tall.', status: 'fits' },
      { chunk_id: C2, point: 'Exterior changes need ARC approval before work starts.', status: 'unclear' },
    ],
    questions: ['Where exactly on the lot does the fence run?'],
    suggestion: {
      decision: 'approve_with_conditions',
      reasoning: 'The fence meets the 6-foot rear-yard limit.',
      conditions: ['Keep the fence at or under 6 feet.'],
    },
    ...over,
  })
}

describe('buildArcFacts', () => {
  it('keeps the request but strips contact details, and keeps only yes/no for dates and the contractor', () => {
    const f = buildArcFacts({
      category: 'paint',
      summary: 'Paint house — call me at 305-555-0142',
      scopeDescription: 'Repaint in SW 7006 Extra White. Questions to jane.owner@example.com or (305) 555-0199.',
      proposedStart: null,
      proposedCompletion: '2026-12-01',
      contractorName: 'Brush Bros',
      contractorLicense: 'CBC123',
    })
    expect(findContactPII(JSON.stringify(f))).toEqual([])
    expect(f.scopeDescription).toContain('[email removed]')
    expect(f.summary).toContain('[phone removed]')
    expect(f).toMatchObject({ category: 'paint', hasStartDate: false, hasCompletionDate: true, hasContractor: true, hasContractorLicense: true })
    expect(JSON.stringify(f)).not.toContain('Brush Bros')
    expect(JSON.stringify(f)).not.toContain('CBC123')
  })
})

describe('detectMissingInfo', () => {
  it('a complete fence request is missing nothing but its completion date is fine', () => {
    expect(detectMissingInfo(FENCE)).toEqual([])
  })

  it('names what a vague fence request leaves out', () => {
    const f = buildArcFacts({ category: 'fence', summary: 'New fence', scopeDescription: 'I want to put up a new fence around the yard please.' })
    expect(detectMissingInfo(f)).toEqual(['dimensions', 'materials', 'colors', 'contractor', 'dates'])
  })

  it('a paint request needs colors, not dimensions', () => {
    const f = buildArcFacts({ category: 'paint', summary: 'Repaint', scopeDescription: 'Repaint the body of the house this spring.' })
    expect(detectMissingInfo(f)).toEqual(['colors', 'contractor', 'dates'])
  })

  it('doing it yourself counts as an answer to "who does the work"', () => {
    const f = buildArcFacts({
      category: 'paint',
      summary: 'Repaint',
      scopeDescription: 'I will do it myself, color Benjamin Moore Hale Navy.',
      proposedStart: '2026-11-01',
    })
    expect(detectMissingInfo(f)).toEqual([])
  })
})

describe('stripVerdicts', () => {
  it.each([
    'Your request is approved.',
    'This looks pre-approved by the rules.',
    'The board would deny this.',
    'You can go ahead and start.',
    'It will be rejected.',
  ])('drops a verdict sentence: %s', (s) => {
    expect(stripVerdicts(`Fences are limited to 6 feet. ${s}`)).toBe('Fences are limited to 6 feet.')
  })

  it('keeps "approval" when it describes the process', () => {
    expect(stripVerdicts('Exterior changes need ARC approval before work starts.')).toBe(
      'Exterior changes need ARC approval before work starts.',
    )
  })
})

describe('processArcReviewResponse — precheck', () => {
  const opts = { mode: 'precheck' as const, retrieved: CHUNKS, facts: FENCE }

  it('keeps cited rules, maps them to their document, and never carries a suggestion', () => {
    const out = processArcReviewResponse(reply(), opts)
    expect(out.status).toBe('answered')
    expect(out.rules).toEqual([
      { chunkId: C1, documentId: D1, docType: 'rules', section: '4.2', point: 'Rear-yard fences can be at most 6 feet tall.', status: 'fits' },
      { chunkId: C2, documentId: D1, docType: 'declaration', section: '7.1', point: 'Exterior changes need ARC approval before work starts.', status: 'unclear' },
    ])
    expect(out.suggestion).toBeNull()
    expect(out.disclaimer).toMatch(/Only the board/)
  })

  it('drops a rule whose chunk was never retrieved', () => {
    const out = processArcReviewResponse(
      reply({ rules: [{ chunk_id: '99999999-9999-4999-8999-999999999999', point: 'Invented.', status: 'fits' }, { chunk_id: C1, point: 'Six feet.', status: 'fits' }] }),
      opts,
    )
    expect(out.rules.map((r) => r.chunkId)).toEqual([C1])
  })

  it('never says approved, even when the model does', () => {
    const out = processArcReviewResponse(
      reply({
        summary: 'Good news: this is approved. Rear fences are limited to 6 feet.',
        rules: [{ chunk_id: C1, point: 'Six feet max. You can go ahead.', status: 'fits' }],
        questions: ['Approved colors?', 'Will it be denied if it is 7 feet?'],
      }),
      opts,
    )
    const text = JSON.stringify(out)
    expect(text).not.toMatch(/\bapproved\b/i)
    expect(text).not.toMatch(/\bdenied\b/i)
    expect(text).not.toMatch(/go ahead/i)
    expect(out.summary).toBe('Rear fences are limited to 6 feet.')
  })

  it('refuses when the model reports LOW confidence', () => {
    const out = processArcReviewResponse(reply({ confidence: 'LOW' }), opts)
    expect(out.status).toBe('no_rules')
    expect(out.summary).toBe(ARC_PRECHECK_REFUSAL)
    expect(out.rules).toEqual([])
  })

  it('refuses when no cited rule survives validation', () => {
    const out = processArcReviewResponse(reply({ rules: [] }), opts)
    expect(out.status).toBe('no_rules')
  })

  it('still lists what is missing on a refusal (deterministic, not model)', () => {
    const vague = buildArcFacts({ category: 'fence', summary: 'Fence', scopeDescription: 'A new fence around the yard, please.' })
    const out = processArcReviewResponse(reply({ confidence: 'LOW' }), { ...opts, facts: vague })
    expect(out.missingInfo).toContain('dimensions')
    expect(out.questions).toEqual([])
  })

  it('throws a generic error on unparseable output, never echoing it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => processArcReviewResponse('Fence at 12 Secret Lane', opts)).toThrow(/unparseable/)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Secret Lane')
    spy.mockRestore()
  })
})

describe('processArcReviewResponse — board review', () => {
  const opts = { mode: 'review' as const, retrieved: CHUNKS, facts: FENCE }

  it('keeps the suggestion with reasoning and conditions', () => {
    const out = processArcReviewResponse(reply(), opts)
    expect(out.suggestion).toEqual({
      decision: 'approve_with_conditions',
      reasoning: 'The fence meets the 6-foot rear-yard limit.',
      conditions: ['Keep the fence at or under 6 feet.'],
    })
    expect(out.warnings).toEqual([])
  })

  it('a denial with no cited conflict becomes need more info, and says so', () => {
    const out = processArcReviewResponse(reply({ suggestion: { decision: 'deny', reasoning: 'Seems too tall.', conditions: [] } }), opts)
    expect(out.suggestion?.decision).toBe('need_more_info')
    expect(out.warnings.join(' ')).toMatch(/no conflicting rule/)
  })

  it('a denial backed by a cited conflict stands', () => {
    const out = processArcReviewResponse(
      reply({
        rules: [{ chunk_id: C1, point: 'Six feet max.', status: 'possible_conflict' }],
        suggestion: { decision: 'deny', reasoning: 'The fence is 8 feet.', conditions: [] },
      }),
      opts,
    )
    expect(out.suggestion?.decision).toBe('deny')
  })

  it('approve with conditions but no conditions is plain approve', () => {
    const out = processArcReviewResponse(reply({ suggestion: { decision: 'approve_with_conditions', reasoning: 'Fine.', conditions: [] } }), opts)
    expect(out.suggestion).toEqual({ decision: 'approve', reasoning: 'Fine.', conditions: [] })
  })

  it('an unknown decision is need more info', () => {
    const out = processArcReviewResponse(reply({ suggestion: { decision: 'maybe', reasoning: 'Hm.', conditions: [] } }), opts)
    expect(out.suggestion?.decision).toBe('need_more_info')
  })

  it('a refusal carries no suggestion', () => {
    const out = processArcReviewResponse(reply({ confidence: 'LOW' }), opts)
    expect(out.status).toBe('no_rules')
    expect(out.suggestion).toBeNull()
  })
})

function api() {
  return {
    requireHumanApproval: vi.fn(),
    addCitations: vi.fn(),
    setConfidence: vi.fn(),
    setReasoning: vi.fn(),
    setTokens: vi.fn(),
    setModel: vi.fn(),
  }
}

function fakeModel(content = reply()): ArcReviewModel {
  return { complete: vi.fn(async () => ({ content, model: 'm', tokensIn: 5, tokensOut: 7 })) }
}

function fakeRetrieve(chunks = CHUNKS): ArcRetrieve {
  return vi.fn(async () => chunks)
}

const PRECHECK: ArcReviewInput = { mode: 'precheck', facts: FENCE, associationId: null, allowedDocTypes: ['rules', 'declaration'] }
const REVIEW: ArcReviewInput = { mode: 'review', facts: FENCE, associationId: null, arcRequestId: ARC, precheckRunId: null }

describe('runArcReview', () => {
  it('precheck: retrieves with the resident allowlist, never asks for approval routing', async () => {
    const a = api()
    const r = fakeRetrieve()
    const m = fakeModel()
    const out = await runArcReview(PRECHECK, a, { organizationId: ORG }, { model: m, retrieve: r })
    expect(r).toHaveBeenCalledWith(expect.stringContaining('Fence'), {
      organizationId: ORG,
      associationId: null,
      limit: 8,
      allowedDocTypes: ['rules', 'declaration'],
    })
    expect(m.complete).toHaveBeenCalledWith(PRECHECK_SYSTEM_PROMPT, expect.any(String))
    expect(a.requireHumanApproval).not.toHaveBeenCalled()
    expect(a.addCitations).toHaveBeenCalledWith([C1, C2])
    expect(out.status).toBe('answered')
  })

  it('review: lands for human approval, records the reasoning', async () => {
    const a = api()
    const m = fakeModel()
    const out = await runArcReview(REVIEW, a, { organizationId: ORG }, { model: m, retrieve: fakeRetrieve() })
    expect(m.complete).toHaveBeenCalledWith(REVIEW_SYSTEM_PROMPT, expect.any(String))
    expect(a.requireHumanApproval).toHaveBeenCalled()
    expect(a.setReasoning).toHaveBeenCalledWith('The fence meets the 6-foot rear-yard limit.')
    expect(out.suggestion?.decision).toBe('approve_with_conditions')
  })

  it('nothing retrieved: refuses without calling the model', async () => {
    const m = fakeModel()
    const a = api()
    const out = await runArcReview(PRECHECK, a, { organizationId: ORG }, { model: m, retrieve: fakeRetrieve([]) })
    expect(m.complete).not.toHaveBeenCalled()
    expect(out.status).toBe('no_rules')
    expect(a.setConfidence).toHaveBeenCalledWith(0)
  })

  it('the prompt carries no contact details or contractor identity', async () => {
    const facts = buildArcFacts({
      category: 'deck_patio',
      summary: 'Deck for jane@example.com',
      scopeDescription: 'Build a 12x16 cedar deck. Text me at 305.555.0143 with questions.',
      contractorName: 'Deck Pros LLC',
      contractorLicense: 'LIC-77',
    })
    const prompt = userPromptFor(
      { categoryLabel: 'Deck', summary: facts.summary, scopeDescription: facts.scopeDescription, hasStartDate: false, hasCompletionDate: false, hasContractor: true, hasContractorLicense: true },
      CHUNKS,
    )
    expect(findContactPII(prompt)).toEqual([])
    expect(prompt).not.toContain('Deck Pros')
    expect(prompt).not.toContain('LIC-77')
  })

  it('retrieval query uses the category, summary and a slice of the description', () => {
    const q = retrievalQueryFor(FENCE)
    expect(q).toMatch(/^Fence or wall/)
    expect(q.length).toBeLessThanOrEqual(700)
  })
})

describe('eval set', () => {
  it('has 8 fixtures with unique ids', () => {
    expect(ARC_EVAL_CASES).toHaveLength(8)
    expect(new Set(ARC_EVAL_CASES.map((c) => c.id)).size).toBe(8)
  })

  it.each(ARC_EVAL_CASES.map((c) => [c.id, c] as const))('%s: the canned reply normalizes as expected', (_id, c) => {
    const facts = buildArcFacts(c.request)
    const out = processArcReviewResponse(c.cannedReply, { mode: 'review', retrieved: c.chunks, facts })
    expect(out.status).toBe(c.expected.status)
    expect(out.suggestion?.decision ?? null).toBe(c.expected.decision)
    expect(out.rules.map((r) => r.chunkId).sort()).toEqual([...c.expected.citedChunkIds].sort())
    for (const m of c.expected.missingInfo ?? []) expect(out.missingInfo).toContain(m)
  })
})
