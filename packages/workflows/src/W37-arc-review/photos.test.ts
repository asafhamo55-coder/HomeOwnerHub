import { afterEach, describe, expect, it, vi } from 'vitest'

// BL-079 — photo findings for the board-side W37 review. Pure halves plus
// the run body with a fake vision model: no DB, no real model, no images.

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => {
    throw new Error('no db in unit tests')
  },
}))

import { findContactPII } from '@homeowner-portal/ai/pii'
import { buildArcFacts, runArcReview, type ArcReviewInput, type ArcReviewModel, type ArcRetrieve } from './index'
import {
  ARC_PHOTO_DEFAULT_MAX,
  arcPhotoQuestion,
  processArcPhotoFindings,
  resolveArcReviewMaxPhotos,
  type ArcPhotoRef,
} from './photos'
import { REVIEW_SYSTEM_PROMPT, userPromptFor } from './prompt'

const C1 = '11111111-1111-4111-8111-111111111111'
const D1 = '33333333-3333-4333-8333-333333333333'
const ARC = '44444444-4444-4444-8444-444444444444'
const ORG = '55555555-5555-4555-8555-555555555555'
const P1 = '66666666-6666-4666-8666-666666666661'
const P2 = '66666666-6666-4666-8666-666666666662'

const CHUNKS = [
  { id: C1, documentId: D1, docType: 'rules', section: '4.2', effectiveDate: null, text: 'Front-yard fences may not exceed 4 feet. Rear-yard fences may not exceed 6 feet.', score: 0.8 },
]
const PHOTOS: ArcPhotoRef[] = [
  { attachmentId: P1, label: 'Photo 1' },
  { attachmentId: P2, label: 'Photo 2' },
]
const IMAGES = ['data:image/jpeg;base64,AAAA', 'data:image/png;base64,BBBB']

const FACTS = buildArcFacts({
  category: 'fence',
  summary: 'New fence',
  scopeDescription: 'Wood privacy fence, stained dark brown.',
  proposedStart: '2026-11-01',
  contractorName: 'Sample Fence Co',
})

function visionReply(findings: unknown[]): string {
  return JSON.stringify({ findings })
}

describe('resolveArcReviewMaxPhotos', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('defaults to a small number, under the provider’s per-request cap', () => {
    vi.stubEnv('ARC_REVIEW_MAX_PHOTOS', '')
    expect(resolveArcReviewMaxPhotos()).toBe(ARC_PHOTO_DEFAULT_MAX)
    expect(ARC_PHOTO_DEFAULT_MAX).toBeLessThanOrEqual(5)
  })

  it('is configurable, clamped to 0..5; 0 turns photo reading off', () => {
    vi.stubEnv('ARC_REVIEW_MAX_PHOTOS', '2')
    expect(resolveArcReviewMaxPhotos()).toBe(2)
    vi.stubEnv('ARC_REVIEW_MAX_PHOTOS', '0')
    expect(resolveArcReviewMaxPhotos()).toBe(0)
    vi.stubEnv('ARC_REVIEW_MAX_PHOTOS', '40')
    expect(resolveArcReviewMaxPhotos()).toBe(5)
    vi.stubEnv('ARC_REVIEW_MAX_PHOTOS', 'lots')
    expect(resolveArcReviewMaxPhotos()).toBe(ARC_PHOTO_DEFAULT_MAX)
  })
})

describe('arcPhotoQuestion', () => {
  it('names the kind of change and the rules to look for, and forbids identifying people', () => {
    const q = arcPhotoQuestion('Fence or wall', CHUNKS)
    expect(q).toContain('Fence or wall')
    expect(q).toContain('Front-yard fences may not exceed 4 feet')
    expect(q).toMatch(/Do not identify, describe or mention people/)
    expect(q).toMatch(/house numbers/)
    expect(q).toMatch(/"low" or "medium"/)
  })

  it('carries no request text at all — only the category and rule excerpts', () => {
    const q = arcPhotoQuestion('Fence or wall', CHUNKS)
    expect(q).not.toContain('Sample Fence Co')
    expect(findContactPII(q)).toEqual([])
  })

  it('keeps rule excerpts short', () => {
    const long = [{ ...CHUNKS[0]!, text: 'x'.repeat(5000) }]
    expect(arcPhotoQuestion('Fence or wall', long).length).toBeLessThan(3000)
  })
})

