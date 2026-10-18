// W37 — ARC Review (BL-024 resident pre-check, BL-027 board review draft)
//
// One workflow, two modes, both grounded by W1's governing-document
// retrieval (retrieveChunks) and both ADVISORY ONLY:
//
//   precheck  the resident checks a planned change before submitting. Returns
//             the rules that likely apply (cited), possible conflicts, and
//             what the board will probably ask about. It never says
//             approved/denied — code strips any verdict sentence the model
//             writes (stripVerdicts) — and it refuses ("I couldn't find rules
//             that clearly apply") when retrieval or the model's confidence is
//             low, or no citation survives validation.
//   review    on submission, a draft for the board: cited rules, a suggested
//             decision with reasoning and conditions. The run lands in ai_runs
//             as 'pending_human_approval'; NOTHING is decided here. The board
//             decides with the existing ARC actions and the decision is
//             recorded back on the run (human_approved / human_feedback).
//
// Privacy: the input carries buildArcFacts() output only — category,
// summary and description with emails/phones redacted, and yes/no for the
// dates and the contractor. No name, address, unit, email or phone reaches
// the model or ai_runs.input. Nothing here logs request text.
//
// Photos (BL-079, review mode only): the caller passes attachment ids and
// "Photo N" labels in the input and the image bytes OUT OF BAND (ctx.images),
// so ai_runs.input never holds an image or a file name. The vision model
// reads them once, after retrieval, and the findings — each tied to its
// photo, low or medium confidence — feed the text model's suggestion. A
// vision failure degrades to no findings and a warning. See ./photos.
//
// The model ids come from packages/ai (resolveModel / resolveVisionModel via
// analyzeImages); tests inject a fake ArcReviewModel and a fake retrieval.

import { z } from 'zod'
import OpenAI from 'openai'
import { analyzeImages, defineWorkflow, JSON_MODE_PARAMS, resolveModel, resolveVisionModel, type WorkflowExecuteApi } from '@homeowner-portal/ai'
import { redactContactPII } from '@homeowner-portal/ai/pii'
import { retrieveChunks, type RetrieveOptions, type RetrievedChunk } from '../W1-governing-docs-brain/tools'
import { PRECHECK_SYSTEM_PROMPT, PROMPT_VERSION, REVIEW_SYSTEM_PROMPT, userPromptFor } from './prompt'
import {
  ArcPhotoFindingSchema,
  ArcPhotoRefSchema,
  arcPhotoMaxTokens,
  arcPhotoQuestion,
  processArcPhotoFindings,
  type ArcPhotoFinding,
} from './photos'

export { GoverningDocsRetrievalError } from '../W1-governing-docs-brain/tools'
export {
  ARC_PHOTO_CONFIDENCE,
  ARC_PHOTO_DEFAULT_MAX,
  ArcPhotoFindingSchema,
  ArcPhotoRefSchema,
  resolveArcReviewMaxPhotos,
  type ArcPhotoConfidence,
  type ArcPhotoFinding,
  type ArcPhotoRef,
} from './photos'

export const W37_WORKFLOW_ID = 'W37'

// ─── Request facts ───────────────────────────────────────────────────

export const ARC_REVIEW_CATEGORIES = [
  'paint',
  'fence',
  'deck_patio',
  'roof',
  'landscaping',
  'addition',
  'pool',
  'solar',
  'other',
] as const
export type ArcReviewCategory = (typeof ARC_REVIEW_CATEGORIES)[number]

export const ARC_CATEGORY_LABEL: Record<ArcReviewCategory, string> = {
  paint: 'Exterior paint or stain',
  fence: 'Fence or wall',
  deck_patio: 'Deck, patio or screened enclosure',
  roof: 'Roof or gutters',
  landscaping: 'Landscaping',
  addition: 'Addition or structural change',
  pool: 'Pool or spa',
  solar: 'Solar panels',
  other: 'Other exterior change',
}

