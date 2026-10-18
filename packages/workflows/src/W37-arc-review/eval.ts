// W37 — ARC Review. Eval set: 8 fixture applications (BL-027 acceptance).
//
// Each case is an application, the governing-document chunks retrieval
// would return, a canned model reply, and what a correct pipeline must end
// with. The unit suite (index.test.ts) runs every case through
// processArcReviewResponse with the canned reply — no model is called in
// CI. To score a real model, feed `request` + `chunks` to runArcReview with
// liveArcReviewModel and compare against `expected`. The canned replies are
// deliberately imperfect in the ways real replies are (a fenced reply, an
// invented chunk id, a denial with no cited conflict, LOW confidence), so
// the deterministic half is exercised on the same failure modes.
//
// Invented communities and requests only. No real people or addresses.

import type { RetrievedChunk } from '../W1-governing-docs-brain/tools'
import type { ArcMissingInfo, ArcRequestFields, ArcSuggestedDecision } from './index'

export interface ArcEvalCase {
  id: string
  request: ArcRequestFields
  chunks: RetrievedChunk[]
  cannedReply: string
  expected: {
    status: 'answered' | 'no_rules'
    decision: ArcSuggestedDecision | null
    citedChunkIds: string[]
    missingInfo?: ArcMissingInfo[]
  }
}

const DOC = 'd0000000-0000-4000-8000-000000000001'
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function chunk(n: number, docType: string, section: string, text: string): RetrievedChunk {
  return { id: id(n), documentId: DOC, docType, section, effectiveDate: null, text, score: 0.7 }
}

const FENCE_RULE = chunk(1, 'rules', '4.2', 'Fences in rear yards may not exceed six (6) feet. Front-yard fences may not exceed four (4) feet. Chain-link fencing is prohibited.')
const PAINT_RULE = chunk(2, 'rules', '5.1', 'Exterior colors must be chosen from the association’s approved palette. Bright or fluorescent colors are not allowed.')
const ARC_RULE = chunk(3, 'declaration', '7.1', 'No exterior alteration may begin until the Architectural Review Committee has approved it in writing.')
const SOLAR_RULE = chunk(4, 'policy', '2', 'Solar panels may be installed on roofs. Panels should be placed on rear-facing roof planes where practical.')
const SHED_RULE = chunk(5, 'rules', '6.3', 'Detached sheds may not exceed 120 square feet or 10 feet in height and must match the home’s exterior color.')
const POOL_RULE = chunk(6, 'rules', '8.1', 'Pools must be enclosed by a fence at least 4 feet high with a self-latching gate.')
const PET_RULE = chunk(7, 'rules', '9.4', 'No more than two dogs or cats may be kept in any home.')

function canned(o: Record<string, unknown>): string {
  return JSON.stringify(o)
}

