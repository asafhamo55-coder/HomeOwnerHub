/**
 * Small pieces every branded email reuses, so the button and the callout
 * look the same in the receipt, the welcome email and the poll.
 */

import { BRAND, brandButtonHtml } from './brand'
import { escapeHtml } from './shell'

/** The call-to-action button: primary blue, white 17px bold text (5.2:1), 52px tall. See brandButtonHtml. */
export function emailButton(href: string, label: string, color: string = BRAND.primary): string {
  return brandButtonHtml(href, label, color)
}

/** A small uppercase label above a block. Muted slate, 13px, 6.4:1 on white. */
export function emailEyebrow(label: string): string {
  return `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(label)}</p>`
}

/** A callout: light blue wash with a primary blue edge. Body text is ink (15.1:1 on the wash). */
export function emailCallout(innerHtml: string): string {
  return `<div style="margin:0;padding:14px 16px;border-left:4px solid ${BRAND.primary};background-color:${BRAND.tint};color:${BRAND.ink};font-size:16px;line-height:1.6;">${innerHtml}</div>`
}
