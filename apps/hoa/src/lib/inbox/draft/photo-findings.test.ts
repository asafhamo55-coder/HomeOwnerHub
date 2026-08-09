import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  selectPhotoAttachments,
  parsePhotoFindings,
  MAX_PHOTO_BYTES,
  MAX_TOTAL_PHOTO_BYTES,
  type SelectedPhoto,
} from './photo-findings'
import type { CandidateAttachment } from '@/lib/inbox/vendor/attachment-text'

function attachment(overrides: Partial<CandidateAttachment> = {}): CandidateAttachment {
  return {
    id: 'att-1',
    file_name: 'ceiling.jpg',
    content_type: 'image/jpeg',
    size_bytes: 1_000,
    storage_path: 'org/ceiling.jpg',
    fetch_status: 'stored',
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('selectPhotoAttachments', () => {
  it('selects a stored image', () => {
    expect(selectPhotoAttachments([attachment()])).toEqual([
      {
        id: 'att-1',
        fileName: 'ceiling.jpg',
        storagePath: 'org/ceiling.jpg',
        contentType: 'image/jpeg',
      },
    ])
  })

  it('skips attachments that are not yet stored', () => {
    expect(
      selectPhotoAttachments([attachment({ fetch_status: 'pending', storage_path: null })]),
    ).toEqual([])
  })

  it('skips PDFs and other non-images', () => {
    expect(
      selectPhotoAttachments([
        attachment({ file_name: 'estimate.pdf', content_type: 'application/pdf' }),
      ]),
    ).toEqual([])
  })

  // Same allowance selectParsableAttachments makes for PDFs.
  it('accepts an image sent as application/octet-stream, by extension', () => {
    const selected = selectPhotoAttachments([
      attachment({ file_name: 'photo.PNG', content_type: 'application/octet-stream' }),
    ])

    expect(selected).toHaveLength(1)
    expect(selected[0].contentType).toBe('image/png')
  })

  // iPhones produce HEIC constantly and no endpoint here decodes it; sending
  // one buys a request that learns nothing.
  it('excludes HEIC by content type and by extension', () => {
    expect(
      selectPhotoAttachments([attachment({ file_name: 'IMG_1.heic', content_type: 'image/heic' })]),
    ).toEqual([])
    expect(
      selectPhotoAttachments([
        attachment({ file_name: 'IMG_2.HEIF', content_type: 'application/octet-stream' }),
      ]),
    ).toEqual([])
  })

  it('skips a single image over the per-file cap', () => {
    expect(
      selectPhotoAttachments([attachment({ size_bytes: MAX_PHOTO_BYTES + 1 })]),
    ).toEqual([])
  })

  it('caps the batch at five images, Groq’s per-request limit', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      attachment({ id: `att-${i}`, file_name: `p${i}.jpg`, storage_path: `org/p${i}.jpg` }),
    )

    expect(selectPhotoAttachments(many)).toHaveLength(5)
  })

  // The two caps interact: five images at the per-file maximum would be 15MB,
  // over the 12MB batch budget, so the byte budget binds before the count does.
  it('stops adding once the total byte budget would be exceeded', () => {
    const atCap = Array.from({ length: 5 }, (_, i) =>
      attachment({
        id: `att-${i}`,
        file_name: `p${i}.jpg`,
        storage_path: `org/p${i}.jpg`,
        size_bytes: MAX_PHOTO_BYTES,
      }),
    )

    const selected = selectPhotoAttachments(atCap)

    expect(selected).toHaveLength(Math.floor(MAX_TOTAL_PHOTO_BYTES / MAX_PHOTO_BYTES))
    expect(selected.map((p) => p.id)).toEqual(['att-0', 'att-1', 'att-2', 'att-3'])
  })
})

describe('parsePhotoFindings', () => {
  const photos: SelectedPhoto[] = [
    { id: 'a', fileName: 'ceiling-1.jpg', storagePath: 'p/a', contentType: 'image/jpeg' },
    { id: 'b', fileName: 'ceiling-2.jpg', storagePath: 'p/b', contentType: 'image/jpeg' },
  ]

  it('maps indexed findings onto their file names', () => {
    const raw = JSON.stringify({
      findings: [
        { index: 0, finding: 'Brown staining across a ceiling panel.' },
        { index: 1, finding: 'A second view of the same staining.' },
      ],
    })

    expect(parsePhotoFindings(raw, photos)).toEqual([
      { fileName: 'ceiling-1.jpg', finding: 'Brown staining across a ceiling panel.' },
      { fileName: 'ceiling-2.jpg', finding: 'A second view of the same staining.' },
    ])
  })

  // Attributing a finding to the wrong photo is the one failure a reviewer
  // cannot catch by opening the file.
  it('drops an out-of-range index rather than mapping it to a neighbour', () => {
    const raw = JSON.stringify({ findings: [{ index: 7, finding: 'something' }] })

    expect(parsePhotoFindings(raw, photos)).toEqual([])
  })

  it('drops a duplicate index rather than double-attributing one file', () => {
    const raw = JSON.stringify({
      findings: [
        { index: 0, finding: 'first' },
        { index: 0, finding: 'second' },
      ],
    })

    expect(parsePhotoFindings(raw, photos)).toEqual([
      { fileName: 'ceiling-1.jpg', finding: 'first' },
    ])
  })

  it('drops an empty finding', () => {
    const raw = JSON.stringify({ findings: [{ index: 0, finding: '   ' }] })

    expect(parsePhotoFindings(raw, photos)).toEqual([])
  })

  it('returns [] on unparseable JSON without throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(parsePhotoFindings('not json', photos)).toEqual([])
  })

  it('returns [] when the shape fails validation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(parsePhotoFindings(JSON.stringify({ findings: 'nope' }), photos)).toEqual([])
  })

  // The response describes the inside of a resident's home.
  it('never logs the raw response', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    parsePhotoFindings('{ bedroom ceiling at 412 Madison', photos)

    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('Madison')
    expect(logged).toContain('responseLength')
  })
})
