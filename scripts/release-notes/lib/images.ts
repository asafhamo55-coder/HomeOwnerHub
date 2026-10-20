// Screenshot preparation for inline (CID) email attachments.
//
// With sharp (a root devDependency): every image is flattened onto white,
// resized to at most MAX_WIDTH (1200px) wide and re-encoded as JPEG under
// MAX_BYTES (250 KB) — stepping quality, then width, down until it fits.
// A full-page CI capture (Screenshot.fromCi) is also cropped to MAX_HEIGHT
// from the top. Without sharp the original bytes are attached unchanged.
// Either way at most MAX_SCREENSHOTS are attached — Gmail clips messages
// over ~25 MB and buries long ones.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Screenshot } from './note'

export const MAX_SCREENSHOTS = 6
export const MAX_WIDTH = 1200
/** Crop height for full-page CI captures, in output pixels. */
export const MAX_HEIGHT = 2400
/** Per-image ceiling on the encoded JPEG. */
export const MAX_BYTES = 250 * 1024

/**
 * Encodings to try, in order; the first under MAX_BYTES wins. Quality goes
 * down first (text stays legible to ~50), then width.
 */
export const COMPRESSION_STEPS: readonly { width: number; quality: number }[] = [
  ...[78, 68, 58, 50].map((quality) => ({ width: MAX_WIDTH, quality })),
  ...[1000, 800, 640, 480, 360].map((width) => ({ width, quality: 60 })),
]

export interface InlineImage {
  cid: string
  filename: string
  contentType: string
  content: Buffer
  alt: string
  width: number | null
  height: number | null
}

export interface ProcessOptions {
  /** Crop to this many pixels from the top after resizing. */
  maxHeight?: number
}

export type ImageProcessor = (
  input: Buffer,
  file: string,
  opts?: ProcessOptions,
) => Promise<{ content: Buffer; contentType: string; width: number | null; height: number | null }>

export interface Encoded {
  data: Buffer
  width: number
  height: number
}

/**
 * Tries `steps` in order and returns the first encoding of at most
 * `maxBytes`; if none fits, the last (smallest) one. Exported for tests.
 */
export async function compressWithinLimit(
  encode: (step: { width: number; quality: number }) => Promise<Encoded>,
  steps: readonly { width: number; quality: number }[] = COMPRESSION_STEPS,
  maxBytes = MAX_BYTES,
): Promise<Encoded> {
  let last: Encoded | null = null
  for (const step of steps) {
    last = await encode(step)
    if (last.data.length <= maxBytes) return last
  }
  if (!last) throw new Error('compressWithinLimit: no compression steps')
  return last
}

interface SharpInstance {
  flatten(o: { background: string }): SharpInstance
  resize(o: { width: number; withoutEnlargement: boolean }): SharpInstance
  extract(o: { left: number; top: number; width: number; height: number }): SharpInstance
  png(): SharpInstance
  jpeg(o: { quality: number; mozjpeg: boolean }): SharpInstance
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>
}
type SharpFn = (input: Buffer) => SharpInstance

async function loadSharp(): Promise<SharpFn | null> {
  try {
    const mod = (await import('sharp')) as unknown as { default?: SharpFn }
    return (mod.default ?? (mod as unknown as SharpFn)) as SharpFn
  } catch {
    return null
  }
}

/** The sharp-backed processor: resize, optional top crop, JPEG within MAX_BYTES. */
export function sharpProcessor(sharp: SharpFn): ImageProcessor {
  return async (input, _file, opts) => {
    // One lossless resize per width, then one JPEG encode per quality.
    const resized = new Map<number, Promise<{ data: Buffer; info: { width: number; height: number } }>>()
    const resize = (width: number) => {
      let p = resized.get(width)
      if (!p) {
        p = (async () => {
          const r = await sharp(input)
            .flatten({ background: '#ffffff' })
            .resize({ width, withoutEnlargement: true })
            .png()
            .toBuffer({ resolveWithObject: true })
          const max = opts?.maxHeight
          if (!max || r.info.height <= max) return r
          return sharp(r.data)
            .extract({ left: 0, top: 0, width: r.info.width, height: max })
            .png()
            .toBuffer({ resolveWithObject: true })
        })()
        resized.set(width, p)
      }
      return p
    }
    const best = await compressWithinLimit(async ({ width, quality }) => {
      const base = await resize(width)
      const { data, info } = await sharp(base.data).jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    })
    return { content: best.data, contentType: 'image/jpeg', width: best.width, height: best.height }
  }
}

export async function defaultProcessor(): Promise<ImageProcessor> {
  const sharp = await loadSharp()
  if (!sharp) {
    return async (input, file) => ({
      content: input,
      contentType: /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png',
      width: null,
      height: null,
    })
  }
  return sharpProcessor(sharp)
}

export async function prepareImages(
  shots: readonly Screenshot[],
  processor?: ImageProcessor,
): Promise<InlineImage[]> {
  const proc = processor ?? (await defaultProcessor())
  const out: InlineImage[] = []
  for (const [i, shot] of shots.slice(0, MAX_SCREENSHOTS).entries()) {
    const processed = await proc(readFileSync(shot.file), shot.file, shot.fromCi ? { maxHeight: MAX_HEIGHT } : undefined)
    const ext = processed.contentType === 'image/jpeg' ? 'jpg' : 'png'
    const base = path.basename(shot.file).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-')
    out.push({
      cid: `shot${i + 1}.${base}@release-notes`,
      filename: `${String(i + 1).padStart(2, '0')}-${base}.${ext}`,
      contentType: processed.contentType,
      content: processed.content,
      alt: shot.alt || base,
      width: processed.width,
      height: processed.height,
    })
  }
  return out
}