export const ArcFactsSchema = z.object({
  category: z.enum(ARC_REVIEW_CATEGORIES),
  summary: z.string().max(200),
  scopeDescription: z.string().max(4000),
  hasStartDate: z.boolean(),
  hasCompletionDate: z.boolean(),
  hasContractor: z.boolean(),
  hasContractorLicense: z.boolean(),
})
export type ArcFacts = z.infer<typeof ArcFactsSchema>

export interface ArcRequestFields {
  category: ArcReviewCategory
  summary: string
  scopeDescription: string
  proposedStart?: string | null
  proposedCompletion?: string | null
  contractorName?: string | null
  contractorLicense?: string | null
}

const present = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== ''

/** The only shape of a request that reaches the model or ai_runs. */
export function buildArcFacts(r: ArcRequestFields): ArcFacts {
  return {
    category: r.category,
    summary: redactContactPII(r.summary.trim()).slice(0, 200),
    scopeDescription: redactContactPII(r.scopeDescription.trim()).slice(0, 4000),
    hasStartDate: present(r.proposedStart),
    hasCompletionDate: present(r.proposedCompletion),
    hasContractor: present(r.contractorName),
    hasContractorLicense: present(r.contractorLicense),
  }
}

// ─── Missing information (deterministic) ─────────────────────────────

export const ARC_MISSING_INFO = ['dimensions', 'materials', 'colors', 'contractor', 'dates'] as const
export type ArcMissingInfo = (typeof ARC_MISSING_INFO)[number]

/** What each kind of change needs before a board can judge it. */
const NEEDS: Record<ArcReviewCategory, readonly ArcMissingInfo[]> = {
  paint: ['colors', 'contractor', 'dates'],
  fence: ['dimensions', 'materials', 'colors', 'contractor', 'dates'],
  deck_patio: ['dimensions', 'materials', 'colors', 'contractor', 'dates'],
  roof: ['materials', 'colors', 'contractor', 'dates'],
  landscaping: ['materials', 'dates'],
  addition: ['dimensions', 'materials', 'colors', 'contractor', 'dates'],
  pool: ['dimensions', 'materials', 'contractor', 'dates'],
  solar: ['dimensions', 'contractor', 'dates'],
  other: ['dimensions', 'materials', 'dates'],
}

const DIMENSIONS_RE =
  /\d+(?:\.\d+)?\s*(?:'|"|′|″|ft\b|feet|foot|in\b|inch|inches|m\b|meters?|metres?|cm\b|sq\.?\s*ft|square|x\s*\d|by\s*\d)/i
const MATERIALS_RE =
  /\b(wood(?:en)?|cedar|pine|redwood|vinyl|pvc|aluminum|aluminium|steel|iron|wrought|chain[- ]link|composite|trex|brick|stone|concrete|pavers?|stucco|shingles?|asphalt|metal|tiles?|slate|fiberglass|glass|screen(?:ed)?|mulch|gravel|sod|turf|plants?|shrubs?|trees?)\b/i
const COLORS_RE =
  /\b(colou?rs?|white|black|gr[ae]y|beige|tan|brown|green|blue|red|yellow|cream|ivory|taupe|navy|charcoal|sherwin|benjamin moore|behr|valspar|sw\s?\d{4}|stain(?:ed)?|natural|unpainted)\b/i
const DIY_RE = /\b(diy|myself|ourselves|do it ourselves|i will do|we will do|homeowner will)\b/i

/** The details this kind of change needs that the request does not give. */
export function detectMissingInfo(f: ArcFacts): ArcMissingInfo[] {
  const text = `${f.summary}\n${f.scopeDescription}`
  const has: Record<ArcMissingInfo, boolean> = {
    dimensions: DIMENSIONS_RE.test(text),
    materials: MATERIALS_RE.test(text),
    colors: COLORS_RE.test(text),
    contractor: f.hasContractor || DIY_RE.test(text),
    dates: f.hasStartDate,
  }
  return NEEDS[f.category].filter((k) => !has[k])
}

// ─── Output ──────────────────────────────────────────────────────────

export const ARC_RULE_STATUSES = ['fits', 'possible_conflict', 'unclear'] as const
export type ArcRuleStatus = (typeof ARC_RULE_STATUSES)[number]

export const ARC_DECISIONS = ['approve', 'approve_with_conditions', 'deny', 'need_more_info'] as const
export type ArcSuggestedDecision = (typeof ARC_DECISIONS)[number]

export const ArcRuleSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  docType: z.string(),
  section: z.string().nullable(),
  point: z.string(),
  status: z.enum(ARC_RULE_STATUSES),
})
export type ArcRule = z.infer<typeof ArcRuleSchema>

