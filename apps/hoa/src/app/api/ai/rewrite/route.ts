import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runMain } from '@homeowner-portal/ai'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteMember } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { MAX_SHORT_TEXT } from '@/lib/api/limits'
import { logRouteFailure } from '@/lib/api/log'

// POST /api/ai/rewrite
// Takes a chunk of user-authored text (subject, body, notes, …) and
// returns 3 rewritten variants. The variants are predictable: one
// polished, one tighter, one warmer — so callers can show three labelled
// suggestions without the model deciding the taxonomy.
//
// Input  : { text: string, context?: string }
// Output : { variants: [{ label, text }, { label, text }, { label, text }] }
// Errors : the RC-1 envelope — 401 unauthenticated, 403 forbidden (no_org),
//          400 invalid_json / validation_failed, 413 payload_too_large,
//          503 upstream_unavailable (provider down or unusable reply).
//
// Gate: requireRouteMember, NOT the board gate. AiRewriteButton is rendered on
// board pages under app/(dashboard) AND on four resident pages
// (resident/arc/new, resident/ask, resident/report-violation,
// resident/tickets/new), so this is a mixed surface (RC-4). Residents may call
// it because it only rewrites the caller's own submitted text: it reads no
// rows and returns no other resident's data.

const Schema = z.object({
  text: zText(8000, 1),
  /** Free-text hint about what the text is for ("HOA dues reminder", "violation letter"). Improves tone matching. */
  context: zText(MAX_SHORT_TEXT).optional(),
})

const VARIANT_SPECS = [
  {
    label: 'Polished',
    instruction:
      'Tighten grammar, fix awkward phrasing, smooth the flow. Preserve the meaning and roughly the same length.',
  },
  {
    label: 'Concise',
    instruction:
      'Trim aggressively while preserving every concrete fact (dates, amounts, names, deadlines). Aim for ~60% of the original length.',
  },
  {
    label: 'Warmer',
    instruction:
      "Keep the meaning and structure but soften the tone — friendlier, less formal, more empathetic. Avoid sounding like a lawyer.",
  },
] as const

const SYSTEM_PROMPT = `You rewrite user-authored text for an HOA management application.

Rules that apply to every variant you produce:
- Preserve every concrete fact: dates, amounts of money, names, addresses, deadlines, statute citations.
- Never invent facts. If the original doesn't contain a fact, the rewrite doesn't either.
- Keep merge fields like {{owner_name}} or {{ recipient_name }} exactly as written.
- Match the input language. If the input is English, output English. If it's Spanish, output Spanish.
- Don't add headers, signatures, salutations, or closings unless they were in the original.
- Don't add disclaimers, footnotes, or commentary. Output the rewritten text only.

You will be asked to produce three variants with different instructions. Return strict JSON in the shape:
{
  "variants": [
    { "label": "Polished", "text": "…" },
    { "label": "Concise",  "text": "…" },
    { "label": "Warmer",   "text": "…" }
  ]
}
No prose outside the JSON. No code fences.`

function userPrompt(text: string, context: string | undefined): string {
  const ctx = context?.trim()
    ? `Context: ${context.trim()}\n\n`
    : ''
  const instructions = VARIANT_SPECS.map(
    (v, i) => `${i + 1}. ${v.label} — ${v.instruction}`,
  ).join('\n')
  return `${ctx}Original text:
"""
${text}
"""

Produce three variants:
${instructions}

Return JSON only.`
}

interface ModelResponse {
  variants?: Array<{ label?: unknown; text?: unknown }>
}

function parseModelJson(raw: string): ModelResponse {
  // Strip code fences if the model added them despite instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    const json = JSON.parse(cleaned)
    if (json && typeof json === 'object') return json as ModelResponse
  } catch {
    /* fall through */
  }
  return {}
}

export const POST = withRoute('ai.rewrite', async (request) => {
  // Residents included on purpose — see the header comment (mixed surface).
  const { orgId } = await requireRouteMember()
  const body = await parseJson(request, Schema)

  let raw: string
  try {
    raw = await runMain(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(body.text, body.context) },
      ],
      { temperature: 0.4, max_tokens: 2000 },
    )
  } catch (err) {
    logRouteFailure('ai.rewrite.model', err, { orgId })
    throw new ApiRouteError(
      'upstream_unavailable',
      'The AI rewrite service is not reachable right now. Try again shortly.',
    )
  }

  const json = parseModelJson(raw)
  const variants = Array.isArray(json.variants)
    ? json.variants
        .filter(
          (v): v is { label: string; text: string } =>
            typeof v?.label === 'string' && typeof v?.text === 'string' && v.text.trim().length > 0,
        )
        .slice(0, 3)
    : []

  if (variants.length === 0) {
    logRouteFailure('ai.rewrite.empty_reply', null, { orgId })
    throw new ApiRouteError('upstream_unavailable', 'The AI returned no usable variants. Try again.', {
      reason: 'empty_response',
    })
  }

  return NextResponse.json({ variants })
})
