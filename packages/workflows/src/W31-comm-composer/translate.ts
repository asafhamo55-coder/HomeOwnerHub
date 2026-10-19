// W31 — Comm Composer, translation step (BL-025).
//
// Turns a finished English communication (subject + HTML body) into a
// Spanish draft the board reviews and edits before anything sends. Same
// discipline as the composer: never invent facts, keep every
// {{ merge_field }} exactly, JSON-only reply validated before use.
//
// The model call is injected (`complete`) rather than owned here, so the
// caller decides which client and which rate limit it runs under — the HOA
// route passes `runMain` from @homeowner-portal/ai behind requireAiQuota —
// and unit tests pass a mock. Nothing in this file touches the network.

import { z } from 'zod'

export const TRANSLATE_PROMPT_VERSION = '1.0.0'

export const CommTranslateInputSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  bodyHtml: z.string().trim().min(1).max(20_000),
})
export type CommTranslateInput = z.infer<typeof CommTranslateInputSchema>

export const CommTranslateOutputSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  bodyHtml: z.string().trim().min(1).max(40_000),
})
export type CommTranslateOutput = z.infer<typeof CommTranslateOutputSchema>

export type TranslateMessage = { role: 'system' | 'user'; content: string }
export type TranslateComplete = (messages: TranslateMessage[]) => Promise<string>

export const TRANSLATE_SYSTEM_PROMPT = `You translate homeowner-association communications from English into Spanish for residents in the United States.

Rules you MUST follow:
1. Translate faithfully. Never add, drop or change a fact: dates, times, amounts of money, names, addresses, deadlines, phone numbers, URLs and rule or statute citations stay exactly as written.
2. Keep every merge field such as {{ recipient_name }} or {{association_name}} EXACTLY as written, in English, braces included. Never translate, rename, add or remove one.
3. Keep the HTML structure: the same tags in the same order. Translate only the text between tags. Never translate attribute values such as href.
4. Use clear, neutral, respectful Latin American Spanish ("usted" form). Plain language, not legalese.
5. Do not add notes, disclaimers or commentary.

Return strict JSON only, no code fences:
{ "subject": "<Spanish subject>", "bodyHtml": "<Spanish HTML body>" }`

export function translateUserPrompt(input: CommTranslateInput): string {
  return `Translate this communication into Spanish.

SUBJECT:
"""
${input.subject}
"""

BODY (HTML):
"""
${input.bodyHtml}
"""

Return JSON only.`
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Sorted, de-duplicated merge-field names a string references. */
export function mergeFieldNames(source: string): string[] {
  const names = new Set<string>()
  for (const m of source.matchAll(PLACEHOLDER_RE)) names.add(m[1])
  return [...names].sort()
}

/**
 * Parse and check one model reply. Null means "unusable": not JSON, the
 * wrong shape, or a merge-field set that differs from the English one. A
 * dropped field would send residents a Spanish text missing their name; an
 * invented one would fail the strict render for every recipient.
 */
export function parseTranslationReply(raw: string | null, input: CommTranslateInput): CommTranslateOutput | null {
  if (!raw) return null
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch {
    return null
  }
  const parsed = CommTranslateOutputSchema.safeParse(json)
  if (!parsed.success) return null
  const want = mergeFieldNames(`${input.subject}\n${input.bodyHtml}`).join(',')
  const got = mergeFieldNames(`${parsed.data.subject}\n${parsed.data.bodyHtml}`).join(',')
  if (want !== got) return null
  return parsed.data
}

export type TranslateResult =
  | { ok: true; translation: CommTranslateOutput; promptVersion: string }
  | { ok: false; reason: 'unusable_reply' }

/**
 * One call, one retry on an unusable reply. A thrown `complete` (provider
 * down) propagates so the caller can map it to its own envelope.
 */
export async function translateCommunication(
  input: CommTranslateInput,
  complete: TranslateComplete,
): Promise<TranslateResult> {
  const messages: TranslateMessage[] = [
    { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
    { role: 'user', content: translateUserPrompt(input) },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    const translation = parseTranslationReply(await complete(messages), input)
    if (translation) return { ok: true, translation, promptVersion: TRANSLATE_PROMPT_VERSION }
  }
  return { ok: false, reason: 'unusable_reply' }
}