export const ARC_EVAL_CASES: ArcEvalCase[] = [
  {
    id: 'fence-within-limit',
    request: {
      category: 'fence',
      summary: 'Replace rear fence',
      scopeDescription: 'Replace the rear fence with a 6 ft white vinyl privacy fence on the existing line.',
      proposedStart: '2026-11-02',
      contractorName: 'Sample Fence Co',
    },
    chunks: [FENCE_RULE, ARC_RULE],
    cannedReply: canned({
      summary: 'Rear fences may be up to 6 feet; chain-link is not allowed.',
      confidence: 'HIGH',
      rules: [
        { chunk_id: id(1), point: 'Rear fences can be at most 6 feet, and chain-link is prohibited.', status: 'fits' },
        { chunk_id: id(3), point: 'Work waits for written ARC approval.', status: 'fits' },
      ],
      questions: [],
      suggestion: { decision: 'approve', reasoning: 'A 6-foot vinyl rear fence meets section 4.2.', conditions: [] },
    }),
    expected: { status: 'answered', decision: 'approve', citedChunkIds: [id(1), id(3)] },
  },
  {
    id: 'fence-too-tall',
    request: {
      category: 'fence',
      summary: 'Taller front fence',
      scopeDescription: 'Install a 6 foot black aluminum fence along the front yard.',
      proposedStart: '2026-11-10',
      contractorName: 'Sample Fence Co',
    },
    chunks: [FENCE_RULE],
    cannedReply: canned({
      summary: 'Front-yard fences are limited to 4 feet.',
      confidence: 'HIGH',
      rules: [{ chunk_id: id(1), point: 'Front-yard fences may not exceed 4 feet.', status: 'possible_conflict' }],
      questions: [],
      suggestion: { decision: 'deny', reasoning: 'The proposed front fence is 6 feet; section 4.2 caps front fences at 4 feet.', conditions: [] },
    }),
    expected: { status: 'answered', decision: 'deny', citedChunkIds: [id(1)] },
  },
  {
    id: 'paint-needs-color',
    request: { category: 'paint', summary: 'Repaint house', scopeDescription: 'Repaint the body and trim of the house this spring.' },
    chunks: [PAINT_RULE, ARC_RULE],
    cannedReply:
      '```json\n' +
      canned({
        summary: 'Colors must come from the approved palette.',
        confidence: 'HIGH',
        rules: [{ chunk_id: id(2), point: 'Exterior colors must be from the palette.', status: 'unclear' }],
        questions: ['Which palette colors for the body and trim?'],
        suggestion: { decision: 'need_more_info', reasoning: 'The colors are not named, and section 5.1 depends on them.', conditions: [] },
      }) +
      '\n```',
    expected: { status: 'answered', decision: 'need_more_info', citedChunkIds: [id(2)], missingInfo: ['colors', 'contractor', 'dates'] },
  },
  {
    id: 'solar-with-condition',
    request: {
      category: 'solar',
      summary: 'Roof solar',
      scopeDescription: 'Install 18 roof-mounted solar panels, about 340 sq ft, on the street-facing roof.',
      proposedStart: '2026-12-01',
      contractorName: 'Sample Solar',
    },
    chunks: [SOLAR_RULE],
    cannedReply: canned({
      summary: 'Roof solar is allowed; rear-facing placement is preferred.',
      confidence: 'MEDIUM',
      rules: [{ chunk_id: id(4), point: 'Panels go on rear-facing roof planes where practical.', status: 'possible_conflict' }],
      questions: ['Is a rear-facing roof plane practical for this home?'],
      suggestion: {
        decision: 'approve_with_conditions',
        reasoning: 'Solar is permitted; the policy prefers rear-facing planes.',
        conditions: ['Use rear-facing roof planes where practical.'],
      },
    }),
    expected: { status: 'answered', decision: 'approve_with_conditions', citedChunkIds: [id(4)] },
  },
  {
    id: 'shed-deny-without-conflict',
    request: {
      category: 'addition',
      summary: 'Backyard shed',
      scopeDescription: 'Build a 10x12 wood shed painted to match the house.',
      proposedStart: '2026-11-15',
      contractorName: 'Sample Builders',
    },
    chunks: [SHED_RULE],
    cannedReply: canned({
      summary: 'Sheds are limited to 120 sq ft and 10 feet tall.',
      confidence: 'HIGH',
      rules: [{ chunk_id: id(5), point: 'Sheds are capped at 120 sq ft and 10 feet, matching the home’s color.', status: 'unclear' }],
      questions: ['How tall is the shed?'],
      suggestion: { decision: 'deny', reasoning: 'It might be too tall.', conditions: [] },
    }),
    // Code refuses a denial with no cited conflict.
    expected: { status: 'answered', decision: 'need_more_info', citedChunkIds: [id(5)] },
  },
  {
    id: 'pool-invented-citation',
    request: {
      category: 'pool',
      summary: 'In-ground pool',
      scopeDescription: 'Install a 14 x 28 concrete in-ground pool with a 5 ft aluminum fence and self-latching gate.',
      proposedStart: '2027-01-10',
      contractorName: 'Sample Pools',
    },
    chunks: [POOL_RULE],
    cannedReply: canned({
      summary: 'Pools need a 4-foot fence with a self-latching gate.',
      confidence: 'HIGH',
      rules: [
        { chunk_id: id(6), point: 'A 4-foot fence with a self-latching gate is required.', status: 'fits' },
        { chunk_id: 'c0000000-0000-4000-8000-999999999999', point: 'Pools need a permit from the county.', status: 'unclear' },
      ],
      questions: [],
      suggestion: { decision: 'approve', reasoning: 'The 5-foot fence with a self-latching gate meets section 8.1.', conditions: [] },
    }),
    // The invented chunk is dropped; the real one stands.
    expected: { status: 'answered', decision: 'approve', citedChunkIds: [id(6)] },
  },
  {
    id: 'unrelated-rules-low-confidence',
    request: { category: 'landscaping', summary: 'Replace lawn', scopeDescription: 'Replace front lawn with native plants and mulch.', proposedStart: '2026-11-20' },
    chunks: [PET_RULE],
    cannedReply: canned({
      summary: 'The documents only mention pets.',
      confidence: 'LOW',
      rules: [{ chunk_id: id(7), point: 'Two pets per home.', status: 'unclear' }],
      questions: [],
      suggestion: { decision: 'approve', reasoning: 'Nothing prohibits it.', conditions: [] },
    }),
    expected: { status: 'no_rules', decision: null, citedChunkIds: [] },
  },
  {
    id: 'vague-fence-missing-everything',
    request: { category: 'fence', summary: 'New fence', scopeDescription: 'I would like to put a new fence around the yard.' },
    chunks: [FENCE_RULE, ARC_RULE],
    cannedReply: canned({
      summary: 'Fence height limits depend on front or rear yard.',
      confidence: 'MEDIUM',
      rules: [{ chunk_id: id(1), point: 'Rear fences up to 6 feet, front up to 4; no chain-link.', status: 'unclear' }],
      questions: ['How tall is the fence, and is it in the front or rear yard?', 'What material and color?'],
      suggestion: { decision: 'need_more_info', reasoning: 'Height, location and material decide which limit applies.', conditions: [] },
    }),
    expected: {
      status: 'answered',
      decision: 'need_more_info',
      citedChunkIds: [id(1)],
      missingInfo: ['dimensions', 'materials', 'colors', 'contractor', 'dates'],
    },
  },
]