describe('processArcPhotoFindings', () => {
  it('ties each finding to the photo it came from', () => {
    const out = processArcPhotoFindings(
      visionReply([
        { index: 0, finding: 'Fence appears about 6 ft tall, wood, stained dark brown.', confidence: 'low' },
        { index: 1, finding: 'The fence runs along the front of the lot, near the sidewalk.', confidence: 'medium' },
      ]),
      PHOTOS,
    )
    expect(out).toEqual([
      { attachmentId: P1, photo: 'Photo 1', finding: 'Fence appears about 6 ft tall, wood, stained dark brown.', confidence: 'low' },
      { attachmentId: P2, photo: 'Photo 2', finding: 'The fence runs along the front of the lot, near the sidewalk.', confidence: 'medium' },
    ])
  })

  it('never claims high confidence, and an unknown confidence is low', () => {
    const out = processArcPhotoFindings(
      visionReply([
        { index: 0, finding: 'Wood fence.', confidence: 'high' },
        { index: 1, finding: 'Dark stain.', confidence: 'certain' },
      ]),
      PHOTOS,
    )
    expect(out.map((f) => f.confidence)).toEqual(['medium', 'low'])
  })

  it('drops an out-of-range index rather than pinning it on a neighbouring photo', () => {
    const out = processArcPhotoFindings(visionReply([{ index: 7, finding: 'A shed.', confidence: 'low' }]), PHOTOS)
    expect(out).toEqual([])
  })

  it('drops any finding that mentions a person', () => {
    const out = processArcPhotoFindings(
      visionReply([
        { index: 0, finding: 'A woman is standing by the gate.', confidence: 'medium' },
        { index: 0, finding: 'The homeowner is holding a paint sample.', confidence: 'medium' },
        { index: 1, finding: 'Gate is black aluminum.', confidence: 'medium' },
      ]),
      PHOTOS,
    )
    expect(out.map((f) => f.finding)).toEqual(['Gate is black aluminum.'])
  })

  it('drops a finding that reads out an address, and redacts contact details', () => {
    const out = processArcPhotoFindings(
      visionReply([
        { index: 0, finding: 'Mailbox shows 1234 Oak Street.', confidence: 'medium' },
        { index: 0, finding: 'House number 482 is on the post.', confidence: 'medium' },
        { index: 1, finding: 'Contractor sign reads 305-555-0142.', confidence: 'low' },
      ]),
      PHOTOS,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.finding).not.toContain('555-0142')
    expect(findContactPII(JSON.stringify(out))).toEqual([])
  })

  it('caps findings per photo and in total, and drops duplicates', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ index: 0, finding: `Fact ${i}.`, confidence: 'low' }))
    const out = processArcPhotoFindings(visionReply([...many, { index: 1, finding: 'Same.', confidence: 'low' }, { index: 1, finding: 'Same.', confidence: 'low' }]), PHOTOS)
    expect(out.filter((f) => f.attachmentId === P1)).toHaveLength(3)
    expect(out.filter((f) => f.attachmentId === P2)).toHaveLength(1)
  })

  it('accepts a fenced reply, and returns [] for garbage without echoing it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(processArcPhotoFindings('```json\n' + visionReply([{ index: 0, finding: 'Wood fence.', confidence: 'low' }]) + '\n```', PHOTOS)).toHaveLength(1)
    expect(processArcPhotoFindings('Fence appears to be dark brown wood', PHOTOS)).toEqual([])
    expect(JSON.stringify(spy.mock.calls)).not.toContain('dark brown')
    spy.mockRestore()
  })
})

describe('userPromptFor with photo findings', () => {
  it('lists the findings as low/medium-confidence hints, by photo label', () => {
    const p = userPromptFor(
      { categoryLabel: 'Fence or wall', summary: 'x', scopeDescription: 'y', hasStartDate: true, hasCompletionDate: false, hasContractor: true, hasContractorLicense: false },
      CHUNKS,
      [{ attachmentId: P1, photo: 'Photo 1', finding: 'Fence appears about 6 ft tall.', confidence: 'low' }],
    )
    expect(p).toContain('Photo findings')
    expect(p).toContain('- Photo 1 (low confidence): Fence appears about 6 ft tall.')
    expect(p).not.toContain(P1)
  })

  it('says nothing about photos when there are none', () => {
    const p = userPromptFor(
      { categoryLabel: 'Fence or wall', summary: 'x', scopeDescription: 'y', hasStartDate: true, hasCompletionDate: false, hasContractor: true, hasContractorLicense: false },
      CHUNKS,
    )
    expect(p).not.toContain('Photo findings')
  })

  it('the review prompt tells the model photo findings are hints, never grounds alone for a denial', () => {
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/photo findings/i)
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/never deny on photo findings alone/i)
  })
})

// ─── Run body ────────────────────────────────────────────────────────

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

