// Turns an uploaded picture into the one thing we store: a JPEG at most 1600
// pixels wide, with no metadata. Re-encoding drops EXIF (GPS, camera, date),
// ICC and anything hidden in the original bytes. Server only.

import sharp from 'sharp'
import { PHOTO_MAX_BYTES, PHOTO_MAX_WIDTH } from './rules'

export type ProcessResult =
  | { ok: true; bytes: Buffer; width: number; height: number }
  | { ok: false; reason: 'too_large' | 'not_an_image' | 'wrong_format' }

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])
/** 40 megapixels covers any phone camera and stops a decompression bomb. */
const MAX_INPUT_PIXELS = 40_000_000

export async function processPhoto(input: Buffer | Uint8Array): Promise<ProcessResult> {
  if (input.byteLength > PHOTO_MAX_BYTES) return { ok: false, reason: 'too_large' }
  try {
    const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    // The real format comes from the bytes, not from the name or MIME type the client sent.
    const meta = await source.metadata()
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) return { ok: false, reason: 'wrong_format' }
    const { data, info } = await source
      .rotate() // apply the EXIF orientation first, then the tag is dropped with the rest
      .resize({ width: PHOTO_MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // a transparent PNG becomes white, not black
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    return { ok: true, bytes: data, width: info.width, height: info.height }
  } catch {
    return { ok: false, reason: 'not_an_image' }
  }
}
