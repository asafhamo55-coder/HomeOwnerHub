import { describe, expect, it, vi } from 'vitest'
import { runBoardArcReviewWith, type BuildFacts, type ReviewFn } from './run'

const ORG = 'org-1'
const ARC = '44444444-4444-4444-8444-444444444444'
const PRE = '55555555-5555-4555-8555-555555555555'

const ROW = {
  id: ARC,
  association_id: 'assoc-1',
  category: 'fence',
  summary: 'Rear fence',
  scope_description: 'Six foot vinyl fence. Call 305-555-0142.',
  proposed_start: '2026-11-01',
  proposed_completion: null,
  contractor_name: 'Sample Fence Co',
  contractor_license: null,
  status: 'submitted',
}

function fakeDb(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = (c: string, v: unknown) => (filters.push([c, v]), q)
  q.is = (c: string, v: unknown) => (filters.push([c, v]), q)
  q.maybeSingle = async () => result
  return { db: { from: () => q } as never, filters }
}

const buildFacts: BuildFacts = vi.fn((r) => ({
  category: r.category,
  summary: r.summary,
  scopeDescription: '[redacted]',
  hasStartDate: !!r.proposedStart,
  hasCompletionDate: false,
  hasContractor: !!r.contractorName,
  hasContractorLicense: false,
}))

describe('runBoardArcReviewWith', () => {
  it('reads the application in the org and runs review mode with facts, not the raw row', async () => {
    const { db, filters } = fakeDb({ data: ROW, error: null })
    const review: ReviewFn = vi.fn(async () => ({ runId: 'run-1' }) as never)
    const r = await runBoardArcReviewWith(db, { orgId: ORG, arcId: ARC, precheckRunId: PRE }, { review, buildFacts })
    expect(r).toEqual({ ok: true, runId: 'run-1' })
    expect(filters).toEqual(expect.arrayContaining([['id', ARC], ['organization_id', ORG], ['deleted_at', null]]))
    const [input, ctx] = (review as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(ctx).toEqual({ organizationId: ORG, images: [] })
    expect(input).toMatchObject({ mode: 'review', arcRequestId: ARC, associationId: 'assoc-1', precheckRunId: PRE })
    expect(JSON.stringify(input)).not.toContain('305-555-0142')
    expect(JSON.stringify(input)).not.toContain('Sample Fence Co')
  })

  it('BL-079: passes photo references in the input and the images out of band', async () => {
    const { db } = fakeDb({ data: ROW, error: null })
    const review: ReviewFn = vi.fn(async () => ({ runId: 'run-2' }) as never)
    const loadPhotos = vi.fn(async () => ({
      photos: [{ attachmentId: '66666666-6666-4666-8666-666666666661', label: 'Photo 1' }],
      images: ['data:image/jpeg;base64,AAAA'],
      skipped: 2,
    }))
    const r = await runBoardArcReviewWith(db, { orgId: ORG, arcId: ARC }, { review, buildFacts, loadPhotos })
    expect(r).toEqual({ ok: true, runId: 'run-2' })
    expect(loadPhotos).toHaveBeenCalledWith(db, { orgId: ORG, arcId: ARC })
    const [input, ctx] = (review as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(input).toMatchObject({ photos: [{ attachmentId: '66666666-6666-4666-8666-666666666661', label: 'Photo 1' }], photosSkipped: 2 })
    expect(JSON.stringify(input)).not.toContain('base64')
    expect(ctx).toEqual({ organizationId: ORG, images: ['data:image/jpeg;base64,AAAA'] })
  })

  it('a photo loader that throws runs the review without photos', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const review: ReviewFn = vi.fn(async () => ({ runId: 'run-3' }) as never)
    const loadPhotos = vi.fn(async () => {
      throw new Error('storage down')
    })
    const r = await runBoardArcReviewWith(fakeDb({ data: ROW, error: null }).db, { orgId: ORG, arcId: ARC }, { review, buildFacts, loadPhotos })
    expect(r.ok).toBe(true)
    const [input, ctx] = (review as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(input.photos).toEqual([])
    expect(ctx).toEqual({ organizationId: ORG, images: [] })
    spy.mockRestore()
  })

  it.each(['approved', 'denied', 'withdrawn'])('refuses a %s application', async (status) => {
    const review = vi.fn()
    const r = await runBoardArcReviewWith(fakeDb({ data: { ...ROW, status }, error: null }).db, { orgId: ORG, arcId: ARC }, { review, buildFacts })
    expect(r.ok).toBe(false)
    expect(review).not.toHaveBeenCalled()
  })

  it('a missing application is a clear error', async () => {
    const r = await runBoardArcReviewWith(fakeDb({ data: null, error: null }).db, { orgId: ORG, arcId: ARC }, { review: vi.fn(), buildFacts })
    expect(r).toEqual({ ok: false, error: 'That application no longer exists.' })
  })

  it('a workflow failure is logged by name only and returned as a friendly error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const review: ReviewFn = vi.fn(async () => {
      throw new Error('workflow_W37_failed: Six foot vinyl fence')
    })
    const r = await runBoardArcReviewWith(fakeDb({ data: ROW, error: null }).db, { orgId: ORG, arcId: ARC }, { review, buildFacts })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Six foot')
    spy.mockRestore()
  })
})
