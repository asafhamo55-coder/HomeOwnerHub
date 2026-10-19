/**
 * BL-082 — what the resident receives when the board decides their ARC
 * application or replies to their ticket. Pure: subject, HTML, plain text
 * and a single SMS (composeSmsBody, ≤279 characters).
 *
 * The ARC email carries the board's letter verbatim — the same text the
 * resident sees in their portal. The ticket email carries the board's
 * reply: it is addressed to this resident, on their own request, and is
 * already shown to them word for word in the portal. Internal notes never
 * reach here (the caller only notifies on resident-visible messages).
 */

import { composeSmsBody } from '@/lib/communications/sms-body'
import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'

export type ArcNoticeKind = 'approved' | 'approved_with_conditions' | 'denied' | 'more_info'

export interface RenderedNotice {
  subject: string
  html: string
  text: string
  sms: string
}

const ARC_SUBJECT: Record<ArcNoticeKind, string> = {
  approved: 'Your ARC application was approved',
  approved_with_conditions: 'Your ARC application was approved with conditions',
  denied: 'Your ARC application was denied',
  more_info: 'The board needs more information about your ARC application',
}

const ARC_LEAD: Record<ArcNoticeKind, string> = {
  approved: 'The board approved your architectural application',
  approved_with_conditions: 'The board approved your architectural application, with conditions',
  denied: 'The board denied your architectural application',
  more_info: 'The board needs more information before it can decide your architectural application',
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
const ACCENT = '#1F6F5C'

/** Paragraph breaks kept: escape, then newlines become <br />. */
function multiline(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br />')
}

function greeting(name: string | null): string {
  const n = name?.trim()
  return n ? `Hello ${n},` : 'Hello,'
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;"><tr><td bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:6px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 18px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`
}

function quoted(label: string, body: string): string {
  return `<p style="margin:18px 0 6px;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#5B646C;">${escapeHtml(label)}</p>
<div style="margin:0;padding:14px 16px;border-left:3px solid ${ACCENT};background-color:#F6F8F7;font-size:14px;line-height:1.6;color:#1A1D21;">${multiline(body)}</div>`
}

function footer(associationName: string): string {
  return `You’re receiving this because ${escapeHtml(associationName)} emails residents when the board decides or answers their requests. Replies to this email may not be read — use the resident portal to respond.`
}

function wrap(opts: { associationName: string; previewText: string; body: string }): string {
  return renderEmailDocument({
    fluid: true,
    previewText: opts.previewText,
    band: { text: opts.associationName, color: ACCENT },
    bodyHtml: `<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:#1A1D21;">${opts.body}</div>`,
    footerHtml: footer(opts.associationName),
  })
}

export function renderArcDecisionEmail(i: {
  associationName: string
  residentName: string | null
  applicationSummary: string
  kind: ArcNoticeKind
  /** The board-edited decision letter, or the Request info message. */
  letter: string | null
  portalUrl: string
}): RenderedNotice {
  const subject = ARC_SUBJECT[i.kind]
  const letter = i.letter?.trim() ?? ''
  const lead = `${ARC_LEAD[i.kind]}: “${i.applicationSummary}”.`
  const letterLabel = i.kind === 'more_info' ? 'The board’s message' : 'The board’s letter'
  const cta = i.kind === 'more_info' ? 'Reply in the portal' : 'Open your application'
  const openLine = letter
    ? `Open your application in the resident portal to see it with your submission${i.kind === 'more_info' ? ' and reply' : ''}:`
    : `Open your application in the resident portal to see the decision${i.kind === 'more_info' ? ' and reply' : ''}:`

  const html = wrap({
    associationName: i.associationName,
    previewText: subject,
    body: `<p style="margin:0 0 12px;">${escapeHtml(greeting(i.residentName))}</p>
<p style="margin:0 0 12px;">${escapeHtml(lead)}</p>
${letter ? quoted(letterLabel, letter) : ''}
${button(i.portalUrl, cta)}`,
  })

  const text = `${greeting(i.residentName)}

${lead}
${letter ? `\n${letterLabel}:\n\n${letter}\n` : ''}
${openLine}
${i.portalUrl}

— ${i.associationName}`

  const sms = composeSmsBody({
    subject: `${i.associationName}: ${subject}`,
    body: letter || 'Open the resident portal to see the decision.',
    portalLink: i.portalUrl,
  })
  return { subject, html, text, sms }
}

export function renderTicketReplyEmail(i: {
  associationName: string
  residentName: string | null
  ticketSubject: string
  reply: string
  portalUrl: string
}): RenderedNotice {
  const subject = 'The board replied to your request'
  const lead = `The board replied to your request “${i.ticketSubject}”.`
  const reply = i.reply.trim()
  const html = wrap({
    associationName: i.associationName,
    previewText: subject,
    body: `<p style="margin:0 0 12px;">${escapeHtml(greeting(i.residentName))}</p>
<p style="margin:0 0 12px;">${escapeHtml(lead)}</p>
${quoted('The board’s reply', reply)}
${button(i.portalUrl, 'Open your request')}`,
  })
  const text = `${greeting(i.residentName)}

${lead}

The board’s reply:

${reply}

Open your request in the resident portal to see the whole conversation or reply:
${i.portalUrl}

— ${i.associationName}`
  const sms = composeSmsBody({ subject: `${i.associationName}: ${subject}`, body: reply, portalLink: i.portalUrl })
  return { subject, html, text, sms }
}
