/**
 * Material Symbols path data, Apache-2.0.
 *
 * Vendored rather than depended on: we need seven glyphs, not a 4,268-glyph
 * font, and the build has to run without network access.
 *
 * Material Symbols ships two grids across its history: the legacy 24x24
 * viewBox and the current `0 -960 960 960` viewBox. Each glyph records its
 * own source `box` so pictogram.ts can derive the correct transform instead
 * of assuming one grid.
 *
 * Licence copy: docs/licenses/material-symbols-APACHE-2.0.txt
 * Source: https://github.com/google/material-design-icons (Apache-2.0)
 */

export interface Glyph {
  /** Raw SVG path data, verbatim from the source. */
  d: string
  /** Source viewBox as [minX, minY, width, height]. */
  box: [number, number, number, number]
}

export const GLYPHS = {
  // pets — paw print (legacy 24x24 grid)
  pets: {
    d: 'M4.5 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm4-5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm7 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm4 5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-3.6 2.4c-.9-1-1.5-1.8-2.4-2.6-.5-.5-1.2-.8-1.9-.8h-.2c-.7 0-1.4.3-1.9.8-.9.8-1.5 1.6-2.4 2.6-.6.7-1.4 1.3-1.9 2.1-.3.5-.5 1-.5 1.6 0 1.5 1.2 2.7 2.7 2.7.6 0 1.2-.2 1.7-.4.7-.3 1.5-.4 2.4-.4s1.7.1 2.4.4c.5.2 1.1.4 1.7.4 1.5 0 2.7-1.2 2.7-2.7 0-.6-.2-1.1-.5-1.6-.5-.8-1.3-1.4-1.9-2.1z',
    box: [0, 0, 24, 24],
  },
  // local_parking — P in a square (legacy 24x24 grid)
  parking: {
    d: 'M3 3h18v18H3V3zm10.5 10.5c1.93 0 3.5-1.57 3.5-3.5S15.43 6.5 13.5 6.5H9v11h2v-4h2.5zm0-2H11V8.5h2.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
    box: [0, 0, 24, 24],
  },
  // recycling — bin (legacy 24x24 grid). Name is inaccurate (draws a bin, not
  // chasing arrows) but the picture is correct for its only consumer
  // (trash-and-recycling-bins) — do not "fix" it.
  recycling: {
    d: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    box: [0, 0, 24, 24],
  },
  // construction — traffic cone / works (legacy 24x24 grid)
  construction: {
    d: 'M13.7 2.6h-3.4L5.5 21h13l-4.8-18.4zM9.4 9h5.2l.8 3H8.6l.8-3zM3 22h18v2H3v-2z',
    box: [0, 0, 24, 24],
  },
  // cleaning_services — broom, real Material Symbols path on the current
  // 0 -960 960 960 grid. Fetched from fonts.gstatic.com; copied byte-for-byte.
  cleanup: {
    d: 'M120-40v-280q0-83 58.5-141.5T320-520h40v-320q0-33 23.5-56.5T440-920h80q33 0 56.5 23.5T600-840v320h40q83 0 141.5 58.5T840-320v280H120Zm80-80h80v-120q0-17 11.5-28.5T320-280q17 0 28.5 11.5T360-240v120h80v-120q0-17 11.5-28.5T480-280q17 0 28.5 11.5T520-240v120h80v-120q0-17 11.5-28.5T640-280q17 0 28.5 11.5T680-240v120h80v-200q0-50-35-85t-85-35H320q-50 0-85 35t-35 85v200Z',
    box: [0, -960, 960, 960],
  },
  // pool — swimmer above water, real Material Symbols path on the current
  // 0 -960 960 960 grid. Fetched from fonts.gstatic.com; copied byte-for-byte.
  pool: {
    d: 'M80-120v-80q38 0 57-20t75-20q56 0 77 20t57 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 57-20t77-20q56 0 75 20t57 20v80q-59 0-77.5-20T748-160q-36 0-57 20t-77 20q-56 0-77-20t-57-20q-36 0-57 20t-77 20q-56 0-77-20t-57-20q-36 0-54.5 20T80-120Zm0-180v-80q38 0 57-20t75-20q56 0 77.5 20t56.5 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 57-20t77-20q56 0 75 20t57 20v80q-59 0-77.5-20T748-340q-36 0-55.5 20T614-300q-57 0-77.5-20T480-340q-38 0-56.5 20T346-300q-59 0-78.5-20T212-340q-36 0-54.5 20T80-300Zm196-204 133-133-40-40q-33-33-70-48t-91-15v-100q75 0 124 16.5t96 63.5l256 256q-17 11-33 17.5t-37 6.5q-36 0-57-20t-77-20q-56 0-77 20t-57 20q-21 0-37-6.5T276-504Zm463-306.5q29 29.5 29 70.5 0 42-29 71t-71 29q-42 0-71-29t-29-71q0-41 29-70.5t71-29.5q42 0 71 29.5Z',
    box: [0, -960, 960, 960],
  },
  // apartment — building, used for the lease cap notice (legacy 24x24 grid)
  apartment: {
    d: 'M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z',
    box: [0, 0, 24, 24],
  },
} as const satisfies Record<string, Glyph>

export type GlyphName = keyof typeof GLYPHS
