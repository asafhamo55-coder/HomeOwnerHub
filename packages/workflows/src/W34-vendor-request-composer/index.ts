// W34 — Vendor Request Composer
//
// Turns a resident's thread — plus the unit it concerns, the vendor record,
// and text pulled out of the attached documents — into a clean work order
// addressed to a vendor. A board member reviews, fills any blanks, and
// approves before anything sends (`humanApprovalRequired` below).
//
// Pattern mirrors W32 (Reply Drafter): own OpenAI-compatible client,
// JSON-object response format, Zod-validated output. Two deliberate
// differences from W32, both from spec D7 and the "no corrective retry"
// note:
//
//   - NO citation gate. A vendor email has nothing citable in it — there is
//     no governing document that says a ceiling is leaking. `attachmentDigest`
//     is the review aid instead: each finding names the file it came from so
//     a board member can check it in one click. It is not a validated gate
//     and this file does not pretend it is one.
//
//   - NO corrective retry. W32 retries once because its citation gate rejects
//     genuine drafts over a re-typed quote — a fixable formatting slip. Here
//     a Zod failure means the model returned something malformed, and paying
//     for a second call to find that out again is not a better outcome for
//     the board member than an honest error.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, resolveModel } from '@homeowner-portal/ai'
import {
  PROMPT_VERSION,
  VENDOR_REQUEST_SYSTEM,
  buildVendorRequestUserPrompt,
} from './prompt'

// ─── Public types ────────────────────────────────────────────────────

export const VENDOR_REQUEST_INTENTS = [
  'inspect_quote',
  'emergency',
  'schedule',
  'warranty',
  'bid',
  'other',
] as const

export type VendorRequestIntent = (typeof VENDOR_REQUEST_INTENTS)[number]

/**
 * A finding drawn from an attached image.
 *
 * Present in the schema from day one, and always `[]` in this phase — the
 * default `AI_MODEL` (see DEFAULT_MODEL) is text-only and no vision
 * producer exists yet (spec D9, and W3's own "Phase 2.0: text-only" note).
 * Carrying the field now means adding vision later is a new producer feeding
 * an existing field rather than a schema migration through every caller.
 */
export const PhotoFindingSchema = z.object({
  fileName: z.string(),
  finding: z.string(),
})

export type PhotoFinding = z.infer<typeof PhotoFindingSchema>

export const VendorRequestComposerInputSchema = z.object({
  intent: z.enum(VENDOR_REQUEST_INTENTS),
  /** Only meaningful when `intent === 'other'`; ignored otherwise. */
  freeTextInstruction: z.string().max(2000).nullable(),
  /** ISO date the board picked, or null when they gave none. */
  neededBy: z.string().nullable(),
  threadSubject: z.string().nullable(),
  messages: z.array(
    z.object({
      direction: z.enum(['inbound', 'outbound']),
      from: z.string(),
      text: z.string(),
    }),
  ),
  property: z
    .object({
      addressLine1: z.string(),
      unitNumber: z.string().nullable(),
    })
    .nullable(),
  vendor: z
    .object({
      legalName: z.string(),
      dba: z.string().nullable(),
      trades: z.array(z.string()),
    })
    .nullable(),
  attachmentText: z.string().nullable(),
  photoFindings: z.array(PhotoFindingSchema),
  degraded: z.array(z.string()),
})

export type VendorRequestComposerInput = z.infer<typeof VendorRequestComposerInputSchema>

export const VENDOR_REQUEST_BLANK_KINDS = [
  'money',
  'authority',
  'access',
  'date',
  'scope',
] as const

export type VendorRequestBlankKind = (typeof VENDOR_REQUEST_BLANK_KINDS)[number]

export const VendorRequestComposerOutputSchema = z.object({
  subject: z.string(),
  greeting: z.string(),
  situation: z.string(),
  // Bounded at both ends. An empty `asks` array is the one output that makes
  // this whole feature pointless — a vendor email with no request in it —
  // and the upper bound keeps the numbered block scannable on a phone.
  asks: z.array(z.object({ text: z.string() })).min(1).max(6),
  accessNotes: z.string().nullable(),
  attachmentDigest: z.array(z.object({ fileName: z.string(), finding: z.string() })),
  blanks: z.array(
    z.object({
      kind: z.enum(VENDOR_REQUEST_BLANK_KINDS),
      prompt: z.string(),
    }),
  ),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

export type VendorRequestComposerOutput = z.infer<typeof VendorRequestComposerOutputSchema>

// ─── LLM client (OpenAI-compatible; talks to whatever AI_BASE_URL) ───

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? 'local',
  })
  return _client
}