export const ArcSuggestionSchema = z.object({
  decision: z.enum(ARC_DECISIONS),
  reasoning: z.string(),
  conditions: z.array(z.string()),
})
export type ArcSuggestion = z.infer<typeof ArcSuggestionSchema>

export const ArcReviewOutputSchema = z.object({
  mode: z.enum(['precheck', 'review']),
  /** no_rules = refused: nothing in the documents clearly applies. */
  status: z.enum(['answered', 'no_rules']),
  summary: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  rules: z.array(ArcRuleSchema),
  questions: z.array(z.string()),
  missingInfo: z.array(z.enum(ARC_MISSING_INFO)),
  /** Review mode only; null on a refusal and always in precheck mode. */
  suggestion: ArcSuggestionSchema.nullable(),
  /** Where code changed what the model said, in plain words for the board. */
  warnings: z.array(z.string()),
  /** Review mode (BL-079): objective facts read from the attached photos, each tied to its photo. */
  photoFindings: z.array(ArcPhotoFindingSchema),
  disclaimer: z.string(),
})
export type ArcReviewOutput = z.infer<typeof ArcReviewOutputSchema>

export const ARC_PRECHECK_DISCLAIMER =
  'This is an automated check of your community’s documents, not a decision. Only the board can approve or deny your application.'
export const ARC_REVIEW_DISCLAIMER =
  'A suggestion only. The board decides: nothing is approved, denied or sent until a board member acts.'
export const ARC_PRECHECK_REFUSAL =
  'I couldn’t find rules in your community’s documents that clearly apply to this change. That doesn’t mean it is allowed or not allowed — the board decides. You can still submit your application.'
export const ARC_REVIEW_REFUSAL =
  'No rules in the governing documents clearly apply to this request, so there is no suggestion. Decide it on the board’s own reading of the documents.'

// ─── Verdict scrubbing (resident text) ───────────────────────────────

const VERDICT_RE =
  /\b(pre-?approved|approved|denied|denies|deny|rejected|rejects?|guaranteed|go ahead|good to go|cleared to|(?:can|may) (?:start|begin|proceed))\b/i

/** Drop every sentence that reads as a decision. Process words ("needs approval") stay. */
export function stripVerdicts(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim() !== '' && !VERDICT_RE.test(s))
    .join(' ')
    .trim()
}

// ─── Pure response processing ────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

function stripFence(raw: string): string {
  const m = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return m ? m[1]! : raw.trim()
}

const MAX_RULES = 8
const MAX_QUESTIONS = 5
const MAX_CONDITIONS = 8

export interface ProcessOptions {
  mode: 'precheck' | 'review'
  retrieved: RetrievedChunk[]
  facts: ArcFacts
}

function refusal(mode: ProcessOptions['mode'], facts: ArcFacts): ArcReviewOutput {
  return {
    mode,
    status: 'no_rules',
    summary: mode === 'precheck' ? ARC_PRECHECK_REFUSAL : ARC_REVIEW_REFUSAL,
    confidence: 'LOW',
    rules: [],
    questions: [],
    missingInfo: detectMissingInfo(facts),
    suggestion: null,
    warnings: [],
    photoFindings: [],
    disclaimer: mode === 'precheck' ? ARC_PRECHECK_DISCLAIMER : ARC_REVIEW_DISCLAIMER,
  }
}

/** The answer for "nothing was retrieved" — no model call is made. */
export function arcReviewRefusal(mode: ProcessOptions['mode'], facts: ArcFacts): ArcReviewOutput {
  return refusal(mode, facts)
}

