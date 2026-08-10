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
import { tintOver } from './palette'
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

/** Alt text that describes the medium rather than the content is worse than
 *  none — it tells a screen-reader user and a blocked-image reader nothing. */
const USELESS_ALT = /^(image|illustration|photo|picture|graphic|banner|icon)$/i

function renderImageBlock(
  asset: string,
  alt: string,
  accentColor: string,
): string {
  const trimmed = alt.trim()
  if (!trimmed || USELESS_ALT.test(trimmed)) {
    throw new Error(
      `visual block alt text must describe the content, got: "${alt}". ` +
        'With images blocked the alt text is the whole block.',
    )
  }
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
