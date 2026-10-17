// W36 — AP Bill Scan (BL-021)
//
// Reads a vendor bill a board member uploaded and returns what it STATES:
// vendor, invoice number, dates, line items, total, plus a suggested
// expense account from the association's own chart. Every field carries a
// confidence, and a field the bill does not state comes back null — never
// a plausible guess. A wrong amount or vendor on a payable is a real money
// error, so nothing here writes accounting: the caller turns this into a
// `w36.ap_bill` proposal on the approval layer (approval_requests), and the
// bill is only entered when a board member approves it.
//
// Two model paths, both picked by packages/ai's resolvers — no model id is
// named here:
//   pdf_text  a PDF with a text layer → the text model (resolveModel), JSON mode
//   image     a photo/scan of the bill → the vision model (analyzeImages /
//             resolveVisionModel). The image is passed out-of-band, NOT in
//             the workflow input, so ai_runs.input never holds the bytes.
//
// Code, not the prompt, enforces everything that matters for money:
// processBillScanResponse drops impossible dates and totals, refuses an
// account that was not offered, and downgrades the total when the line
// items do not add up to it.

import { z } from 'zod'
import OpenAI from 'openai'
import {
  analyzeImages,
  defineWorkflow,
  JSON_MODE_PARAMS,
  resolveModel,
  resolveVisionModel,
  type WorkflowExecuteApi,
} from '@homeowner-portal/ai'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor, visionQuestionFor } from './prompt'

/** The approval_requests.action_type a bill proposal carries. */
export const W36_AP_BILL = 'w36.ap_bill'

/** Matches enterBill's own ceiling (lib/invoices.ts). */
export const MAX_BILL_AMOUNT = 1_000_000

export const MAX_LINE_ITEMS = 50

/** Characters of PDF text handed to the model. A bill is a page or two. */
export const MAX_BILL_TEXT_CHARS = 20_000

// ─── Schemas ─────────────────────────────────────────────────────────

export const BillScanInputSchema = z.object({
  source: z.enum(['pdf_text', 'image']),
  /** pdf-parse output, already truncated. Null on the image path. */
  documentText: z.string().max(MAX_BILL_TEXT_CHARS + 100).nullable(),
  /** Identifies the file in the audit row without storing it. */
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  contentType: z.string().max(100),
  expenseAccounts: z
    .array(z.object({ accountNumber: z.string().max(40), accountName: z.string().max(200) }))
    .max(200),
})
export type BillScanInput = z.infer<typeof BillScanInputSchema>

const Confidence = z.enum(['high', 'medium', 'low'])
export type FieldConfidence = z.infer<typeof Confidence>

const field = <T extends z.ZodTypeAny>(value: T) => z.object({ value: value.nullable(), confidence: Confidence })

export const BillScanOutputSchema = z.object({
  vendorName: field(z.string()),
  invoiceNumber: field(z.string()),
  invoiceDate: field(z.string()),
  dueDate: field(z.string()),
  total: field(z.number()),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number().nullable() })).max(MAX_LINE_ITEMS),
  expenseAccount: z.object({
    accountNumber: z.string().nullable(),
    reasoning: z.string().nullable(),
    confidence: Confidence,
  }),
  warnings: z.array(z.string()),
})
export type BillScanOutput = z.infer<typeof BillScanOutputSchema>

export interface Extracted<T> {
  value: T | null
  confidence: FieldConfidence
}

// ─── Pure response processing ────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function conf(v: unknown): FieldConfidence {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'low'
}

