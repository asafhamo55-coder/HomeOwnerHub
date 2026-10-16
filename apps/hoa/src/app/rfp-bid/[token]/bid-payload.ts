// Client-side twin of the /api/rfp-bid/[token]/submit schema (RC-12): the
// form refuses what the route would refuse, with a message that names the
// field, before it sends anything. The route stays the authority; this only
// keeps a real vendor from getting a bare "Some fields are missing or
// invalid." Pure, so it is unit-tested without a browser.

import { MAX_ARRAY_ITEMS, MAX_LONG_TEXT, MAX_SHORT_TEXT } from '@/lib/api/limits'

/** Same caps as the route. */
export const BID_MAX_DOLLARS = 1_000_000_000
export const BID_MAX_QUANTITY = 1_000_000
export const BID_MAX_LINES = MAX_ARRAY_ITEMS
export const BID_SHORT_TEXT = MAX_SHORT_TEXT
export const BID_LONG_TEXT = MAX_LONG_TEXT

export interface BidLineDraft {
  description: string
  quantity: string
  unitPrice: string
  notes: string
}

export interface BidFormInput {
  totalAmount: string
  paymentTerms: string
  warranty: string
  startDate: string
  completionDate: string
  lines: BidLineDraft[]
}

export interface BidPayload {
  total_amount: number
  payment_terms: string | null
  warranty: string | null
  start_date: string | null
  completion_date: string | null
  line_items: Array<{
    description: string
    quantity: number | null
    unit_price: number | null
    notes: string | null
  }>
}

type Parsed = { ok: true; value: number } | { ok: false; problem: string }

/** Lenient about symbols ("$", ",") exactly as before; strict about decimals and size. */
export function parseMoney(raw: string, label: string): Parsed {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return { ok: false, problem: `${label} must be a number.` }
  const decimals = cleaned.includes('.') ? cleaned.split('.')[1]!.length : 0
  if (decimals > 2) return { ok: false, problem: `${label} can have at most two decimal places.` }
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return { ok: false, problem: `${label} must be a number.` }
  if (value > BID_MAX_DOLLARS) return { ok: false, problem: `${label} is too large.` }
  return { ok: true, value }
}

function parseQuantity(raw: string, label: string): Parsed {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return { ok: false, problem: `${label} must be a number.` }
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return { ok: false, problem: `${label} must be a number.` }
  if (value > BID_MAX_QUANTITY) return { ok: false, problem: `${label} is too large.` }
  return { ok: true, value }
}

function tooLong(value: string, max: number, label: string): string | null {
  return value.length > max ? `${label} must be ${max.toLocaleString('en-US')} characters or fewer.` : null
}

/**
 * Build the payload, or the list of problems to show. `lineIndex[i]` is the
 * on-screen line (0-based) behind payload line i — blank lines are dropped,
 * so a server issue path like `line_items.2.unit_price` maps back through it.
 */
export function buildBidPayload(
  input: BidFormInput,
): { ok: true; payload: BidPayload; lineIndex: number[] } | { ok: false; problems: string[] } {
  const problems: string[] = []

  let totalAmount = 0
  const totalRaw = input.totalAmount.trim()
  if (!totalRaw) {
    problems.push('Total bid amount is required and must be greater than zero.')
  } else {
    const t = parseMoney(totalRaw, 'Total bid amount')
    if (!t.ok) problems.push(t.problem)
    else if (t.value <= 0) problems.push('Total bid amount is required and must be greater than zero.')
    else totalAmount = t.value
  }

  const paymentTerms = input.paymentTerms.trim()
  const warranty = input.warranty.trim()
  for (const p of [
    tooLong(paymentTerms, BID_SHORT_TEXT, 'Payment terms'),
    tooLong(warranty, BID_SHORT_TEXT, 'Warranty'),
  ]) {
    if (p) problems.push(p)
  }

  const lineItems: BidPayload['line_items'] = []
  const lineIndex: number[] = []
  input.lines.forEach((l, i) => {
    const description = l.description.trim()
    if (!description) return
    const n = `Line item ${i + 1}`
    const d = tooLong(description, BID_SHORT_TEXT, `${n} description`)
    if (d) problems.push(d)
    const notes = l.notes.trim()
    const nt = tooLong(notes, BID_LONG_TEXT, `${n} notes`)
    if (nt) problems.push(nt)

    let quantity: number | null = null
    if (l.quantity.trim()) {
      const q = parseQuantity(l.quantity.trim(), `${n} quantity`)
      if (q.ok) quantity = q.value
      else problems.push(q.problem)
    }
    let unitPrice: number | null = null
    if (l.unitPrice.trim()) {
      const u = parseMoney(l.unitPrice.trim(), `${n} unit price`)
      if (u.ok) unitPrice = u.value
      else problems.push(u.problem)
    }
    if (quantity != null && unitPrice != null && quantity * unitPrice > BID_MAX_DOLLARS) {
      problems.push(`${n} total is too large.`)
    }
    lineItems.push({ description, quantity, unit_price: unitPrice, notes: notes || null })
    lineIndex.push(i)
  })
  if (lineItems.length > BID_MAX_LINES) problems.push(`Use at most ${BID_MAX_LINES} line items.`)

  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    lineIndex,
    payload: {
      total_amount: totalAmount,
      payment_terms: paymentTerms || null,
      warranty: warranty || null,
      start_date: input.startDate.trim() || null,
      completion_date: input.completionDate.trim() || null,
      line_items: lineItems,
    },
  }
}

const FIELD_LABELS: Record<string, string> = {
  total_amount: 'Total bid amount',
  payment_terms: 'Payment terms',
  warranty: 'Warranty',
  start_date: 'Earliest start date',
  completion_date: 'Estimated completion',
  line_items: 'Line items',
  description: 'description',
  quantity: 'quantity',
  unit_price: 'unit price',
  notes: 'notes',
  payload: 'Bid',
}

/**
 * Turn a 400 validation_failed envelope's `issues` into lines a vendor can
 * act on ("Line item 3 unit price: Use at most two decimal places.").
 * Returns [] for any other body.
 */
export function describeIssues(body: unknown, lineIndex: number[] = []): string[] {
  const issues = (body as { error?: { issues?: unknown } } | null)?.error?.issues
  if (!Array.isArray(issues)) return []
  const out: string[] = []
  for (const raw of issues.slice(0, 10)) {
    if (!raw || typeof raw !== 'object') continue
    const { path, message } = raw as { path?: unknown; message?: unknown }
    if (typeof path !== 'string' || typeof message !== 'string') continue
    const parts = path.split('.')
    let label: string
    if (parts[0] === 'line_items' && parts.length >= 2 && /^\d+$/.test(parts[1]!)) {
      const i = Number(parts[1])
      const shown = (lineIndex[i] ?? i) + 1
      label = `Line item ${shown}${parts[2] ? ` ${FIELD_LABELS[parts[2]] ?? parts[2]}` : ''}`
    } else {
      label = FIELD_LABELS[parts[0] ?? ''] ?? 'Bid'
    }
    out.push(`${label}: ${message}`)
  }
  return out
}
