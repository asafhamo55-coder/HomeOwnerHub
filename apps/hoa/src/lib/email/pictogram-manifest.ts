/**
 * Which pictogram each phase-1 template uses.
 *
 * A plain data module with no side effects, deliberately separate from
 * scripts/build-email-assets.ts — that script calls main() at module scope,
 * so importing this list from it would launch Chromium during the test run.
 *
 * The slug is both the template slug and the generated PNG's filename, and
 * the accent must match the template's accentColor. Task 11's coverage test
 * asserts both, so the two cannot drift.
 */

import type { GlyphName } from './glyphs'

export interface PictogramEntry {
  slug: string
  glyph: GlyphName
  accent: string
}

export const PICTOGRAMS: readonly PictogramEntry[] = [
  { slug: 'dog-leash-and-waste', glyph: 'pets', accent: '#1C6772' },
  { slug: 'guest-parking', glyph: 'parking', accent: '#2C6FAF' },
  { slug: 'trash-and-recycling-bins', glyph: 'recycling', accent: '#268298' },
  { slug: 'work-on-site', glyph: 'construction', accent: '#7A6A1D' },
  { slug: 'community-cleanup-day', glyph: 'cleanup', accent: '#A63A87' },
  { slug: 'pool-pass-renewal', glyph: 'pool', accent: '#1C6F31' },
  { slug: 'lease-cap-status', glyph: 'apartment', accent: '#3A5AA8' },
]