/** A missing value is always low — there is nothing to be confident in. */
function extracted<T>(value: T | null, confidence: unknown): Extracted<T> {
  return value === null ? { value: null, confidence: 'low' } : { value, confidence: conf(confidence) }
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/** A real calendar date in YYYY-MM-DD, or null. */
function dateOnly(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

/** Dollars to cents-rounded dollars; accepts "$1,234.50". */
function money(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string' && /^\s*\$?\s*-?[\d,]+(\.\d+)?\s*$/.test(v)) n = Number(v.replace(/[$,\s]/g, ''))
  else return null
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function usd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function stripFence(raw: string): string {
  const m = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return m ? m[1]! : raw.trim()
}

/**
 * Parse and normalize the model's raw reply. Exported for the unit suite
 * (the root vitest harness is pure-only) and the eval set.
 */
export function processBillScanResponse(raw: string, opts: { accountNumbers: string[] }): BillScanOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(raw))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
  } catch (err) {
    // Never log `raw` or err.message: a SyntaxError embeds a prefix of the
    // bill, which can carry an address or an account number.
    console.error('[W36] model response parse failed', {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      responseLength: raw.length,
    })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
  const o = parsed as Record<string, unknown>
  const warnings: string[] = []

  const vendorName = extracted(text(obj(o.vendorName).value, 200), obj(o.vendorName).confidence)
  // 120 = enterBill's invoiceNumber max.
  const invoiceNumber = extracted(text(obj(o.invoiceNumber).value, 120), obj(o.invoiceNumber).confidence)
  const invoiceDate = extracted(dateOnly(obj(o.invoiceDate).value), obj(o.invoiceDate).confidence)
  let dueDate = extracted(dateOnly(obj(o.dueDate).value), obj(o.dueDate).confidence)
  if (dueDate.value && invoiceDate.value && dueDate.value < invoiceDate.value) {
    dueDate = { value: dueDate.value, confidence: 'low' }
    warnings.push('The due date is before the invoice date — check both against the bill.')
  }

  const rawTotal = money(obj(o.total).value)
  let total = extracted(rawTotal !== null && rawTotal > 0 && rawTotal <= MAX_BILL_AMOUNT ? rawTotal : null, obj(o.total).confidence)

  const lineItems = (Array.isArray(o.lineItems) ? o.lineItems : [])
    .slice(0, MAX_LINE_ITEMS)
    .map((li) => ({ description: text(obj(li).description, 300), amount: money(obj(li).amount) }))
    .filter((li): li is { description: string; amount: number | null } => li.description !== null)

  const priced = lineItems.filter((li) => li.amount !== null)
  if (total.value !== null && priced.length > 0 && priced.length === lineItems.length) {
    const sum = Math.round(priced.reduce((n, li) => n + (li.amount ?? 0), 0) * 100) / 100
    const stated = total.value
    if (Math.abs(sum - stated) > 0.01) {
      total = { value: stated, confidence: 'low' }
      warnings.push(`The line items add up to ${usd(sum)}, not the ${usd(stated)} total — check the total against the bill.`)
    }
  }

  const ea = obj(o.expenseAccount)
  const suggested = text(ea.accountNumber, 40)
  let expenseAccount: BillScanOutput['expenseAccount']
  if (suggested && opts.accountNumbers.includes(suggested)) {
    expenseAccount = { accountNumber: suggested, reasoning: text(ea.reasoning, 500), confidence: conf(ea.confidence) }
  } else {
    if (suggested) warnings.push('The AI suggested an expense account that is not in the chart of accounts, so none is suggested.')
    expenseAccount = { accountNumber: null, reasoning: null, confidence: 'low' }
  }

  return BillScanOutputSchema.parse({ vendorName, invoiceNumber, invoiceDate, dueDate, total, lineItems, expenseAccount, warnings })
}

const SCORE: Record<FieldConfidence, number> = { high: 0.9, medium: 0.6, low: 0.2 }

/** The run's confidence: its weakest field among the ones a bill needs. */
export function overallConfidence(out: BillScanOutput): number {
  return Math.min(
    ...[out.vendorName, out.invoiceNumber, out.invoiceDate, out.total].map((f) => SCORE[f.value === null ? 'low' : f.confidence]),
  )
}

// ─── Model seam ──────────────────────────────────────────────────────

export interface BillScanModel {
  text(system: string, user: string): Promise<{ content: string; model?: string; tokensIn?: number; tokensOut?: number }>
  vision(question: string, imageDataUrls: string[]): Promise<{ content: string; model?: string }>
}

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({ baseURL: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY ?? 'local' })
  return _client
}

/** The live model: packages/ai's resolvers pick both ids. */
export const liveBillScanModel: BillScanModel = {
  async text(system, user) {
    const completion = await getClient().chat.completions.create({
      model: resolveModel(),
      // Extraction, not composition: any creativity is invention.
      temperature: 0,
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
    // Output bills at 5x input on the vision model; line items need room,
    // but no more than this.
    const content = await analyzeImages({ imageUrls: imageDataUrls, question, max_tokens: 1200 })
    return { content, model: resolveVisionModel() }
  },
}

/**
 * The workflow body, exported so it can be tested with a fake model and a
 * fake api (defineWorkflow closes over it otherwise).
 */
export async function runBillScan(
  input: BillScanInput,
  api: WorkflowExecuteApi,
  model: BillScanModel,
  imageDataUrl: string | null,
): Promise<BillScanOutput> {
  // Every bill scan is a proposal — the bill is entered only on approval.
  api.requireHumanApproval()
  let raw: string
  if (input.source === 'image') {
    if (!imageDataUrl) throw new Error('W36 image scan without an image')
    const r = await model.vision(visionQuestionFor(input.expenseAccounts), [imageDataUrl])
    raw = r.content
    if (r.model) api.setModel(r.model)
  } else {
    if (!input.documentText?.trim()) throw new Error('W36 text scan without text')
    const r = await model.text(SYSTEM_PROMPT, userPromptFor(input.documentText, input.expenseAccounts))
    raw = r.content
    if (r.model) api.setModel(r.model)
    api.setTokens(r.tokensIn ?? 0, r.tokensOut ?? 0)
  }
  const out = processBillScanResponse(raw, { accountNumbers: input.expenseAccounts.map((a) => a.accountNumber) })
  api.setConfidence(overallConfidence(out))
  if (out.expenseAccount.reasoning) api.setReasoning(out.expenseAccount.reasoning)
  return out
}

function billScanWorkflow(model: BillScanModel, imageDataUrl: string | null, source: BillScanInput['source']) {
  return defineWorkflow({
    id: 'W36',
    name: 'AP Bill Scan',
    version: '1.0.0',
    promptVersion: PROMPT_VERSION,
    model: source === 'image' ? resolveVisionModel() : resolveModel(),
    humanApprovalRequired: true,
    inputSchema: BillScanInputSchema,
    outputSchema: BillScanOutputSchema,
    run: (input, api) => runBillScan(input, api, model, imageDataUrl),
  })
}

/**
 * Public entry. The CALLER gates (board/admin) before this: the audit row
 * is written with the service role.
 */
export async function scanBill(
  input: BillScanInput,
  ctx: { organizationId: string; imageDataUrl?: string | null; model?: BillScanModel },
): Promise<BillScanOutput & { runId: string }> {
  const wf = billScanWorkflow(ctx.model ?? liveBillScanModel, ctx.imageDataUrl ?? null, input.source)
  const result = await wf.execute(input, { organizationId: ctx.organizationId })
  return { ...result.output, runId: result.runId }
}
