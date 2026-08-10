/**
 * Material Symbols path data, Apache-2.0.
 *
 * Vendored rather than depended on: we need seven glyphs, not a 4,268-glyph
 * font, and the build has to run without network access. Paths are the
 * 24x24 filled variants, normalised to a 0 0 24 24 viewBox.
 *
 * Licence copy: docs/licenses/material-symbols-APACHE-2.0.txt
 * Source: https://github.com/google/material-design-icons (Apache-2.0)
 */

export const GLYPHS = {
  // pets — paw print
  pets: 'M4.5 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm4-5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm7 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm4 5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-3.6 2.4c-.9-1-1.5-1.8-2.4-2.6-.5-.5-1.2-.8-1.9-.8h-.2c-.7 0-1.4.3-1.9.8-.9.8-1.5 1.6-2.4 2.6-.6.7-1.4 1.3-1.9 2.1-.3.5-.5 1-.5 1.6 0 1.5 1.2 2.7 2.7 2.7.6 0 1.2-.2 1.7-.4.7-.3 1.5-.4 2.4-.4s1.7.1 2.4.4c.5.2 1.1.4 1.7.4 1.5 0 2.7-1.2 2.7-2.7 0-.6-.2-1.1-.5-1.6-.5-.8-1.3-1.4-1.9-2.1z',
  // local_parking — P in a square
  parking: 'M3 3h18v18H3V3zm10.5 10.5c1.93 0 3.5-1.57 3.5-3.5S15.43 6.5 13.5 6.5H9v11h2v-4h2.5zm0-2H11V8.5h2.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
  // recycling — bin
  recycling: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  // construction — traffic cone / works
  construction: 'M13.7 2.6h-3.4L5.5 21h13l-4.8-18.4zM9.4 9h5.2l.8 3H8.6l.8-3zM3 22h18v2H3v-2z',
  // cleaning_services — broom
  cleanup: 'M16 2l-2.5 7h-3L8 2H6l2.8 8H7v2h1v8c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-8h1v-2h-1.8L18 2h-2z',
  // pool — water and swimmer
  pool: 'M2 15c1.5 0 2.5 1 4 1s2.5-1 4-1 2.5 1 4 1 2.5-1 4-1 2.5 1 4 1v2c-1.5 0-2.5-1-4-1s-2.5 1-4 1-2.5-1-4-1-2.5 1-4 1-2.5-1-4-1v-2zm4-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12-6l-8 5 3 2 5-3V5z',
  // apartment — building, used for the lease cap notice
  apartment: 'M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z',
} as const

export type GlyphName = keyof typeof GLYPHS
