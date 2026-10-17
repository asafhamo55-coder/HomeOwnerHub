// BL-021 — turning a W36 bill scan into a `w36.ap_bill` approval proposal,
// and back into enterBill's input when a board member approves it.
//
// Pure: zod plus type-only imports, so the approvals inbox model (which a
// client component imports) and tests/integration can load it.
//
// The rule throughout: a field the AI could not read, or a vendor it could
// not match, stays EMPTY and is listed as missing. Nothing is defaulted.
// Fields it read with less than high confidence are listed as needing a
// check, and the /approvals card says so next to the value.

import { z } from 'zod'
import type { BillScanOutput } from '@homeowner-portal/workflows'

export const BILL_ACTION = 'w36.ap_bill'

export interface VendorCandidate {
  id: string
  legalName: string
  dba: string | null
}

export interface AccountCandidate {
  id: string
  accountNumber: string
  accountName: string
}

/** BL-059: the fields a board member can correct on /approvals. */
export const BILL_EDITABLE_FIELDS = ['vendor', 'invoiceNumber', 'invoiceDate', 'dueDate', 'total', 'expenseAccount', 'lineItems'] as const
export type BillEditableField = (typeof BILL_EDITABLE_FIELDS)[number]

const Confidence = z.enum(['high', 'medium', 'low'])
type Confidence = z.infer<typeof Confidence>

const Str = z.string().max(500)
const field = <T extends z.ZodTypeAny>(v: T) => z.object({ value: v.nullable(), confidence: Confidence })

