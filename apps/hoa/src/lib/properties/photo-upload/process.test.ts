import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { processPhoto } from './process'

const jpegWithExif = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } })
    .withExif({ IFD0: { Copyright: 'secret-owner-name', Make: 'SecretCam' } })
    .jpeg()
    .toBuffer()

describe('processPhoto', () => {
  it('strips EXIF and re-encodes as jpeg', async () => {
    const original = await jpegWithExif(800, 600)
    expect((await sharp(original).metadata()).exif).toBeDefined()
    const out = await processPhoto(original)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const meta = await sharp(out.bytes).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.exif).toBeUndefined()
    expect(out.bytes.includes(Buffer.from('secret-owner-name'))).toBe(false)
  })

  it('resizes anything wider than 1600px and keeps the ratio', async () => {
    const out = await processPhoto(await jpegWithExif(3200, 1600))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.width).toBe(1600)
    expect(out.height).toBe(800)
  })

  it('does not enlarge a small picture', async () => {
    const out = await processPhoto(await jpegWithExif(640, 480))
    expect(out.ok && out.width).toBe(640)
  })

  it('accepts png and webp and turns them into jpeg', async () => {
    const base = sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
    for (const buf of [await base.clone().png().toBuffer(), await base.clone().webp().toBuffer()]) {
      const out = await processPhoto(buf)
      expect(out.ok).toBe(true)
      if (out.ok) expect((await sharp(out.bytes).metadata()).format).toBe('jpeg')
    }
  })

  it('rejects a format that is not allowed even if it is a real image', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).gif().toBuffer()
    expect(await processPhoto(gif)).toEqual({ ok: false, reason: 'wrong_format' })
  })

  it('rejects bytes that are not a picture, whatever the file was called', async () => {
    const svg = await processPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
    expect(svg.ok).toBe(false)
    expect(await processPhoto(Buffer.from('not an image at all'))).toEqual({ ok: false, reason: 'not_an_image' })
  })

  it('rejects anything over 5 MB', async () => {
    expect(await processPhoto(Buffer.alloc(5 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: 'too_large' })
  })
})
