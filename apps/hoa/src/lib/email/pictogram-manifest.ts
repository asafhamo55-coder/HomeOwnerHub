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

  // Phase 2. Every accent below was checked against assertAccent's
  // 0.1–0.3 luminance window before being written; two earlier candidates
  // (#4A4FA0 storm, #6B5330 architecture) measured 0.096 and 0.095 and
  // were lightened rather than shipped as build failures.
  { slug: 'noise-and-quiet-hours', glyph: 'noise', accent: '#8A4B2A' },
  { slug: 'street-parking-and-vehicles', glyph: 'vehicle', accent: '#2C5F8A' },
  { slug: 'play-equipment-in-roadway', glyph: 'play', accent: '#9A4E1C' },
  { slug: 'lawn-and-landscaping', glyph: 'lawn', accent: '#3E6B22' },
  { slug: 'holiday-decoration-timing', glyph: 'celebration', accent: '#96407A' },
  { slug: 'mailbox-and-exterior-upkeep', glyph: 'mailbox', accent: '#2F6B6B' },
  { slug: 'speeding-and-traffic-safety', glyph: 'speed', accent: '#A33A3A' },
  { slug: 'severe-weather-prep', glyph: 'storm', accent: '#5560B4' },
  { slug: 'pool-rules-and-guests', glyph: 'pool', accent: '#1C6F31' },
  { slug: 'annual-meeting-notice', glyph: 'meeting', accent: '#3F5C8C' },
  { slug: 'architectural-review-reminder', glyph: 'architecture', accent: '#7A6138' },
  { slug: 'short-term-rental-policy', glyph: 'rental', accent: '#7A5A1F' },
]