const BillPayloadSchema = z.object({
  kind: z.literal(BILL_ACTION),
  version: z.literal(1),
  associationId: z.string().uuid(),
  aiRunId: Str.nullable(),
  storagePath: Str.nullable(),
  contentType: Str,
  source: z.enum(['pdf_text', 'image']),
  vendor: z.object({
    extractedName: Str.nullable(),
    nameConfidence: Confidence,
    vendorId: z.string().uuid().nullable(),
    vendorLabel: Str.nullable(),
    /** 'manual': a board member picked the vendor (BL-059). */
    match: z.enum(['exact', 'close', 'ambiguous', 'none', 'manual']),
    matchConfidence: Confidence,
  }),
  invoiceNumber: field(Str),
  invoiceDate: field(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: field(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  total: field(z.number().positive()),
  lineItems: z.array(z.object({ description: Str, amount: z.number().nullable() })).max(50),
  expenseAccount: z.object({
    accountId: z.string().uuid().nullable(),
    label: Str.nullable(),
    reasoning: Str.nullable(),
    confidence: Confidence,
  }),
  warnings: z.array(Str).max(20),
  /**
   * BL-059: the fields a board member corrected before approving, who did
   * it last and when. Absent until the first edit. The AI's own reading
   * stays on the ai_runs row (output), so nothing is lost by editing.
   */
  humanEdits: z
    .object({
      fields: z.array(z.enum(BILL_EDITABLE_FIELDS)).max(BILL_EDITABLE_FIELDS.length),
      editedBy: z.string().uuid(),
      editedAt: z.string().max(40),
    })
    .optional(),
})

export type BillProposalPayload = z.infer<typeof BillPayloadSchema>

/** The stored payload, or null if it is not a v1 bill proposal. */
export function readBillPayload(json: unknown): BillProposalPayload | null {
  const r = BillPayloadSchema.safeParse(json)
  return r.success ? r.data : null
}

// ─── vendor matching ─────────────────────────────────────────────────

const SUFFIXES = new Set(['llc', 'l', 'inc', 'incorporated', 'co', 'company', 'corp', 'corporation', 'ltd', 'pllc', 'pa', 'the'])

export function normalizeVendorName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
    .join(' ')
}

export interface VendorMatch {
  vendorId: string | null
  vendorLabel: string | null
  method: 'exact' | 'close' | 'ambiguous' | 'none'
  confidence: Confidence
  /** For an ambiguous match: who it could be. */
  candidates: Array<{ id: string; label: string }>
}

export function vendorLabel(v: VendorCandidate): string {
  return v.legalName + (v.dba ? ` (d/b/a ${v.dba})` : '')
}

function containsWords(hay: string, needle: string): boolean {
  return needle.length >= 6 && ` ${hay} `.includes(` ${needle} `)
}

/**
 * Match the name printed on the bill to a vendor on file. Exact (after
 * normalizing case, punctuation and company suffixes) on the legal name or
 * d/b/a is high confidence. One vendor whose name contains the other's (or
 * vice versa) is a medium-confidence "close" match. Two or more candidates
 * at the best level is ambiguous and picks no one.
 */
export function matchVendor(name: string | null, vendors: VendorCandidate[]): VendorMatch {
  const none: VendorMatch = { vendorId: null, vendorLabel: null, method: 'none', confidence: 'low', candidates: [] }
  const n = name ? normalizeVendorName(name) : ''
  if (!n) return none
  const names = (v: VendorCandidate) => [v.legalName, v.dba].filter((x): x is string => !!x).map(normalizeVendorName)

  const pick = (hits: VendorCandidate[], method: 'exact' | 'close', confidence: Confidence): VendorMatch | null => {
    if (hits.length === 1) return { vendorId: hits[0]!.id, vendorLabel: vendorLabel(hits[0]!), method, confidence, candidates: [] }
    if (hits.length > 1) {
      return { ...none, method: 'ambiguous', candidates: hits.slice(0, 5).map((v) => ({ id: v.id, label: vendorLabel(v) })) }
    }
    return null
  }

  return (
    pick(vendors.filter((v) => names(v).includes(n)), 'exact', 'high') ??
    pick(vendors.filter((v) => names(v).some((x) => containsWords(x, n) || containsWords(n, x))), 'close', 'medium') ??
    none
  )
}

// ─── proposal ────────────────────────────────────────────────────────

export interface BuildContext {
  associationId: string
  storagePath: string | null
  contentType: string
  source: 'pdf_text' | 'image'
  vendors: VendorCandidate[]
  accounts: AccountCandidate[]
}

export interface BillProposal {
  payload: BillProposalPayload
  summary: string
  amount: number | null
}

export function buildBillProposal(scan: BillScanOutput & { runId: string }, ctx: BuildContext): BillProposal {
  const match = matchVendor(scan.vendorName.value, ctx.vendors)
  const account = scan.expenseAccount.accountNumber
    ? (ctx.accounts.find((a) => a.accountNumber === scan.expenseAccount.accountNumber) ?? null)
    : null
  const warnings = [...scan.warnings]
  if (match.method === 'ambiguous') {
    warnings.push(`More than one vendor on file matches "${scan.vendorName.value}", so none was picked.`)
  }

  const payload: BillProposalPayload = {
    kind: BILL_ACTION,
    version: 1,
    associationId: ctx.associationId,
    aiRunId: scan.runId,
    storagePath: ctx.storagePath,
    contentType: ctx.contentType,
    source: ctx.source,
    vendor: {
      extractedName: scan.vendorName.value,
      nameConfidence: scan.vendorName.confidence,
      vendorId: match.vendorId,
      vendorLabel: match.vendorLabel,
      match: match.method,
      matchConfidence: match.confidence,
    },
    invoiceNumber: scan.invoiceNumber,
    invoiceDate: scan.invoiceDate,
    dueDate: scan.dueDate,
    total: scan.total,
    lineItems: scan.lineItems,
    expenseAccount: account
      ? {
          accountId: account.id,
          label: `${account.accountNumber} — ${account.accountName}`,
          reasoning: scan.expenseAccount.reasoning,
          confidence: scan.expenseAccount.confidence,
        }
      : { accountId: null, label: null, reasoning: null, confidence: 'low' },
    warnings: warnings.slice(0, 20),
  }

  return { payload, summary: billSummary(payload), amount: scan.total.value }
}

/** The approval row's one-line summary, from the payload (recomputed after an edit). */
export function billSummary(p: BillProposalPayload): string {
  const who = p.vendor.vendorLabel ?? (p.vendor.extractedName ? `${p.vendor.extractedName} (not on file)` : 'an unknown vendor')
  return `Bill from ${who}${p.invoiceNumber.value ? ` · #${p.invoiceNumber.value}` : ''}`.slice(0, 300)
}

/** Required fields the proposal does not have — approve is refused until there are none. */
export function billMissing(p: BillProposalPayload): string[] {
  const missing: string[] = []
  if (!p.vendor.vendorId) missing.push('a vendor on file')
  if (!p.invoiceNumber.value) missing.push('the invoice number')
  if (!p.invoiceDate.value) missing.push('the invoice date')
  if (p.total.value === null) missing.push('the total')
  if (!p.expenseAccount.accountId) missing.push('an expense account')
  return missing
}

/** Fields that ARE filled but were read with less than high confidence. */
export function billNeedsCheck(p: BillProposalPayload): string[] {
  const out: string[] = []
  // A vendor a board member picked (BL-059) is not the AI's guess.
  if (p.vendor.vendorId && p.vendor.match !== 'manual' && (p.vendor.matchConfidence !== 'high' || p.vendor.nameConfidence !== 'high')) {
    out.push('vendor')
  }
  const fields: Array<[string, { value: unknown; confidence: Confidence }]> = [
    ['invoice number', p.invoiceNumber],
    ['invoice date', p.invoiceDate],
    ['due date', p.dueDate],
    ['total', p.total],
  ]
  for (const [name, f] of fields) if (f.value !== null && f.confidence !== 'high') out.push(name)
  if (p.expenseAccount.accountId && p.expenseAccount.confidence !== 'high') out.push('expense account')
  return out
}

function joinList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export interface EnterBillFromProposal {
  vendorId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string
  amount: number
  expenseAccountId: string
  aiRunId?: string
  rawDocumentPath?: string
}

/** enterBill's input from an approved proposal, or why it cannot be entered. */
export function enterBillInputFrom(
  p: BillProposalPayload,
): { ok: true; input: EnterBillFromProposal } | { ok: false; error: string } {
  const missing = billMissing(p)
  if (missing.length > 0) {
    return { ok: false, error: `This bill is missing ${joinList(missing)}. Enter it by hand instead.` }
  }
  return {
    ok: true,
    input: {
      vendorId: p.vendor.vendorId!,
      invoiceNumber: p.invoiceNumber.value!,
      invoiceDate: p.invoiceDate.value!,
      ...(p.dueDate.value ? { dueDate: p.dueDate.value } : {}),
      amount: p.total.value!,
      expenseAccountId: p.expenseAccount.accountId!,
      ...(p.aiRunId ? { aiRunId: p.aiRunId } : {}),
      ...(p.storagePath ? { rawDocumentPath: p.storagePath } : {}),
    },
  }
}

// ─── identity ────────────────────────────────────────────────────────

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return Array.from(await sha256(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The proposal's subject_id: a name-based (v5-shaped) uuid of the org and
 * the file's bytes. approval_requests allows one LIVE proposal per
 * (action_type, subject_id), so uploading the same bill twice finds the
 * first proposal instead of filing a second one — while a rejected one
 * frees the slot for a deliberate re-scan.
 */
export async function billSubjectId(orgId: string, bytes: Uint8Array): Promise<string> {
  const fileHash = await sha256Hex(bytes)
  const h = await sha256(new TextEncoder().encode(`${BILL_ACTION}:${orgId}:${fileHash}`))
  h[6] = (h[6]! & 0x0f) | 0x50
  h[8] = (h[8]! & 0x3f) | 0x80
  const hex = Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
