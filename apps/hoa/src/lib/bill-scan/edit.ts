// BL-059 — a board member corrects a scanned bill before approving it.
//
// Pure (zod + relative imports), so the approvals card, the server action
// and the unit suite share one copy of the rules. The corrected values are
// held to the same money rules W36 enforces on the model's reply
// (packages/workflows W36 processBillScanResponse), here in code:
//   * dates are real calendar dates, the invoice is not dated after the
//     association's today, and the due date is not before the invoice date;
//   * the total is positive integer cents, at most enterBill's ceiling;
//   * line items, when every one is priced, add up to an edited total;
//   * the vendor and the expense account are ones the association has
//     (the same lists the scan offered);
//   * a vendor + invoice number already entered is refused (saveBillEdit).
// An edited field is marked human-checked (confidence 'high') and named in
// payload.humanEdits; the edit is mirrored onto the W36 ai_runs row's
// human_edited_output. The AI's own reading stays in ai_runs.output.
//
// A field may be left empty: that keeps the bill reject-only (billMissing),
// exactly as an unread field does. Nothing is defaulted.

import { z } from 'zod'
import {
  BILL_ACTION,
  billMissing,
  billSummary,
  readBillPayload,
  vendorLabel,
  type AccountCandidate,
  type BillEditableField,
  type BillProposalPayload,
  type VendorCandidate,
} from './proposal'

/** enterBill's ceiling (lib/invoices.ts) and W36's MAX_BILL_AMOUNT, in cents. */
export const MAX_BILL_CENTS = 100_000_000
export const MAX_EDIT_LINE_ITEMS = 50

const Cents = z.number().int().min(-MAX_BILL_CENTS).max(MAX_BILL_CENTS)

export const BillEditSchema = z.object({
  approvalRequestId: z.string().uuid(),
  vendorId: z.string().uuid().nullable(),
  /** '' = the bill states none. */
  invoiceNumber: z.string().max(120),
  /** 'YYYY-MM-DD' or ''. Checked against the calendar in applyBillEdit. */
  invoiceDate: z.string().max(10),
  dueDate: z.string().max(10),
  totalCents: Cents.nullable(),
  expenseAccountId: z.string().uuid().nullable(),
  lineItems: z
    .array(z.object({ description: z.string().max(300), amountCents: Cents.nullable() }))
    .max(MAX_EDIT_LINE_ITEMS),
})
export type BillEditInput = z.infer<typeof BillEditSchema>
export type BillEditForm = Omit<BillEditInput, 'approvalRequestId'>
export type BillEditFieldKey = keyof BillEditForm

export interface BillEditContext {
  vendors: VendorCandidate[]
  accounts: AccountCandidate[]
  /** The association's today, 'YYYY-MM-DD'. */
  today: string
  editedBy: string
  editedAt: string
}

export type BillEditResult =
  | { ok: true; payload: BillProposalPayload; editedFields: BillEditableField[]; summary: string; amount: number | null }
  | { ok: false; error: string; fieldErrors: Partial<Record<BillEditFieldKey, string>> }

const toCents = (dollars: number) => Math.round(dollars * 100)
const toDollars = (cents: number) => cents / 100

/** The edit form's starting values: what the proposal holds now. */
export function editFormFrom(p: BillProposalPayload): BillEditForm {
  return {
    vendorId: p.vendor.vendorId,
    invoiceNumber: p.invoiceNumber.value ?? '',
    invoiceDate: p.invoiceDate.value ?? '',
    dueDate: p.dueDate.value ?? '',
    totalCents: p.total.value === null ? null : toCents(p.total.value),
    expenseAccountId: p.expenseAccount.accountId,
    lineItems: p.lineItems.map((li) => ({ description: li.description, amountCents: li.amount === null ? null : toCents(li.amount) })),
  }
}

/** A money box's text as cents: null when empty, 'invalid' when it isn't an amount to the cent. */
export function centsFromInput(text: string): number | null | 'invalid' {
  const t = text.replace(/[$,\s]/g, '')
  if (!t) return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return 'invalid'
  const cents = Math.round(Number(t) * 100)
  return Number.isSafeInteger(cents) ? cents : 'invalid'
}

