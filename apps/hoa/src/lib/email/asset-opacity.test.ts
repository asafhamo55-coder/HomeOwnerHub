import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'apps/hoa/public/email/v1')

/**
 * A PNG's IHDR colour-type byte is at offset 25. Type 6 is RGBA and type 4
 * is grey+alpha — either means the image carries transparency, which in a
 * dark-mode inbox renders as an invisible glyph on an inverted background.
 */
function colourType(file: string): number {
  return readFileSync(file)[25]
}

describe('generated email assets', () => {
  it('the asset directory exists — run pnpm build:email-assets', () => {
    expect(existsSync(DIR), `missing ${DIR}`).toBe(true)
  })

  it('every PNG is fully opaque', () => {
    const pngs = readdirSync(DIR).filter((f) => f.endsWith('.png'))
    expect(pngs.length).toBeGreaterThan(0)
    for (const f of pngs) {
      const type = colourType(path.join(DIR, f))
      expect([4, 6], `${f} has an alpha channel (colour type ${type})`).not.toContain(type)
    }
  })
})

describe('the v4 email logo badge', () => {
  const file = path.join(process.cwd(), 'apps/hoa/public/email/v4/homeownerhub-logo.png')
  it('is an RGBA PNG (transparent corners) at 400x96', () => {
    const buf = readFileSync(file)
    expect(buf[25], 'colour type 6 = RGBA').toBe(6)
    expect(buf.readUInt32BE(16)).toBe(400)
    expect(buf.readUInt32BE(20)).toBe(96)
  })
})
