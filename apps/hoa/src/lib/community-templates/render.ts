/**
 * Renders a community template to HTML and plain text — anatomy B: an
 * accent band carrying the community name, then the headline and the ask,
 * then the visual, then the practical detail.
 *
 * The ordering is not cosmetic. The headline and the first paragraph land
 * before any image so the message is intact when a client blocks pictures.
 *
 * Merge placeholders are passed through untouched. This renderer produces
 * the template BODY that gets stored; substitution happens later, via
 * renderTemplateStrict, once the composer has the board member's answers.
 */

import { renderEmailDocument, escapeHtml } from '@/lib/email/shell'
import { renderVisualBlock } from '@/lib/email/visual-block'
import { BRAND, EMAIL_FONT } from '@/lib/email/brand'
import { emailButton } from '@/lib/email/components'
import { assertAccent } from '@/lib/email/palette'
import type { CommunityTemplate, BodyBlock } from './types'

const TEXT = BRAND.ink
const BODY = BRAND.body
const FONT = EMAIL_FONT

/** Placeholders must survive escaping untouched — they are our own syntax,
 *  not user input. `escapeHtml` never touches `{` or `}`, so the merge
 *  syntax already passes through unharmed with no special-casing needed;
 *  the regex here just normalizes `{{ field }}` (with internal whitespace)
 *  down to the compact `{{field}}` form the strict renderer expects. */
function escapePreservingMerge(s: string): string {
  return escapeHtml(s).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, '{{$1}}')
}

/** Compile-time exhaustiveness check: if a new BodyBlock variant is added
 *  without a case in every switch over `block.type`, TypeScript will refuse
 *  to narrow it to `never` here and the build fails — instead of the new
 *  variant silently rendering as nothing. */
function assertNeverBlock(block: never): never {
  throw new Error(`unhandled BodyBlock type: ${JSON.stringify(block)}`)
}

function renderBlock(block: BodyBlock, t: CommunityTemplate): string {
  switch (block.type) {
    case 'paragraph':
      return `<p style="margin:0 0 11px;font-size:16px;line-height:1.6;color:${BODY};font-family:${FONT};">${escapePreservingMerge(block.text)}</p>`
    case 'visual':
      return renderVisualBlock(t.visual, t.accentColor)
    case 'callout': {
      const panel = BRAND.tint
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${panel}" style="background-color:${panel};color:${TEXT};margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:16px;line-height:1.6;color:${TEXT};background-color:${panel};font-family:${FONT};border-left:4px solid ${BRAND.primary};">${escapePreservingMerge(block.text)}</td></tr></table>`
    }
    case 'list':
      return `<ul style="margin:0 0 11px;padding-left:20px;font-size:16px;line-height:1.6;color:${BODY};font-family:${FONT};">${block.items
        .map((i) => `<li style="margin-bottom:4px;color:${BODY};">${escapePreservingMerge(i)}</li>`)
        .join('')}</ul>`
    case 'raw':
      // Emitted verbatim: unescaped, unwrapped. The merge placeholder this
      // carries (e.g. {{lease_meter_html}}) substitutes to block-level HTML
      // at send time — a <p> cannot legally contain a <table>, so this
      // block exists specifically to not wrap it in one.
      return block.html
    default:
      return assertNeverBlock(block)
  }
}

export function renderCommunityEmailHtml(t: CommunityTemplate): string {
  assertAccent(t.accentColor)

  const headline = `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${TEXT};font-weight:700;font-family:${FONT};">${escapePreservingMerge(t.name.split('—').pop()?.trim() || t.name)}</h1>`

  const cta = t.cta ? emailButton(`{{${t.cta.urlField}}}`, t.cta.label) : ''

  return renderEmailDocument({
    band: { text: '{{association_name}}', color: BRAND.primary },
    previewText: t.preview,
    bodyHtml: headline + t.body.map((b) => renderBlock(b, t)).join('\n') + cta,
    footerHtml: 'Sent to residents of {{association_name}}.',
  })
}

export function renderCommunityEmailText(t: CommunityTemplate): string {
  const lines: string[] = ['{{association_name}}', '']
  for (const block of t.body) {
    switch (block.type) {
      case 'paragraph':
        lines.push(block.text, '')
        break
      case 'callout':
        lines.push(block.text, '')
        break
      case 'list':
        for (const i of block.items) lines.push(`  - ${i}`)
        lines.push('')
        break
      case 'visual':
        break // no visual in the text part
      case 'raw':
        break // block-level HTML (the meter) has no plain-text rendering
      default:
        assertNeverBlock(block)
    }
  }
  // Mirrors the HTML path's CTA button: same urlField, wrapped in braces so
  // it substitutes at send time exactly as the HTML anchor's href does. The
  // HTML part is actionable via the CTA; the text part must be too.
  if (t.cta) {
    lines.push(`${t.cta.label}: {{${t.cta.urlField}}}`, '')
  }
  return lines.join('\n').trimEnd()
}
