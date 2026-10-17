// Screenshot preparation for inline (CID) email attachments.
//
// With sharp (a root devDependency): every image is flattened onto white,
// resized to at most 1200px wide and re-encoded as JPEG, so a full-page
// screenshot lands at ~100-250 KB instead of ~500 KB+. Without sharp the
// original bytes are attached unchanged. Either way at most MAX_SCREENSHOTS
// are attached — Gmail clips messages over ~25 MB and buries long ones.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Screenshot } from './note'

export const MAX_SCREENSHOTS = 6
export const MAX_WIDTH = 1200

export interface InlineImage {
  cid: string
  filename: string
  contentType: string
  content: Buffer
  alt: string
  width: number | null
  height: number | null
}

export type ImageProcessor = (
  input: Buffer,
  file: string,
) => Promise<{ content: Buffer; contentType: string; width: number | null; height: number | null }>

type SharpFn = (input: Buffer) => {
  flatten(o: { background: string }): ReturnType<SharpFn>
  resize(o: { width: number; withoutEnlargement: boolean }): ReturnType<SharpFn>
  jpeg(o: { quality: number; mozjpeg: boolean }): ReturnType<SharpFn>
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>
}

async function loadSharp(): Promise<SharpFn | null> {
  try {
    const mod = (await import('sharp')) as unknown as { default?: SharpFn }
    return (mod.default ?? (mod as unknown as SharpFn)) as SharpFn
  } catch {
    return null
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
  return async (input) => {
    const { data, info } = await sharp(input)
      .flatten({ background: '#ffffff' })
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    return { content: data, contentType: 'image/jpeg', width: info.width, height: info.height }
  }
}

export async function prepareImages(
  shots: readonly Screenshot[],
  processor?: ImageProcessor,
): Promise<InlineImage[]> {
  const proc = processor ?? (await defaultProcessor())
  const out: InlineImage[] = []
  for (const [i, shot] of shots.slice(0, MAX_SCREENSHOTS).entries()) {
    const processed = await proc(readFileSync(shot.file), shot.file)
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
