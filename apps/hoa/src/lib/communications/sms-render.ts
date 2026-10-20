/**
 * The text message one recipient gets, from their already-rendered subject,
 * HTML and plain text. Shared by the send (./deliver.ts) and the phone
 * preview (./preview-actions.ts), so the preview cannot drift from what
 * goes out (BL-102 A7).
 *
 * One SMS of at most SMS_MAX_CHARS characters. A longer one is shortened
 * and ends with a link to the full message in the portal. A bilingual body
 * sends both languages only when both fit whole in one text; otherwise
 * English only (the portal link carries the Spanish).
 *
 * Pure. Nothing here logs.
 */

import { htmlToSmsBody } from '@/lib/sms'
import { composeSmsBody } from './sms-body'
import { composeBilingualSms, htmlToPlainText, splitBilingualHtml } from './bilingual'

export interface RenderSmsInput {
  /** Rendered subject (merge fields already filled). */
  subject: string
  /** Rendered HTML body. */
  html: string
  /** Rendered plain-text body, when the message has one. */
  text?: string
  portalLink: string
}

export interface RenderedSms {
  body: string
  /** The text was cut to fit and ends with the portal link. */
  shortened: boolean
  /** The body is bilingual but only the English fit. */
  englishOnly: boolean
}

export function renderSmsText({ subject, html, text, portalLink }: RenderSmsInput): RenderedSms {
  const parts = splitBilingualHtml(html)
  if (parts.spanish) {
    const bilingual = composeBilingualSms({
      subject,
      englishText: htmlToPlainText(parts.englishHtml),
      spanish: { subject: parts.spanish.subject, text: htmlToPlainText(parts.spanish.html) },
      portalLink,
    })
    return {
      body: bilingual.body,
      shortened: bilingual.body.includes(portalLink),
      englishOnly: !bilingual.spanishIncluded,
    }
  }
  const body = composeSmsBody({ subject, body: text ?? htmlToSmsBody(html, 200), portalLink })
  return { body, shortened: body.includes(portalLink), englishOnly: false }
}
