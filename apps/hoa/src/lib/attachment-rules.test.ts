import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_MAX_BYTES,
  PHOTO_ACCEPT,
  summarizePhotoUploads,
  validatePhotoFiles,
} from './attachment-rules'

// `validatePhotoFiles` is deliberately typed against a structural
// `PickedFile` rather than the DOM `File`, so it is testable under
// vitest's node environment (where `File` is not reliably global) while
// a real `File` still satisfies it at the call site.
const ok = { name: 'photo-1.jpg', size: 2_000_000, type: 'image/jpeg' }

describe('validatePhotoFiles', () => {
  it('accepts a normal phone photo', () => {
    expect(validatePhotoFiles([ok])).toEqual({ accepted: [ok], rejected: [] })
  })

  it('accepts HEIC, which is what iPhones actually produce', () => {
    const heic = { name: 'IMG_0042.HEIC', size: 3_500_000, type: 'image/heic' }
    expect(validatePhotoFiles([heic]).accepted).toEqual([heic])
  })

  it('rejects a file over the limit and names it', () => {
    const huge = { name: 'raw.dng', size: ATTACHMENT_MAX_BYTES + 1, type: 'image/jpeg' }
    expect(validatePhotoFiles([huge])).toEqual({
      accepted: [],
      rejected: [{ name: 'raw.dng', reason: 'Over the 10 MB limit' }],
    })
  })

  it('accepts a file exactly at the limit', () => {
    const edge = { name: 'edge.jpg', size: ATTACHMENT_MAX_BYTES, type: 'image/jpeg' }
    expect(validatePhotoFiles([edge]).accepted).toEqual([edge])
  })

  it('rejects a non-image even though the server allows it as an attachment', () => {
    const pdf = { name: 'notice.pdf', size: 1000, type: 'application/pdf' }
    expect(validatePhotoFiles([pdf])).toEqual({
      accepted: [],
      rejected: [{ name: 'notice.pdf', reason: 'Not a supported image' }],
    })
  })

  it('rejects an empty file, which the server would reject anyway', () => {
    const empty = { name: 'empty.jpg', size: 0, type: 'image/jpeg' }
    expect(validatePhotoFiles([empty]).rejected).toEqual([
      { name: 'empty.jpg', reason: 'File is empty' },
    ])
  })

  it('partitions a mixed batch, preserving order', () => {
    const big = { name: 'big.jpg', size: ATTACHMENT_MAX_BYTES + 1, type: 'image/jpeg' }
    const second = { name: 'photo-2.png', size: 500, type: 'image/png' }
    const result = validatePhotoFiles([ok, big, second])
    expect(result.accepted).toEqual([ok, second])
    expect(result.rejected).toEqual([{ name: 'big.jpg', reason: 'Over the 10 MB limit' }])
  })

  it('handles an empty selection', () => {
    expect(validatePhotoFiles([])).toEqual({ accepted: [], rejected: [] })
  })

  it('PHOTO_ACCEPT lists only image types, for the file input', () => {
    expect(PHOTO_ACCEPT.split(',').every((t) => t.startsWith('image/'))).toBe(true)
  })
})

describe('summarizePhotoUploads', () => {
  it('says nothing when no photos were attached', () => {
    expect(summarizePhotoUploads([])).toEqual({
      allSucceeded: true,
      failedNames: [],
      message: null,
    })
  })

  it('says nothing when every photo uploaded', () => {
    expect(
      summarizePhotoUploads([
        { name: 'photo-1.jpg', ok: true },
        { name: 'photo-2.jpg', ok: true },
      ]),
    ).toEqual({ allSucceeded: true, failedNames: [], message: null })
  })

  it('leads with the report being saved when one photo fails', () => {
    const result = summarizePhotoUploads([{ name: 'photo-1.jpg', ok: false }])
    expect(result.allSucceeded).toBe(false)
    expect(result.failedNames).toEqual(['photo-1.jpg'])
    expect(result.message).toBe(
      'Your report was submitted. 1 photo did not upload (photo-1.jpg) — you can add it from the report page.',
    )
  })

  it('pluralizes and lists every failure', () => {
    const result = summarizePhotoUploads([
      { name: 'photo-1.jpg', ok: true },
      { name: 'photo-2.jpg', ok: false },
      { name: 'photo-3.heic', ok: false },
    ])
    expect(result.failedNames).toEqual(['photo-2.jpg', 'photo-3.heic'])
    expect(result.message).toBe(
      'Your report was submitted. 2 photos did not upload (photo-2.jpg, photo-3.heic) — you can add them from the report page.',
    )
  })

  it('never reports failure when the list is all successes, regardless of length', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ name: `photo-${i}.jpg`, ok: true }))
    expect(summarizePhotoUploads(many).allSucceeded).toBe(true)
  })
})
