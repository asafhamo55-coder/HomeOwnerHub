// HomeownerHub logo geometry (BL-098, concept C). Plain data with no JSX, so
// scripts/build-brand-assets.ts can import it under tsx. Rendered by
// components/BrandLogo.tsx, the HOA /icon and /apple-icon routes, and every
// static file in apps/{hoa,marketing}/public/brand/. Change it here only,
// then run `pnpm brand:assets`.

/** Mark geometry, in a 32×32 box. */
export const MARK = {
  viewBox: '0 0 32 32',
  tileRadius: 7.5,
  /** The two stems of the H. */
  stems: { d: 'M9 7v18M23 7v18', strokeWidth: 3.5 },
  /** The roof, which is the H's crossbar. */
  roof: { d: 'M9 17 16 10.5l7 6.5', strokeWidth: 3.25 },
  /** The door, filled LOGO.line. Required: without it the H reads as an "A". */
  door: { x: 14.25, y: 18.5, width: 3.5, height: 6.5, rx: 1 },
} as const

/**
 * Wordmark geometry: one path per glyph, each offset by `x`. Baseline 24.5,
 * x-height 13.5, cap height 4.5, stroke 3, bowl radius 5.5. Glyphs with
 * `hub: true` are "Hub".
 */
export const WORDMARK = {
  width: 194,
  height: 34,
  strokeWidth: 3,
  glyphs: [
    { x: 1.5, d: 'M0 4.5V24.5M12 4.5V24.5M0 14.5h12' }, // H
    { x: 18.9, d: 'M5.5 13.5a5.5 5.5 0 1 0 0.001 0z' }, // o
    { x: 34.9, d: 'M0 24.5V13.5M0 17a3.5 3.5 0 0 1 7 0v7.5M7 17a3.5 3.5 0 0 1 7 0v7.5' }, // m
    { x: 53.9, d: 'M0 19h11a5.5 5.5 0 1 0-1.3 3.55' }, // e
    { x: 69.5, d: 'M5.5 13.5a5.5 5.5 0 1 0 0.001 0z' }, // o
    { x: 84.7, d: 'M0 13.5L3.4 24.5L7 15.6L10.6 24.5L14 13.5' }, // w
    { x: 102.9, d: 'M0 24.5V13.5M0 19a5.5 5.5 0 0 1 11 0v5.5' }, // n
    { x: 118.9, d: 'M0 19h11a5.5 5.5 0 1 0-1.3 3.55' }, // e
    { x: 134.9, d: 'M0 24.5V13.5M0 19a5.5 5.5 0 0 1 6.5-5.4' }, // r
    { x: 146.8, d: 'M0 4.5V24.5M12 4.5V24.5M0 14.5h12', hub: true }, // H
    { x: 164.2, d: 'M0 13.5v5.5a5.5 5.5 0 0 0 11 0M11 13.5V24.5', hub: true }, // u
    { x: 180.2, d: 'M0 4.5V24.5M5.5 13.5a5.5 5.5 0 1 0 0.001 0z', hub: true }, // b
  ] as ReadonlyArray<{ x: number; d: string; hub?: boolean }>,
} as const