// ─── Workflow ────────────────────────────────────────────────────────

export const vendorRequestComposer = defineWorkflow({
  id: 'W34',
  name: 'Vendor Request Composer',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: resolveModel(),
  // A work order is a proposal until a board member approves it. Static, as
  // in W3/W21/W22/W23/W32 — never flipped conditionally in run().
  humanApprovalRequired: true,
  inputSchema: VendorRequestComposerInputSchema,
  outputSchema: VendorRequestComposerOutputSchema,

  async run(input, api, _ctx) {
    const completion = await getClient().chat.completions.create({
      model: resolveModel(),
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VENDOR_REQUEST_SYSTEM },
        { role: 'user', content: buildVendorRequestUserPrompt(input) },
      ],
    })

    if (completion.usage) {
      api.setTokens(completion.usage.prompt_tokens, completion.usage.completion_tokens)
    }
    api.setModel(completion.model)

    const output = processVendorRequestResponse(completion.choices[0]?.message?.content ?? '{}')

    api.setConfidence(CONFIDENCE_SCORE[output.confidence])
    return output
  },
})

/**
 * The model's own three-way confidence, mapped onto the numeric score the
 * audit row carries. Same shape as W32's `grounded ? 0.8 : 0.2`, one step
 * finer because this workflow has a three-valued signal rather than a
 * boolean.
 */
const CONFIDENCE_SCORE: Record<VendorRequestComposerOutput['confidence'], number> = {
  HIGH: 0.85,
  MEDIUM: 0.55,
  LOW: 0.25,
}

/** Convenience wrapper matching draftReply / queryGoverningDocs / askStateLaw. */
export async function composeVendorRequest(
  input: VendorRequestComposerInput,
  ctx: { organizationId: string },
): Promise<VendorRequestComposerOutput & { runId: string }> {
  const result = await vendorRequestComposer.execute(input, {
    organizationId: ctx.organizationId,
  })
  return { ...result.output, runId: result.runId }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseModelJson(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error('parsed value is not an object')
  } catch (err) {
    // Never log `raw`, and never log err.message/String(err) — a JSON.parse
    // SyntaxError embeds a prefix of the offending input, which here is the
    // model's rendering of a resident's complaint and their address. Log the
    // error's type and safe metadata only. Same reasoning as W32's copy.
    const errorName = err instanceof Error ? err.name : 'UnknownError'
    console.error('[W34] model response parse failed', { errorName, responseLength: raw.length })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
}

/**
 * Parse + schema-validate the model's raw JSON response.
 *
 * Exported separately from `run()` so it is unit-testable without a live
 * model — this repo's root vitest harness is deliberately pure-modules-only
 * (see vitest.config.ts), and `run()` itself can't be called in isolation
 * because `defineWorkflow` closes over it.
 *
 * Deliberately does NOT reconcile `blanks` against the `[[BLANK: …]]`
 * markers actually present in the text. The two can disagree in both
 * directions, and each disagreement is handled where it does the least
 * damage rather than by throwing the whole draft away:
 *
 *   - A marker in the text with no matching `blanks` entry still blocks
 *     approve, because `hasUnfilledBlanks` (lib/inbox/draft/blanks.ts) reads
 *     the body text, not this array. The board member sees a marker they
 *     must resolve; they simply get no explanatory prompt beside it.
 *   - A `blanks` entry with no marker in the text renders one extra callout
 *     next to a draft that has nothing to fill in.
 *
 * Neither is worth discarding a usable work order over, and a strict check
 * would fail closed on the model's most common formatting slip.
 */
export function processVendorRequestResponse(raw: string): VendorRequestComposerOutput {
  return VendorRequestComposerOutputSchema.parse(parseModelJson(raw))
}

export { PROMPT_VERSION, VENDOR_REQUEST_SYSTEM, buildVendorRequestUserPrompt }
