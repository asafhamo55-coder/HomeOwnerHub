import { describe, it, expect } from 'vitest'
import { renderPictogramSvg } from './pictogram'
import { GLYPHS } from './glyphs'
import { PICTOGRAMS } from './pictogram-manifest'
import { isValidAccent } from './palette'

describe('GLYPHS', () => {
  it('covers every phase-1 topic glyph', () => {
    for (const name of ['pets', 'parking', 'recycling', 'construction', 'cleanup', 'pool', 'apartment'] as const) {
      expect(GLYPHS[name], `missing glyph: ${name}`).toBeTruthy()
      expect(GLYPHS[name]).toMatch(/^[Mm]/) // an SVG path starts with a moveto
    }
  })
})

describe('renderPictogramSvg', () => {
  const spec = { glyph: 'pets' as const, accentColor: '#2F8F5B' }

  it('emits a 1200x400 viewBox for 2x rasterisation of a 600x200 block', () => {
    expect(renderPictogramSvg(spec)).toContain('viewBox="0 0 1200 400"')
  })

  it('paints an opaque tinted panel — email cannot do transparency', () => {
    const svg = renderPictogramSvg(spec)
    // accent at 8% over #FAFAFA
    expect(svg).toContain('#eaf1ed')
    expect(svg).not.toContain('fill-opacity="0"')
    expect(svg).not.toContain('transparent')
  })

  it('draws the glyph in the accent colour', () => {
    expect(renderPictogramSvg(spec)).toContain('#2F8F5B')
  })

  it('rejects an accent that would not survive dark-mode inversion', () => {
    expect(() => renderPictogramSvg({ glyph: 'pets', accentColor: '#A8E6C4' })).toThrow(/luminance/i)
  })

  it('throws a helpful error for an unknown glyph', () => {
    // @ts-expect-error deliberately invalid
    expect(() => renderPictogramSvg({ glyph: 'nope', accentColor: '#2F8F5B' })).toThrow(/unknown glyph/i)
  })
})

describe('PICTOGRAMS manifest', () => {
  it('has seven entries with unique slugs', () => {
    expect(PICTOGRAMS).toHaveLength(7)
    expect(new Set(PICTOGRAMS.map((p) => p.slug)).size).toBe(7)
  })

  it('every accent survives dark-mode inversion', () => {
    for (const p of PICTOGRAMS) {
      expect(isValidAccent(p.accent), `${p.slug}: ${p.accent}`).toBe(true)
    }
  })

  it('every glyph exists', () => {
    for (const p of PICTOGRAMS) expect(GLYPHS[p.glyph], p.slug).toBeTruthy()
  })
})
