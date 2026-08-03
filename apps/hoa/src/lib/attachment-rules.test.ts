import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_MAX_BYTES,
  PHOTO_ACCEPT,
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
