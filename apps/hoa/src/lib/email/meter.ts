/**
 * A meter: one exact ratio against a published policy limit.
 *
 * Not a chart. A chart is a statistical aggregate — it needs a volume
 * threshold, it can re-identify a household in a small association, and in
 * this schema it would be grouping on AI-generated free text. A meter is a
 * FACT: 10 of 80 homes leased against a 15% cap is exactly right every time,
 * names nobody, and needs no caveat.
 *
 * Rendered as nested tables with bgcolor fills rather than a generated
 * image, so it renders identically in classic Outlook with images blocked,
 * costs ~2KB instead of a 50KB fetch, and survives dark mode for free.
 */

import { assertAccent, tintOver } from './palette'
import { escapeHtml } from './shell'

export interface MeterOptions {
  /** What is being measured, e.g. "Homes currently leased". */
  label: string
  /** Current value as a percentage of the whole, e.g. 12.5. */
  valuePct: number
  /** The policy limit as a percentage, e.g. 15. Must be > 0. */
  capPct: number
  accentColor: string
  /** Human count under the bar, e.g. "10 of 80 homes". */
  valueLabel: string
  /** The limit in words, e.g. "15% cap". */
  capLabel: string
}

const TEXT = '#1A1D21'
const MUTED = '#5C6670'
const OVER = '#B42318'
const TRACK = '#E8EBED'

export function renderMeterHtml(o: MeterOptions): string {
  if (!(o.capPct > 0)) {
    throw new Error(`meter cap must be greater than zero, got ${o.capPct}`)
  }
  assertAccent(o.accentColor)

  const over = o.valuePct > o.capPct
  const ratio = Math.min(100, Math.max(0, (o.valuePct / o.capPct) * 100))
  // One decimal: enough to be honest, not so much it looks computed. The
  // HTML `width` ATTRIBUTE is specified as an integer percentage though,
  // and the Word rendering engine is the least tolerant of a decimal
  // there — so the attribute gets a separate, rounded-to-integer value
  // while the inline style keeps the honest one-decimal figure.
  const widthStyle = `${Math.round(ratio * 10) / 10}%`
  const widthAttr = `${Math.round(ratio)}%`
  const fill = over ? OVER : o.accentColor
  const panel = tintOver(o.accentColor, 0.06)

  // The over-cap state is carried by TEXT, not only by the bar turning red —
  // a greyscale or inverted render must still communicate it.
  const status = over
    ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:${OVER};background-color:${panel};">This is over the cap.</div>`
    : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${panel}" style="background-color:${panel};color:${TEXT};margin:14px 0;">
<tr><td style="padding:15px 17px;background-color:${panel};color:${TEXT};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="font-size:12px;font-weight:700;color:${TEXT};">${escapeHtml(o.label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:9px 0 7px;">
<tr>
<td width="${widthAttr}" bgcolor="${fill}" style="width:${widthStyle};background-color:${fill};color:${fill};font-size:1px;line-height:18px;mso-line-height-rule:exactly;">&nbsp;</td>
<td bgcolor="${TRACK}" style="background-color:${TRACK};color:${TRACK};font-size:1px;line-height:18px;mso-line-height-rule:exactly;">&nbsp;</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:11px;color:${MUTED};background-color:${panel};">${escapeHtml(o.valueLabel)}</td>
<td align="right" style="font-size:11px;font-weight:700;color:${TEXT};background-color:${panel};">${escapeHtml(o.capLabel)}</td>
</tr></table>
${status}
</td></tr></table>`
}
