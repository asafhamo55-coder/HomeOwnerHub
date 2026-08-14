import { describe, it, expect } from 'vitest'
import { renderPictogramSvg } from './pictogram'
import { GLYPHS } from './glyphs'
import { PICTOGRAMS } from './pictogram-manifest'
import { isValidAccent } from './palette'

describe('GLYPHS', () => {
  it('covers every phase-1 topic glyph', () => {
    for (const name of ['pets', 'parking', 'recycling', 'construction', 'cleanup', 'pool', 'apartment'] as const) {
      expect(GLYPHS[name], `missing glyph: ${name}`).toBeTruthy()
      expect(GLYPHS[name].d).toMatch(/^[Mm]/) // an SVG path starts with a moveto
      expect(GLYPHS[name].box).toHaveLength(4)
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

  it('places a 960-grid glyph inside the canvas, derived from its own box', () => {
    // pool and cleanup are on the current 0 -960 960 960 Material Symbols
    // grid, not the legacy 24x24 grid the other five glyphs use.
    const svg = renderPictogramSvg({ glyph: 'pool', accentColor: '#2F8F5B' })
    const match = svg.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/)
    expect(match, 'expected a translate(...) scale(...) transform').toBeTruthy()
    const [, txStr, tyStr, scaleStr] = match!
    const tx = Number(txStr)
    const ty = Number(tyStr)
    const scale = Number(scaleStr)

    // box is [0, -960, 960, 960] → scale = 180 / 960
    expect(scale).toBeCloseTo(180 / 960)

    // The transformed bounding box (x in [0, 960], y in [-960, 0] locally)
    // must land fully inside the 1200x400 canvas.
    const minCanvasX = tx + 0 * scale
    const maxCanvasX = tx + 960 * scale
    const minCanvasY = ty + -960 * scale
    const maxCanvasY = ty + 0 * scale
    expect(minCanvasX).toBeGreaterThanOrEqual(0)
    expect(maxCanvasX).toBeLessThanOrEqual(1200)
    expect(minCanvasY).toBeGreaterThanOrEqual(0)
    expect(maxCanvasY).toBeLessThanOrEqual(400)
  })

  it('still uses scale = 7.5 for a legacy 24x24 glyph, centred as before', () => {
    const svg = renderPictogramSvg({ glyph: 'pets', accentColor: '#2F8F5B' })
    const match = svg.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/)
    expect(match).toBeTruthy()
    const [, txStr, tyStr, scaleStr] = match!
    expect(Number(scaleStr)).toBeCloseTo(7.5)
    expect(Number(txStr)).toBeCloseTo(510) // (1200 - 24*7.5) / 2
    expect(Number(tyStr)).toBeCloseTo(110) // (400 - 24*7.5) / 2
  })
})

describe('PICTOGRAMS manifest', () => {
  it('has unique slugs', () => {
    // Was `toHaveLength(7)`. The count is not the invariant; uniqueness is —
    // the slug is the generated PNG's filename, so a duplicate would have
    // one template silently overwrite another's artwork at build time.
    const slugs = PICTOGRAMS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.length).toBeGreaterThan(0)
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