/**
 * Parse and normalize the model's raw reply. Code, not the prompt, enforces
 * what matters: only retrieved chunks can be cited, a low-confidence or
 * uncited answer is a refusal, resident text never carries a verdict, and a
 * denial must rest on a cited conflict. Exported for the unit suite.
 */
export function processArcReviewResponse(raw: string, opts: ProcessOptions): ArcReviewOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(raw))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
  } catch (err) {
    // Never log `raw` or err.message: a SyntaxError embeds a prefix of the
    // reply, which echoes the resident's request.
    console.error('[W37] model response parse failed', {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      responseLength: raw.length,
    })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
  const o = parsed as Record<string, unknown>
  const { mode, retrieved, facts } = opts
  const resident = mode === 'precheck'
  const clean = (s: string | null) => (s && resident ? stripVerdicts(s) || null : s)

  const confidence = o.confidence === 'HIGH' || o.confidence === 'MEDIUM' ? o.confidence : 'LOW'
  if (confidence === 'LOW') return refusal(mode, facts)

  const byId = new Map(retrieved.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const rules: ArcRule[] = []
  for (const item of Array.isArray(o.rules) ? o.rules : []) {
    const r = obj(item)
    const id = typeof r.chunk_id === 'string' ? r.chunk_id : ''
    const chunk = byId.get(id)
    if (!chunk || seen.has(id)) continue
    const point = clean(text(r.point, 400))
    if (!point) continue
    seen.add(id)
    const status = (ARC_RULE_STATUSES as readonly string[]).includes(r.status as string) ? (r.status as ArcRuleStatus) : 'unclear'
    rules.push({ chunkId: chunk.id, documentId: chunk.documentId, docType: chunk.docType, section: chunk.section, point, status })
    if (rules.length >= MAX_RULES) break
  }
  if (rules.length === 0) return refusal(mode, facts)

  const questions = (Array.isArray(o.questions) ? o.questions : [])
    .map((q) => clean(text(q, 300)))
    .filter((q): q is string => q !== null)
    .slice(0, MAX_QUESTIONS)

  const warnings: string[] = []
  let suggestion: ArcSuggestion | null = null
  if (!resident) {
    const s = obj(o.suggestion)
    let decision: ArcSuggestedDecision = (ARC_DECISIONS as readonly string[]).includes(s.decision as string)
      ? (s.decision as ArcSuggestedDecision)
      : 'need_more_info'
    const conditions = (Array.isArray(s.conditions) ? s.conditions : [])
      .map((c) => text(c, 300))
      .filter((c): c is string => c !== null)
      .slice(0, MAX_CONDITIONS)
    if (decision === 'deny' && !rules.some((r) => r.status === 'possible_conflict')) {
      decision = 'need_more_info'
      warnings.push('The AI leaned toward denial but cited no conflicting rule, so this is shown as Need more info.')
    }
    if (decision === 'approve_with_conditions' && conditions.length === 0) decision = 'approve'
    suggestion = {
      decision,
      reasoning: text(s.reasoning, 1200) ?? 'The AI gave no reasoning for this suggestion.',
      conditions: decision === 'approve_with_conditions' ? conditions : [],
    }
  }

  return {
    mode,
    status: 'answered',
    summary: clean(text(o.summary, 800)) ?? (resident ? 'These rules in your community’s documents likely apply.' : 'These rules likely apply.'),
    confidence,
    rules,
    questions,
    missingInfo: detectMissingInfo(facts),
    suggestion,
    warnings,
    photoFindings: [],
    disclaimer: resident ? ARC_PRECHECK_DISCLAIMER : ARC_REVIEW_DISCLAIMER,
  }
}

const CONFIDENCE_SCORE = { HIGH: 0.9, MEDIUM: 0.7, LOW: 0.3 } as const

// ─── Input ───────────────────────────────────────────────────────────

export const ArcReviewInputSchema = z
  .object({
    mode: z.enum(['precheck', 'review']),
    facts: ArcFactsSchema,
    associationId: z.string().uuid().nullable().optional(),
    /** Resident callers: the resident-visible governing doc types (F-04). */
    allowedDocTypes: z.array(z.string().max(50)).max(20).optional(),
    /** Review mode: the arc_requests row this draft belongs to. */
    arcRequestId: z.string().uuid().optional(),
    /** Review mode: the resident's pre-check run, when they ran one. */
    precheckRunId: z.string().uuid().nullable().optional(),
    /** Review mode (BL-079): the attached photos to read, by id and label. The bytes travel out of band. */
    photos: z.array(ArcPhotoRefSchema).max(5).optional(),
    /** Review mode: image attachments left unread (over the limit, too large, or a format the model can't open). */
    photosSkipped: z.number().int().min(0).max(1000).optional(),
  })
  .refine((i) => i.mode !== 'review' || !!i.arcRequestId, { message: 'review needs arcRequestId' })
export type ArcReviewInput = z.infer<typeof ArcReviewInputSchema>

/** What retrieval is asked: the kind of change, then the request itself. */
export function retrievalQueryFor(f: ArcFacts): string {
  return `${ARC_CATEGORY_LABEL[f.category]}: ${f.summary}. ${f.scopeDescription}`.slice(0, 700)
}

// ─── Seams ───────────────────────────────────────────────────────────

export interface ArcReviewModel {
  complete(system: string, user: string): Promise<{ content: string; model?: string; tokensIn?: number; tokensOut?: number }>
  /** BL-079: read the attached photos (data URLs) in one call. Optional — a model without it reads no photos. */
  vision?(question: string, imageDataUrls: string[]): Promise<{ content: string; model?: string }>
}

export type ArcRetrieve = (question: string, opts: RetrieveOptions) => Promise<RetrievedChunk[]>

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({ baseURL: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY ?? 'local' })
  return _client
}