export function centsToInput(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

function realDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** AI warnings an edit of these fields has answered (the prefixes W36 and buildBillProposal write). */
const ANSWERED_WARNINGS: Array<[BillEditableField[], string]> = [
  [['total', 'lineItems'], 'The line items add up to '],
  [['invoiceDate', 'dueDate'], 'The due date is before the invoice date'],
  [['vendor'], 'More than one vendor on file matches '],
  [['expenseAccount'], 'The AI suggested an expense account that is not in the chart'],
]

/**
 * Validate a corrected bill and build the payload to store. Pure: the
 * duplicate check needs the database and lives in saveBillEdit.
 */
export function applyBillEdit(p: BillProposalPayload, raw: BillEditInput, ctx: BillEditContext): BillEditResult {
  const errors: Partial<Record<BillEditFieldKey, string>> = {}
  const before = editFormFrom(p)

  const invoiceNumber = raw.invoiceNumber.replace(/\s+/g, ' ').trim()
  const lineItems = raw.lineItems.map((li) => ({ description: li.description.replace(/\s+/g, ' ').trim(), amountCents: li.amountCents }))

  const vendor = raw.vendorId ? ctx.vendors.find((v) => v.id === raw.vendorId) : null
  if (raw.vendorId && !vendor) errors.vendorId = 'Pick a vendor on file.'
  const account = raw.expenseAccountId ? ctx.accounts.find((a) => a.id === raw.expenseAccountId) : null
  if (raw.expenseAccountId && !account) errors.expenseAccountId = 'Pick one of the association’s expense accounts.'

  if (raw.invoiceDate) {
    if (!realDate(raw.invoiceDate)) errors.invoiceDate = 'Enter a real date.'
    else if (raw.invoiceDate > ctx.today) errors.invoiceDate = 'The invoice date can’t be after today.'
  }
  if (raw.dueDate) {
    if (!realDate(raw.dueDate)) errors.dueDate = 'Enter a real date.'
    else if (raw.invoiceDate && realDate(raw.invoiceDate) && raw.dueDate < raw.invoiceDate) {
      errors.dueDate = 'The due date can’t be before the invoice date.'
    }
  }

  if (raw.totalCents !== null && (raw.totalCents <= 0 || raw.totalCents > MAX_BILL_CENTS)) {
    errors.totalCents = raw.totalCents <= 0 ? 'Enter a total greater than $0.' : 'Totals over $1,000,000 need support to enter.'
  }

  if (lineItems.some((li) => !li.description)) errors.lineItems = 'Each line item needs a description.'

  const same = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)
  const changed: Record<BillEditableField, boolean> = {
    vendor: raw.vendorId !== before.vendorId,
    invoiceNumber: invoiceNumber !== before.invoiceNumber,
    invoiceDate: raw.invoiceDate !== before.invoiceDate,
    dueDate: raw.dueDate !== before.dueDate,
    total: raw.totalCents !== before.totalCents,
    expenseAccount: raw.expenseAccountId !== before.expenseAccountId,
    lineItems: !same(lineItems, before.lineItems),
  }

  // The line items must add up — checked when the human touched the money
  // (an untouched AI mismatch is already flagged low-confidence on the card).
  if (!errors.lineItems && !errors.totalCents && (changed.total || changed.lineItems) && raw.totalCents !== null) {
    const priced = lineItems.filter((li) => li.amountCents !== null)
    if (lineItems.length > 0 && priced.length === lineItems.length) {
      const sum = priced.reduce((n, li) => n + (li.amountCents ?? 0), 0)
      if (sum !== raw.totalCents) {
        errors.lineItems = `The line items add up to ${usd(sum)}, not the ${usd(raw.totalCents)} total.`
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, error: 'Fix the highlighted fields.', fieldErrors: errors }
  }

  const editedFields = (Object.keys(changed) as BillEditableField[]).filter((f) => changed[f])
  if (editedFields.length === 0) {
    return { ok: true, payload: p, editedFields, summary: billSummary(p), amount: p.total.value }
  }

  const checked = <T>(value: T | null) => (value === null ? { value: null, confidence: 'low' as const } : { value, confidence: 'high' as const })
  const next: BillProposalPayload = {
    ...p,
    vendor: changed.vendor
      ? {
          ...p.vendor,
          vendorId: vendor?.id ?? null,
          vendorLabel: vendor ? vendorLabel(vendor) : null,
          match: vendor ? 'manual' : 'none',
          matchConfidence: vendor ? 'high' : 'low',
        }
      : p.vendor,
    invoiceNumber: changed.invoiceNumber ? checked(invoiceNumber || null) : p.invoiceNumber,
    invoiceDate: changed.invoiceDate ? checked(raw.invoiceDate || null) : p.invoiceDate,
    dueDate: changed.dueDate ? checked(raw.dueDate || null) : p.dueDate,
    total: changed.total ? checked(raw.totalCents === null ? null : toDollars(raw.totalCents)) : p.total,
    lineItems: changed.lineItems
      ? lineItems.map((li) => ({ description: li.description, amount: li.amountCents === null ? null : toDollars(li.amountCents) }))
      : p.lineItems,
    expenseAccount: changed.expenseAccount
      ? account
        ? { accountId: account.id, label: `${account.accountNumber} — ${account.accountName}`, reasoning: null, confidence: 'high' }
        : { accountId: null, label: null, reasoning: null, confidence: 'low' }
      : p.expenseAccount,
    warnings: p.warnings.filter((w) => !ANSWERED_WARNINGS.some(([fields, prefix]) => w.startsWith(prefix) && fields.some((f) => changed[f]))),
    humanEdits: {
      fields: [...new Set([...(p.humanEdits?.fields ?? []), ...editedFields])],
      editedBy: ctx.editedBy,
      editedAt: ctx.editedAt,
    },
  }
  return { ok: true, payload: next, editedFields, summary: billSummary(next), amount: next.total.value }
}

// ─── the save ────────────────────────────────────────────────────────

/** What ai_runs.human_edited_output holds for a W36 run after an edit. */
export interface BillRunEditRecord {
  kind: 'w36.ap_bill.edit'
  approvalRequestId: string
  /** Every field a human has changed on this bill, across edits. */
  fields: BillEditableField[]
  editedBy: string
  editedAt: string
  /** The bill as the human left it (no file bytes, no contact details). */
  values: {
    vendorId: string | null
    invoiceNumber: string | null
    invoiceDate: string | null
    dueDate: string | null
    totalCents: number | null
    expenseAccountId: string | null
    lineItems: Array<{ description: string; amountCents: number | null }>
  }
}

export interface BillEditDeps {
  userId: string
  now(): Date
  /** The row through the board member's own RLS client. */
  loadRequest(id: string): Promise<{ ok: true; row: { actionType: string; status: string; payload: unknown } | null } | { ok: false }>
  /** The association's vendors and active expense accounts, and its today. */
  loadOptions(
    associationId: string,
  ): Promise<{ ok: true; vendors: VendorCandidate[]; accounts: AccountCandidate[]; today: string } | { ok: false }>
  invoiceExists(vendorId: string, invoiceNumber: string): Promise<{ ok: true; exists: boolean } | { ok: false }>
  /** Writes only while the row is still 'proposed'. */
  updateProposal(
    id: string,
    next: { payload: BillProposalPayload; summary: string; amount: number | null },
  ): Promise<'ok' | 'not_proposed' | 'error'>
  recordRunEdit(aiRunId: string, record: BillRunEditRecord): Promise<boolean>
}

export type BillEditOutcome =
  | { ok: true; editedFields: BillEditableField[]; canApprove: boolean }
  | { ok: false; error: string; fieldErrors?: Partial<Record<BillEditFieldKey, string>> }

const NOT_LIVE = 'This bill isn’t waiting for a decision any more. Refresh the page.'

/** Validate, re-check the world, save. The caller has already passed the board gate. */
export async function saveBillEdit(raw: unknown, deps: BillEditDeps): Promise<BillEditOutcome> {
  const parsed = BillEditSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Those bill details aren’t valid.' }
  const input = parsed.data

  const loaded = await deps.loadRequest(input.approvalRequestId)
  if (!loaded.ok) return { ok: false, error: 'Couldn’t load this bill. Try again.' }
  const row = loaded.row
  if (!row || row.actionType !== BILL_ACTION) return { ok: false, error: 'That approval item isn’t a scanned bill.' }
  if (row.status !== 'proposed') return { ok: false, error: NOT_LIVE }
  const current = readBillPayload(row.payload)
  if (!current) return { ok: false, error: 'This scan couldn’t be read, so it can’t be edited. Reject it and enter the bill by hand.' }

  const options = await deps.loadOptions(current.associationId)
  if (!options.ok) return { ok: false, error: 'Couldn’t load the vendors and accounts. Try again.' }

  const result = applyBillEdit(current, input, {
    vendors: options.vendors,
    accounts: options.accounts,
    today: options.today,
    editedBy: deps.userId,
    editedAt: deps.now().toISOString(),
  })
  if (!result.ok) return result
  if (result.editedFields.length === 0) return { ok: true, editedFields: [], canApprove: billMissing(current).length === 0 }

  const p = result.payload
  if (p.vendor.vendorId && p.invoiceNumber.value) {
    const dup = await deps.invoiceExists(p.vendor.vendorId, p.invoiceNumber.value)
    if (!dup.ok) return { ok: false, error: 'Couldn’t check for an existing copy of this bill. Try again.' }
    if (dup.exists) {
      return {
        ok: false,
        error: 'Fix the highlighted fields.',
        fieldErrors: { invoiceNumber: `Invoice ${p.invoiceNumber.value} from this vendor is already entered.` },
      }
    }
  }

  const saved = await deps.updateProposal(input.approvalRequestId, { payload: p, summary: result.summary, amount: result.amount })
  if (saved === 'not_proposed') return { ok: false, error: 'This bill has already been decided, so the edit wasn’t saved. Refresh the page.' }
  if (saved === 'error') return { ok: false, error: 'Couldn’t save the changes. Try again.' }

  if (p.aiRunId) {
    const form = editFormFrom(p)
    // Best effort: payload.humanEdits (saved above) is the record of truth.
    await deps.recordRunEdit(p.aiRunId, {
      kind: 'w36.ap_bill.edit',
      approvalRequestId: input.approvalRequestId,
      fields: p.humanEdits!.fields,
      editedBy: deps.userId,
      editedAt: p.humanEdits!.editedAt,
      values: {
        vendorId: form.vendorId,
        invoiceNumber: form.invoiceNumber || null,
        invoiceDate: form.invoiceDate || null,
        dueDate: form.dueDate || null,
        totalCents: form.totalCents,
        expenseAccountId: form.expenseAccountId,
        lineItems: form.lineItems,
      },
    })
  }
  return { ok: true, editedFields: result.editedFields, canApprove: billMissing(p).length === 0 }
}
