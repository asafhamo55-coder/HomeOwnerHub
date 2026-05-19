import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runMain } from '@homeowner-portal/ai'
import { getCurrentOrg } from '@/lib/orgs'

// POST /api/ai/rewrite
// Takes a chunk of user-authored text (subject, body, notes, …) and
// returns 3 rewritten variants. The variants are predictable: one
// polished, one tighter, one warmer — so callers can show three labelled
// suggestions without the model deciding the taxonomy.
//
// Input  : { text: string, context?: string }
// Output : { variants: [{ label, text }, { label, text }, { label, text }] }

const Schema = z.object({
  text: z.string().min(1).max(8000),
  /** Free-text hint about what the text is for ("HOA dues reminder", "violation letter"). Improves tone matching. */
  context: z.string().max(500).optional(),
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

export async function POST(request: Request): Promise<Response> {
  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  let raw: string
  try {
    raw = await runMain(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(parsed.data.text, parsed.data.context) },
      ],
      { temperature: 0.4, max_tokens: 2000 },
    )
  } catch (err) {
    console.error('[rewrite] model call failed', err)
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message:
          err instanceof Error
            ? err.message
            : 'The AI service is not reachable right now.',
      },
      { status: 503 },
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
    return NextResponse.json(
      { error: 'empty_response', message: 'The AI returned no usable variants. Try again.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ variants })
}