const TEXT_REPLY = JSON.stringify({
  summary: 'Front fences are limited to 4 feet.',
  confidence: 'HIGH',
  rules: [{ chunk_id: C1, point: 'Front-yard fences may not exceed 4 feet.', status: 'possible_conflict' }],
  questions: [],
  suggestion: { decision: 'need_more_info', reasoning: 'The photos suggest a 6-foot fence in front; confirm the height.', conditions: [] },
})

function model(vision?: ArcReviewModel['vision']): ArcReviewModel {
  return { complete: vi.fn(async () => ({ content: TEXT_REPLY, model: 'text-m' })), vision }
}
const retrieve: ArcRetrieve = vi.fn(async () => CHUNKS)
const REVIEW: ArcReviewInput = { mode: 'review', facts: FACTS, associationId: null, arcRequestId: ARC, precheckRunId: null, photos: PHOTOS }

describe('runArcReview with photos', () => {
  it('reads the photos once, out of band, and feeds the findings to the suggestion', async () => {
    const vision = vi.fn(async () => ({
      content: visionReply([{ index: 0, finding: 'Fence appears about 6 ft tall, in the front yard.', confidence: 'low' }]),
      model: 'vision-m',
    }))
    const m = model(vision)
    const out = await runArcReview(REVIEW, api(), { organizationId: ORG }, { model: m, retrieve }, IMAGES)
    expect(vision).toHaveBeenCalledTimes(1)
    const [question, images] = vision.mock.calls[0]! as unknown as [string, string[]]
    expect(images).toEqual(IMAGES)
    expect(question).toContain('Front-yard fences may not exceed 4 feet')
    const [, userPrompt] = (m.complete as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, string]
    expect(userPrompt).toContain('Photo 1 (low confidence): Fence appears about 6 ft tall, in the front yard.')
    expect(out.photoFindings).toEqual([
      { attachmentId: P1, photo: 'Photo 1', finding: 'Fence appears about 6 ft tall, in the front yard.', confidence: 'low' },
    ])
  })

  it('the input carries photo references only — never the image bytes', () => {
    expect(JSON.stringify(REVIEW)).not.toContain('base64')
  })

  it('a vision failure degrades to no findings with a warning, never fails the review', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const vision = vi.fn(async () => {
      throw new Error('413 request too large: fence photo')
    })
    const out = await runArcReview(REVIEW, api(), { organizationId: ORG }, { model: model(vision), retrieve }, IMAGES)
    expect(out.status).toBe('answered')
    expect(out.photoFindings).toEqual([])
    expect(out.warnings.join(' ')).toMatch(/couldn’t read the photos/i)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('fence photo')
    spy.mockRestore()
  })

  it('photos that were not read are counted in a warning', async () => {
    const vision = vi.fn(async () => ({ content: visionReply([]) }))
    const out = await runArcReview({ ...REVIEW, photosSkipped: 2 }, api(), { organizationId: ORG }, { model: model(vision), retrieve }, IMAGES)
    expect(out.warnings.join(' ')).toMatch(/2 more attachments weren’t read/)
  })

  it('no photos, or images that do not line up with the references: no vision call', async () => {
    const vision = vi.fn()
    await runArcReview({ ...REVIEW, photos: [] }, api(), { organizationId: ORG }, { model: model(vision), retrieve }, [])
    const out = await runArcReview(REVIEW, api(), { organizationId: ORG }, { model: model(vision), retrieve }, IMAGES.slice(0, 1))
    expect(vision).not.toHaveBeenCalled()
    expect(out.photoFindings).toEqual([])
  })

  it('precheck never reads photos', async () => {
    const vision = vi.fn()
    const out = await runArcReview(
      { mode: 'precheck', facts: FACTS, associationId: null, photos: PHOTOS },
      api(),
      { organizationId: ORG },
      { model: model(vision), retrieve },
      IMAGES,
    )
    expect(vision).not.toHaveBeenCalled()
    expect(out.photoFindings).toEqual([])
  })

  it('a denial still needs a cited conflict, whatever the photos say', async () => {
    const vision = vi.fn(async () => ({ content: visionReply([{ index: 0, finding: 'Fence appears 8 ft tall.', confidence: 'medium' }]) }))
    const m: ArcReviewModel = {
      vision,
      complete: vi.fn(async () => ({
        content: JSON.stringify({
          summary: 's',
          confidence: 'HIGH',
          rules: [{ chunk_id: C1, point: 'Front fences max 4 feet.', status: 'unclear' }],
          suggestion: { decision: 'deny', reasoning: 'The photo shows 8 feet.', conditions: [] },
        }),
      })),
    }
    const out = await runArcReview(REVIEW, api(), { organizationId: ORG }, { model: m, retrieve }, IMAGES)
    expect(out.suggestion?.decision).toBe('need_more_info')
  })
})
