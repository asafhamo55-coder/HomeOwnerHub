/**
 * Composes a topic pictogram: one Material Symbols glyph, centred on an
 * opaque accent-tinted panel.
 *
 * This is the BASELINE visual. It exists because no open illustration
 * library draws neighbourhood conduct — a live query of unDraw returned
 * zero results for "dog waste" and "noise". A composed pictogram means a
 * new topic is a config line, so art never blocks adding a template.
 *
 * Output is a 1200x400 SVG, rasterised to a 600x200 CSS-pixel PNG at 2x by
 * scripts/build-email-assets.ts. It is never served as SVG — Gmail strips
 * <svg> entirely and Outlook has never supported it.
 */

import { assertAccent, tintOver } from './palette'
import { GLYPHS, type GlyphName } from './glyphs'

export interface PictogramSpec {
  glyph: GlyphName
  accentColor: string
}

const WIDTH = 1200
const HEIGHT = 400
/** Glyph box in the 1200x400 canvas, independent of the source grid. */
const GLYPH_SIZE = 180

export function renderPictogramSvg(spec: PictogramSpec): string {
  const glyph = GLYPHS[spec.glyph]
  if (!glyph) {
    throw new Error(`unknown glyph: ${spec.glyph}. Add it to email/glyphs.ts.`)
  }
  assertAccent(spec.accentColor)

  const panel = tintOver(spec.accentColor, 0.08)
  const halo = tintOver(spec.accentColor, 0.16)

  // Derive the transform from the glyph's own source box rather than
  // assuming a grid — Material Symbols ships both the legacy 24x24 viewBox
  // and the current 0 -960 960 960 viewBox. For a 24x24 glyph this reduces
  // to the original hardcoded scale = GLYPH_SIZE / 24 = 7.5.
  const [minX, minY, bw, bh] = glyph.box
  const scale = GLYPH_SIZE / Math.max(bw, bh)
  const tx = (WIDTH - bw * scale) / 2 - minX * scale
  const ty = (HEIGHT - bh * scale) / 2 - minY * scale

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="${panel}"/>
<circle cx="${WIDTH / 2}" cy="${HEIGHT / 2}" r="150" fill="${halo}"/>
<g transform="translate(${tx} ${ty}) scale(${scale})"><path d="${glyph.d}" fill="${spec.accentColor}"/></g>
</svg>`
}
