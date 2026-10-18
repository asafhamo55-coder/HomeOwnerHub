import { describe, expect, it, vi } from 'vitest'
import { ARC_PHOTO_MAX_BYTES, ARC_PHOTO_MAX_TOTAL_BYTES, currentArcPhotoIds, loadArcPhotos, selectArcPhotos, type ArcAttachmentCandidate } from './photos'

const ORG = '55555555-5555-4555-8555-555555555555'
const ARC = '44444444-4444-4444-8444-444444444444'
const id = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`

function att(n: number, over: Partial<ArcAttachmentCandidate> = {}): ArcAttachmentCandidate {
  return { id: id(n), fileName: `smith-house-${n}.jpg`, contentType: 'image/jpeg', sizeBytes: 500_000, storagePath: `org/submissions/arc/${ARC}/${n}.jpg`, ...over }
}

describe('selectArcPhotos', () => {
  it('takes images in upload order up to the limit, labelled Photo 1..N — never by file name', () => {
    const { selected, skipped } = selectArcPhotos([att(1), att(2), att(3), att(4)], 3)
    expect(selected.map((p) => p.id)).toEqual([id(1), id(2), id(3)])
    expect(selected.map((p) => p.label)).toEqual(['Photo 1', 'Photo 2', 'Photo 3'])
    expect(skipped).toBe(1)
  })

  it('skips PDFs, HEIC and oversize files, and counts them as not read', () => {
    const { selected, skipped } = selectArcPhotos(
      [
        att(1, { contentType: 'application/pdf', fileName: 'plans.pdf' }),
        att(2, { contentType: 'image/heic', fileName: 'IMG_1.HEIC' }),
        att(3, { sizeBytes: ARC_PHOTO_MAX_BYTES + 1 }),
        att(4, { contentType: 'application/octet-stream', fileName: 'site.png' }),
      ],
      3,
    )
    expect(selected.map((p) => p.id)).toEqual([id(4)])
    expect(selected[0]!.contentType).toBe('image/png')
    expect(skipped).toBe(3)
  })

  it('keeps the batch under the total byte budget', () => {
    const big = ARC_PHOTO_MAX_BYTES - 10
    const n = Math.floor(ARC_PHOTO_MAX_TOTAL_BYTES / big)
    const rows = Array.from({ length: n + 1 }, (_, i) => att(i + 1, { sizeBytes: big }))
    const { selected } = selectArcPhotos(rows, 5)
    expect(selected.reduce((s, p) => s + p.sizeBytes, 0)).toBeLessThanOrEqual(ARC_PHOTO_MAX_TOTAL_BYTES)
  })

  it('a limit of 0 reads nothing', () => {
    expect(selectArcPhotos([att(1)], 0)).toEqual({ selected: [], skipped: 1 })
  })
})

function fakeDb(rows: unknown[], files: Record<string, Blob | null>, error: unknown = null) {
  const filters: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = (c: string, v: unknown) => (filters.push([c, v]), q)
  q.order = () => Promise.resolve({ data: rows, error })
  const download = vi.fn(async (path: string) => (files[path] ? { data: files[path], error: null } : { data: null, error: { message: 'nope' } }))
  return {
    db: { from: () => q, storage: { from: () => ({ download }) } } as never,
    filters,
    download,
  }
}

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  file_name: `smith-house-${n}.jpg`,
  content_type: 'image/jpeg',
  size_bytes: 4,
  storage_path: `p/${n}.jpg`,
  ...over,
})

describe('loadArcPhotos', () => {
  it('reads this application’s attachments in the org and returns refs plus data URLs in the same order', async () => {
    const { db, filters } = fakeDb([row(1), row(2)], { 'p/1.jpg': new Blob(['abcd']), 'p/2.jpg': new Blob(['efgh']) })
    const r = await loadArcPhotos(db, { orgId: ORG, arcId: ARC, max: 3 })
    expect(filters).toEqual(expect.arrayContaining([['organization_id', ORG], ['thread_type', 'arc'], ['parent_id', ARC]]))
    expect(r.photos).toEqual([
      { attachmentId: id(1), label: 'Photo 1' },
      { attachmentId: id(2), label: 'Photo 2' },
    ])
    expect(r.images).toHaveLength(2)
    expect(r.images[0]).toMatch(/^data:image\/jpeg;base64,/)
    expect(r.skipped).toBe(0)
    expect(JSON.stringify(r.photos)).not.toContain('smith-house')
  })

  it('a failed download drops that photo and relabels the rest; logs ids, never names or paths', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb([row(1), row(2)], { 'p/2.jpg': new Blob(['efgh']) })
    const r = await loadArcPhotos(db, { orgId: ORG, arcId: ARC, max: 3 })
    expect(r.photos).toEqual([{ attachmentId: id(2), label: 'Photo 1' }])
    expect(r.skipped).toBe(1)
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('smith-house')
    expect(logged).not.toContain('p/1.jpg')
    spy.mockRestore()
  })

  it('max 0 never touches storage', async () => {
    const { db, download } = fakeDb([row(1)], { 'p/1.jpg': new Blob(['abcd']) })
    const r = await loadArcPhotos(db, { orgId: ORG, arcId: ARC, max: 0 })
    expect(download).not.toHaveBeenCalled()
    expect(r).toEqual({ photos: [], images: [], skipped: 1 })
  })

  it('currentArcPhotoIds: the ids a review would read now, without downloading; null on a failed list', async () => {
    const { db, download } = fakeDb([row(1), row(2, { content_type: 'application/pdf', file_name: 'plan.pdf' })], {})
    expect(await currentArcPhotoIds(db, { orgId: ORG, arcId: ARC, max: 3 })).toEqual([id(1)])
    expect(download).not.toHaveBeenCalled()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await currentArcPhotoIds(fakeDb([], {}, { code: 'x' }).db, { orgId: ORG, arcId: ARC, max: 3 })).toBeNull()
    spy.mockRestore()
  })

  it('a failed list is no photos, not a failed review', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb([], {}, { code: '42501' })
    expect(await loadArcPhotos(db, { orgId: ORG, arcId: ARC, max: 3 })).toEqual({ photos: [], images: [], skipped: 0 })
    spy.mockRestore()
  })
})
