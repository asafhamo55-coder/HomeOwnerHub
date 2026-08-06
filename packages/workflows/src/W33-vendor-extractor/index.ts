// W33 — Vendor Extractor
//
// Reads a business email's signature block and returns the vendor contact
// details it STATES. Every field is nullable and a missing one comes back
// null: a hallucinated phone number on a vendor record is worse than a
// blank one, and this output is shown to a human for confirmation before
// any vendor row is written.
//
// EIN is conditional, not forbidden. v1 refused it outright because an EIN
// inferred from an email body is a guess and a wrong tax id corrupts 1099
// reporting. A W-9 attachment changes the evidence, not the risk appetite:
// an EIN survives only when a document supplied it AND it parses to nine
// digits, and even then it is a PROPOSAL the reviewer confirms against the
// source before anything is written. Enforced in
// processVendorExtractorResponse, not merely requested in the prompt.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow } from '@homeowner-portal/ai'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor } from './prompt'

// ─── Schemas ─────────────────────────────────────────────────────────

export const VendorExtractorInputSchema = z.object({
  subject: z.string().nullable(),
  bodyText: z.string(),
  senderEmail: z.string(),
  senderName: z.string().nullable(),
  /**
   * Text extracted from the message's PDF attachments, already truncated by
   * the caller. Null when there were none — which is also what forbids an
   * EIN in the output (see processVendorExtractorResponse).
   */
  attachmentText: z.string().nullable().default(null),
})
export type VendorExtractorInput = z.infer<typeof VendorExtractorInputSchema>

export const VendorExtractorOutputSchema = z.object({
  legalName: z.string().nullable(),
  /**
   * Only ever non-null when an attachment supplied it — a W-9 or similar
   * tax form. Enforced in code, not merely asked for in the prompt.
   *
   * Defaulted rather than required: a model that omits the key entirely is
   * saying "no EIN", which is the safe answer and must not hard-fail the
   * whole extraction.
   */
  ein: z.string().nullable().default(null),
  dba: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  trade: z.string().nullable(),
  address: z
    .object({
      line1: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      postal_code: z.string().nullable(),
    })
    .nullable(),
})
export type VendorExtractorOutput = z.infer<typeof VendorExtractorOutputSchema>

// ─── Pure response processing ────────────────────────────────────────

/**
 * Parse and schema-validate the model's raw JSON.
 *
 * Exported separately from `run()` for the same reason W32 exports
 * `processReplyDrafterResponse`: the root vitest harness is
 * pure-modules-only (no live model, no database), and `run()` cannot be
 * called in isolation because `defineWorkflow` closes over it.
 *
 * `.parse` strips unknown keys, and that strip is what drops an `ein` the
 * model volunteers — enforcement at the schema, not a manual delete
 * somewhere downstream that a later editor could remove without noticing.
 */
export function processVendorExtractorResponse(
  raw: string,
  opts: { attachmentsProvided: boolean },
): VendorExtractorOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') throw new Error('parsed value is not an object')
  } catch (err) {
    // Never log `raw`, and never log err.message — a JSON.parse SyntaxError
    // embeds a prefix of the offending input, which here is email content
    // (a company's address, a resident's name). Log the error type and safe
    // metadata only.
    console.error('[W33] model response parse failed', {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      responseLength: raw.length,
    })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
  const output = VendorExtractorOutputSchema.parse(parsed)

  // EIN provenance and format are enforced HERE, not left to the prompt.
  //
  // The original rule was absolute: never return an EIN, because one
  // inferred from an email body is a guess and a wrong tax id corrupts 1099
  // reporting. That reasoning still holds for prose — so an EIN is dropped
  // outright unless a document was actually supplied. When one was, the
  // value must still look like an EIN; 'see attached' or a mangled parse is
  // an artefact, and a blank beats a wrong tax id nobody re-checks.
  //
  // Even a kept EIN is only ever a PROPOSAL: the caller shows it for
  // confirmation against the source document and never writes it unasked.
  const digits = output.ein?.replace(/\D/g, '') ?? ''
  const ein = opts.attachmentsProvided && digits.length === 9 ? digits : null

  return { ...output, ein }
}

// ─── Workflow ────────────────────────────────────────────────────────

export const vendorExtractor = defineWorkflow({
  id: 'W33',
  name: 'Vendor Extractor',
  version: '2.0.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // The output is proposed into a form a board member confirms before any
  // vendor row is written — the same posture as W32's drafts.
  humanApprovalRequired: true,
  inputSchema: VendorExtractorInputSchema,
  outputSchema: VendorExtractorOutputSchema,

  async run(input, api, _ctx) {
    const completion = await getClient().chat.completions.create({
      model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
      // Zero temperature: this is extraction, not composition. Any
      // creativity here is, by definition, invention.
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPromptFor(input) },
      ],
    })

    api.setModel(completion.model)
    // `setTokens` takes plain numbers, not nullables — a provider that
    // omits usage records 0 rather than leaving the ai_runs row unstamped.
    api.setTokens(completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0)

    const output = processVendorExtractorResponse(
      completion.choices[0]?.message?.content ?? '{}',
      { attachmentsProvided: Boolean(input.attachmentText) },
    )
    // Low confidence when the model found no company name — that is the
    // signal the email had no usable signature block at all.
    api.setConfidence(output.legalName ? 0.7 : 0.2)
    return output
  },
})

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? 'local',
  })
  return _client
}

/** Public wrapper, mirroring W32's `draftReply`. */
export async function extractVendor(
  input: VendorExtractorInput,
  ctx: { organizationId: string },
): Promise<VendorExtractorOutput & { runId: string }> {
  const result = await vendorExtractor.execute(input, { organizationId: ctx.organizationId })
  return { ...result.output, runId: result.runId }
}
