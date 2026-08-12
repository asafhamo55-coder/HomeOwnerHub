/**
 * Dispatches a template's visual block to its renderer.
 *
 * Image kinds share one renderer because they share every constraint: an
 * opaque 600x200 raster, explicit dimensions so a blocked image reserves its
 * space, a painted container cell, and alt text that carries real meaning.
 *
 * That last point is not politeness. Classic Outlook and Office 365 OWA
 * block remote images by default, so for a meaningful slice of recipients
 * the alt text IS the visual block.
 */

import { emailAssetUrl } from './asset-url'
import { renderMeterHtml } from './meter'
import { assertAccent, tintOver } from './palette'
import { escapeHtml } from './shell'

export type VisualBlockSpec =
  | { kind: 'illustration' | 'map' | 'photo'; asset: string; alt: string }
  | {
      kind: 'meter'
      label: string
      valuePct: number
      capPct: number
      valueLabel: string
      capLabel: string
    }
  | { kind: 'none' }

const WIDTH = 600
const HEIGHT = 200

/**
 * Alt text that describes the medium rather than the content is worse than
 * none — it tells a screen-reader user and a blocked-image reader nothing.
 * Three independent checks, each catching a different way authors phone
 * this in:
 *
 * 1. Length floor. A genuine description of a 600x200 banner is never
 *    under 12 characters — this alone catches "x", ".", "N/A", "photo.".
 * 2. Filename pattern. Authors sometimes paste the asset's own filename
 *    into the alt field ("IMG_1234.jpg") — that names the file, not the
 *    content, so it's rejected regardless of length.
 * 3. Stoplist match, tolerant of a leading article ("a"/"an"/"the") and a
 *    trailing "of" ("an image", "photo of") — the laziest phrasings tend
 *    to wrap the bare noun this way rather than typing it standalone.
 *
 * This will not catch everything ("graphic design" still passes) — the
 * goal is raising the bar past the single-word case, not perfect coverage.
 */
const MIN_ALT_LENGTH = 12
const ALT_FILENAME_PATTERN = /\.(png|jpe?g|gif|webp|svg)$/i
const ALT_STOPLIST_WORDS = ['image', 'illustration', 'photo', 'picture', 'graphic', 'banner', 'icon']
const ALT_STOPLIST_PATTERN = new RegExp(`^(?:${ALT_STOPLIST_WORDS.join('|')})(?:\\s+of)?$`, 'i')
const ALT_LEADING_ARTICLE = /^(?:a|an|the)\s+/i

function isUselessAlt(trimmed: string): boolean {
  if (trimmed.length < MIN_ALT_LENGTH) return true
  if (ALT_FILENAME_PATTERN.test(trimmed)) return true
  const withoutArticle = trimmed.replace(ALT_LEADING_ARTICLE, '')
  return ALT_STOPLIST_PATTERN.test(withoutArticle)
}

function renderImageBlock(
  asset: string,
  alt: string,
  accentColor: string,
): string {
  const trimmed = alt.trim()
  if (!trimmed || isUselessAlt(trimmed)) {
    throw new Error(
      `visual block alt text must describe the content, got: "${alt}". ` +
        'With images blocked the alt text is the whole block.',
    )
  }
  assertAccent(accentColor)
  const panel = tintOver(accentColor, 0.08)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="${panel}" style="background-color:${panel};color:#1A1D21;">
<img src="${escapeHtml(emailAssetUrl(asset))}" alt="${escapeHtml(trimmed)}" width="${WIDTH}" height="${HEIGHT}" style="display:block;width:100%;max-width:${WIDTH}px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>`
}

export function renderVisualBlock(block: VisualBlockSpec, accentColor: string): string {
  switch (block.kind) {
    case 'none':
      return ''
    case 'meter':
      return renderMeterHtml({
        label: block.label,
        valuePct: block.valuePct,
        capPct: block.capPct,
        accentColor,
        valueLabel: block.valueLabel,
        capLabel: block.capLabel,
      })
    case 'illustration':
    case 'map':
    case 'photo':
      return renderImageBlock(block.asset, block.alt, accentColor)
  }
}
