// BL-025 — bilingual (English + Spanish) communications.
//
// The Spanish version is stored inside the communication body itself
// (communications.body_html), after the English, between two HTML comment
// markers. No migration: every reader that already shows body_html — the
// email, the portal inbox, the detail page — shows both languages, and the
// send path can still split them apart for SMS (and, later, per resident).
//
// Pure and client-safe: the wizard imports it for its SMS estimate, send.ts
// for the real thing. No server imports.

import { SMS_MAX_CHARS, composeSmsBody } from './sms-body'

export type CommLanguage = 'en' | 'es'

/**
 * A resident's preferred language, or null when we do not know it.
 *
 * Seam for M-P1: there is no per-resident language field yet, so every
 * recipient is `null` today and gets both languages. When M-P1 adds the
 * column, `recipientLanguagePreference` reads it and `bodyForLanguage`
 * already knows what to do with each answer.
 */
export type LanguagePreference = CommLanguage | null

const START = '<!-- hh:lang=es:start -->'
const END = '<!-- hh:lang=es:end -->'
const SUBJECT_RE = /<h3 data-hh-es-subject>([\s\S]*?)<\/h3>/

export const SPANISH_HEADING = 'Español'

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function unescapeText(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** English first, then a clearly headed "Español" section. */
export function composeBilingualHtml({
  englishHtml,
  spanishSubject,
  spanishHtml,
}: {
  englishHtml: string
  spanishSubject: string
  spanishHtml: string
}): string {
  return [
    englishHtml.trim(),
    START,
    '<hr>',
    `<section lang="es">`,
    `<h2>${SPANISH_HEADING}</h2>`,
    `<h3 data-hh-es-subject>${escapeText(spanishSubject.trim())}</h3>`,
    spanishHtml.trim(),
    '</section>',
    END,
  ].join('\n')
}

export interface BilingualParts {
  englishHtml: string
  /** Null when the body carries no Spanish section. */
  spanish: { subject: string; html: string } | null
}

/** Inverse of composeBilingualHtml; works on rendered or unrendered bodies. */
export function splitBilingualHtml(html: string): BilingualParts {
  const start = html.indexOf(START)
  const end = html.indexOf(END, start + START.length)
  if (start === -1 || end === -1) return { englishHtml: html, spanish: null }
  const section = html.slice(start + START.length, end)
  const subject = unescapeText(SUBJECT_RE.exec(section)?.[1] ?? '').trim()
  const inner = section
    .replace(/^\s*<hr>\s*<section lang="es">\s*/, '')
    .replace(/\s*<\/section>\s*$/, '')
    .replace(`<h2>${SPANISH_HEADING}</h2>`, '')
    .replace(SUBJECT_RE, '')
    .trim()
  return { englishHtml: html.slice(0, start).trim(), spanish: { subject, html: inner } }
}

export function isBilingual(html: string): boolean {
  return splitBilingualHtml(html).spanish !== null
}

/** M-P1 seam: always null until residents have a language field. */
export function recipientLanguagePreference(_recipient: unknown): LanguagePreference {
  return null
}

/**
 * The body a recipient should get. Null (unknown) and a non-bilingual body
 * return the body unchanged, so today's output is byte-identical.
 * 'en' drops the Spanish section; 'es' puts it first and keeps the English
 * below it, since the English remains the board's text of record.
 */
export function bodyForLanguage(html: string, preference: LanguagePreference): string {
  if (preference === null) return html
  const parts = splitBilingualHtml(html)
  if (!parts.spanish) return html
  if (preference === 'en') return parts.englishHtml
  return [
    `<section lang="es">`,
    `<h3>${escapeText(parts.spanish.subject)}</h3>`,
    parts.spanish.html,
    '</section>',
    '<hr>',
    parts.englishHtml,
  ].join('\n')
}

/** Plain text for SMS and the email text part. Not a sanitizer. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|section)>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Text squashed onto one line, for SMS. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export interface BilingualSms {
  body: string
  /** False when both languages did not fit and the text is English only. */
  spanishIncluded: boolean
}

/**
 * One SMS of at most SMS_MAX_CHARS. Both languages when they fit whole;
 * otherwise English only, through the normal composeSmsBody (which
 * shortens and links to the portal, where both languages are shown).
 * Spanish is never cut in half.
 */
export function composeBilingualSms({
  subject,
  englishText,
  spanish,
  portalLink,
}: {
  subject: string
  englishText: string
  spanish: { subject: string; text: string } | null
  portalLink: string
}): BilingualSms {
  const en = oneLine(englishText)
  if (spanish) {
    const both = `${oneLine(subject)}: ${en} / ${oneLine(spanish.subject)}: ${oneLine(spanish.text)}`
    if (both.length <= SMS_MAX_CHARS) return { body: both, spanishIncluded: true }
  }
  return { body: composeSmsBody({ subject, body: en, portalLink }), spanishIncluded: false }
}

/** Shown in the wizard when the SMS will go out in English only. */
export const SMS_ENGLISH_ONLY_NOTE = `Both languages don't fit in one ${SMS_MAX_CHARS}-character text, so the SMS goes out in English only. Email and the portal carry both languages.`