/** The live model: packages/ai's resolver picks the id. */
export const liveArcReviewModel: ArcReviewModel = {
  async complete(system, user) {
    const completion = await getClient().chat.completions.create({
      model: resolveModel(),
      temperature: 0.1, // grounded — keep it tight
      max_completion_tokens: 2000,
      response_format: { type: 'json_object' },
      ...JSON_MODE_PARAMS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    return {
      content: completion.choices[0]?.message?.content ?? '',
      model: completion.model,
      tokensIn: completion.usage?.prompt_tokens ?? 0,
      tokensOut: completion.usage?.completion_tokens ?? 0,
    }
  },
  async vision(question, imageDataUrls) {
    const content = await analyzeImages({ imageUrls: imageDataUrls, question, max_tokens: arcPhotoMaxTokens(imageDataUrls.length) })
    return { content, model: resolveVisionModel() }
  },
}

export const ARC_PHOTOS_UNREAD_WARNING =
  'The AI couldn’t read the photos this time, so the suggestion rests on the written description only. Open the photos under Documents.'

function skippedWarning(n: number): string {
  return n === 1
    ? '1 more attachment wasn’t read by the AI (over the photo limit, too large, or not a photo). Open it under Documents.'
    : `${n} more attachments weren’t read by the AI (over the photo limit, too large, or not photos). Open them under Documents.`
}

/**
 * Read the photos once. Never throws and never logs the reply or the error
 * message (either can describe the home): a failure is a warning.
 */
async function readPhotos(
  input: ArcReviewInput,
  retrieved: RetrievedChunk[],
  model: ArcReviewModel,
  images: string[],
): Promise<{ findings: ArcPhotoFinding[]; warnings: string[] }> {
  const photos = input.photos ?? []
  const warnings: string[] = []
  if (input.photosSkipped) warnings.push(skippedWarning(input.photosSkipped))
  if (photos.length === 0 || !model.vision) return { findings: [], warnings }
  if (images.length !== photos.length) {
    console.error('[W37] photo references and images do not line up', { refs: photos.length, images: images.length })
    return { findings: [], warnings: [ARC_PHOTOS_UNREAD_WARNING, ...warnings] }
  }
  try {
    const r = await model.vision(arcPhotoQuestion(ARC_CATEGORY_LABEL[input.facts.category], retrieved), images)
    return { findings: processArcPhotoFindings(r.content, photos), warnings }
  } catch (err) {
    console.error('[W37] photo reading failed', { errorName: err instanceof Error ? err.name : 'UnknownError', images: images.length })
    return { findings: [], warnings: [ARC_PHOTOS_UNREAD_WARNING, ...warnings] }
  }
}

// ─── Run body ────────────────────────────────────────────────────────

/**
 * The workflow body, exported so it can be tested with a fake model, a fake
 * retrieval and a fake api (defineWorkflow closes over it otherwise).
 */
export async function runArcReview(
  input: ArcReviewInput,
  api: WorkflowExecuteApi,
  ctx: { organizationId: string },
  deps: { model: ArcReviewModel; retrieve: ArcRetrieve },
  /** Review mode: data URLs, in the same order as input.photos. Never part of the input. */
  images: string[] = [],
): Promise<ArcReviewOutput> {
  // A board draft is a proposal: it waits for a board member's decision.
  if (input.mode === 'review') api.requireHumanApproval()

  const retrieved = await deps.retrieve(retrievalQueryFor(input.facts), {
    organizationId: ctx.organizationId,
    associationId: input.associationId ?? null,
    limit: 8,
    allowedDocTypes: input.allowedDocTypes,
  })
  if (retrieved.length === 0) {
    api.setConfidence(0)
    return arcReviewRefusal(input.mode, input.facts)
  }
  api.addCitations(retrieved.map((c) => c.id))

  // Board review only: the resident's pre-check never reads photos.
  const photos =
    input.mode === 'review' ? await readPhotos(input, retrieved, deps.model, images) : { findings: [], warnings: [] }

  const system = input.mode === 'review' ? REVIEW_SYSTEM_PROMPT : PRECHECK_SYSTEM_PROMPT
  const r = await deps.model.complete(
    system,
    userPromptFor(
      {
        categoryLabel: ARC_CATEGORY_LABEL[input.facts.category],
        summary: input.facts.summary,
        scopeDescription: input.facts.scopeDescription,
        hasStartDate: input.facts.hasStartDate,
        hasCompletionDate: input.facts.hasCompletionDate,
        hasContractor: input.facts.hasContractor,
        hasContractorLicense: input.facts.hasContractorLicense,
      },
      retrieved,
      photos.findings,
    ),
  )
  if (r.model) api.setModel(r.model)
  api.setTokens(r.tokensIn ?? 0, r.tokensOut ?? 0)

  const out = {
    ...processArcReviewResponse(r.content, { mode: input.mode, retrieved, facts: input.facts }),
    photoFindings: photos.findings,
  }
  out.warnings = [...out.warnings, ...photos.warnings]
  api.setConfidence(out.status === 'no_rules' ? 0 : CONFIDENCE_SCORE[out.confidence])
  if (out.suggestion) api.setReasoning(out.suggestion.reasoning)
  return out
}

function arcReviewWorkflow(deps: { model: ArcReviewModel; retrieve: ArcRetrieve }, images: string[]) {
  return defineWorkflow({
    id: W37_WORKFLOW_ID,
    name: 'ARC Review',
    version: '1.0.0',
    promptVersion: PROMPT_VERSION,
    model: resolveModel(),
    // Review mode asks for approval routing itself (runArcReview).
    humanApprovalRequired: false,
    inputSchema: ArcReviewInputSchema,
    outputSchema: ArcReviewOutputSchema,
    run: (input, api, ctx) => runArcReview(input, api, ctx, deps, images),
  })
}

/**
 * Public entry. The CALLER gates (resident on their own request, or
 * board/admin) before this: retrieval and the audit row use the service role.
 */
export async function reviewArcRequest(
  input: ArcReviewInput,
  ctx: { organizationId: string; model?: ArcReviewModel; retrieve?: ArcRetrieve; images?: string[] },
): Promise<ArcReviewOutput & { runId: string }> {
  const wf = arcReviewWorkflow({ model: ctx.model ?? liveArcReviewModel, retrieve: ctx.retrieve ?? retrieveChunks }, ctx.images ?? [])
  const result = await wf.execute(input, { organizationId: ctx.organizationId })
  return { ...result.output, runId: result.runId }
}
