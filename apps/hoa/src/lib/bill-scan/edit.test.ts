import { describe, expect, it, vi } from 'vitest'
import type { BillScanOutput } from '@homeowner-portal/workflows'
import { billMissing, billNeedsCheck, buildBillProposal, readBillPayload, type AccountCandidate, type BillProposalPayload, type VendorCandidate } from './proposal'
import { applyBillEdit, centsFromInput, centsToInput, editFormFrom, saveBillEdit, type BillEditDeps, type BillEditInput } from './edit'

// BL-059: a board member corrects what the AI read before approving. The
// corrected values go through the same money rules the scan does, in code.

const VENDORS: VendorCandidate[] = [
  { id: '11111111-1111-4111-8111-111111111111', legalName: 'Sample Landscaping Co, LLC', dba: null },
  { id: '22222222-2222-4222-8222-222222222222', legalName: 'Demo Pool Services Inc', dba: 'Blue Water Pools' },
]
const ACCOUNTS: AccountCandidate[] = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accountNumber: '5100', accountName: 'Landscaping' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', accountNumber: '5200', accountName: 'Utilities' },
]
const ASSOC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REQ = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const RUN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const USER = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const CTX = { vendors: VENDORS, accounts: ACCOUNTS, today: '2026-10-17', editedBy: USER, editedAt: '2026-10-17T12:00:00.000Z' }

function scan(over: Partial<BillScanOutput> = {}): BillScanOutput & { runId: string } {
  return {
    runId: RUN,
    vendorName: { value: 'Sample Landscaping Co', confidence: 'high' },
    invoiceNumber: { value: 'SL-2210', confidence: 'high' },
    invoiceDate: { value: '2026-10-01', confidence: 'high' },
    dueDate: { value: '2026-10-31', confidence: 'high' },
    total: { value: 1200, confidence: 'high' },
    lineItems: [{ description: 'Mowing', amount: 1200 }],
    expenseAccount: { accountNumber: '5100', reasoning: 'Grounds work.', confidence: 'high' },
    warnings: [],
    ...over,
  }
}

function payload(over: Partial<BillScanOutput> = {}): BillProposalPayload {
  return buildBillProposal(scan(over), {
    associationId: ASSOC,
    storagePath: 'org-1/bills/x.pdf',
    contentType: 'application/pdf',
    source: 'pdf_text',
    vendors: VENDORS,
    accounts: ACCOUNTS,
  }).payload
}

/** The edit form's values for a payload, unchanged. */
function same(p: BillProposalPayload): BillEditInput {
  return { approvalRequestId: REQ, ...editFormFrom(p) }
}

describe('centsFromInput / centsToInput (the form’s money boxes)', () => {
  it('reads dollars as typed, to whole cents', () => {
    expect(centsFromInput('1,234.50')).toBe(123450)
    expect(centsFromInput('$ 12')).toBe(1200)
    expect(centsFromInput('0.1')).toBe(10)
    expect(centsFromInput('-25.00')).toBe(-2500)
    expect(centsFromInput('  ')).toBeNull()
  })

  it('refuses what is not an amount, or has fractions of a cent', () => {
    expect(centsFromInput('12.345')).toBe('invalid')
    expect(centsFromInput('abc')).toBe('invalid')
    expect(centsFromInput('1.2.3')).toBe('invalid')
  })

  it('writes cents back as a plain dollar string', () => {
    expect(centsToInput(123450)).toBe('1234.50')
    expect(centsToInput(null)).toBe('')
  })
})

describe('editFormFrom', () => {
  it('turns the payload into form values, money in cents', () => {
    expect(editFormFrom(payload())).toEqual({
      vendorId: VENDORS[0]!.id,
      invoiceNumber: 'SL-2210',
      invoiceDate: '2026-10-01',
      dueDate: '2026-10-31',
      totalCents: 120000,
      expenseAccountId: ACCOUNTS[0]!.id,
      lineItems: [{ description: 'Mowing', amountCents: 120000 }],
    })
  })
})

describe('origin — the link back to an inbox email (BL-059)', () => {
  const THREAD = '99999999-9999-4999-8999-999999999991'
  const ATT = '99999999-9999-4999-8999-999999999992'
  const fromInbox = () =>
    buildBillProposal(scan(), {
      associationId: ASSOC,
      storagePath: 'org-1/bills/x.pdf',
      contentType: 'application/pdf',
      source: 'pdf_text',
      vendors: VENDORS,
      accounts: ACCOUNTS,
      origin: { kind: 'inbox_attachment', threadId: THREAD, attachmentId: ATT },
    }).payload

  it('an upload carries no origin; a scanned attachment carries the thread and attachment ids only', () => {
    expect(payload().origin).toBeUndefined()
    expect(fromInbox().origin).toEqual({ kind: 'inbox_attachment', threadId: THREAD, attachmentId: ATT })
  })

  it('survives the stored round trip and a board edit', () => {
    const p = readBillPayload(JSON.parse(JSON.stringify(fromInbox())))!
    expect(p.origin?.threadId).toBe(THREAD)
    const r = applyBillEdit(p, { ...same(p), invoiceNumber: 'SL-9' }, CTX)
    if (!r.ok) throw new Error(r.error)
    expect(r.payload.origin).toEqual(p.origin)
  })

  it('a malformed origin makes the payload unreadable rather than linking anywhere', () => {
    const bad = { ...fromInbox(), origin: { kind: 'inbox_attachment', threadId: 'not-a-uuid', attachmentId: ATT } }
    expect(readBillPayload(bad)).toBeNull()
  })
})

describe('applyBillEdit — what changed', () => {
  it('records nothing when nothing changed', () => {
    const p = payload()
    const r = applyBillEdit(p, same(p), CTX)
    expect(r.ok && r.editedFields).toEqual([])
  })

  it('records each changed field, marks it human-checked, and stamps who and when', () => {
    const p = payload({ invoiceNumber: { value: 'SL-221O', confidence: 'low' }, total: { value: 1100, confidence: 'medium' } })
    const r = applyBillEdit(p, { ...same(p), invoiceNumber: 'SL-2210', totalCents: 120000 }, CTX)
    if (!r.ok) throw new Error(r.error)
    expect(r.editedFields).toEqual(['invoiceNumber', 'total'])
    expect(r.payload.invoiceNumber).toEqual({ value: 'SL-2210', confidence: 'high' })
    expect(r.payload.total).toEqual({ value: 1200, confidence: 'high' })
    expect(r.payload.humanEdits).toEqual({ fields: ['invoiceNumber', 'total'], editedBy: USER, editedAt: CTX.editedAt })
    expect(billNeedsCheck(r.payload)).toEqual([])
    expect(r.amount).toBe(1200)
    // The stored payload still reads back as a v1 bill.
    expect(readBillPayload(JSON.parse(JSON.stringify(r.payload)))).toEqual(r.payload)
  })

  it('keeps the earlier edits when a second edit changes something else', () => {
    const p = payload()
    const first = applyBillEdit(p, { ...same(p), invoiceNumber: 'SL-9' }, CTX)
    if (!first.ok) throw new Error(first.error)
    const second = applyBillEdit(first.payload, { ...same(first.payload), dueDate: '2026-11-15' }, { ...CTX, editedAt: '2026-10-17T13:00:00.000Z' })
    if (!second.ok) throw new Error(second.error)
    expect(second.payload.humanEdits).toEqual({ fields: ['invoiceNumber', 'dueDate'], editedBy: USER, editedAt: '2026-10-17T13:00:00.000Z' })
  })

  it('a picked vendor is a manual match, no longer flagged, and renames the summary', () => {
    const p = payload({ vendorName: { value: 'Somebody Else', confidence: 'high' } })
    expect(p.vendor.vendorId).toBeNull()
    const r = applyBillEdit(p, { ...same(p), vendorId: VENDORS[1]!.id }, CTX)
    if (!r.ok) throw new Error(r.error)
    expect(r.payload.vendor).toMatchObject({
      vendorId: VENDORS[1]!.id,
      vendorLabel: 'Demo Pool Services Inc (d/b/a Blue Water Pools)',
      match: 'manual',
      extractedName: 'Somebody Else',
    })
    expect(billNeedsCheck(r.payload)).not.toContain('vendor')
    expect(r.summary).toBe('Bill from Demo Pool Services Inc (d/b/a Blue Water Pools) · #SL-2210')
  })

  it('a reject-only bill becomes approvable once the missing fields are filled', () => {
    const p = payload({
      vendorName: { value: null, confidence: 'low' },
      invoiceNumber: { value: null, confidence: 'low' },
      total: { value: null, confidence: 'low' },
      lineItems: [],
      expenseAccount: { accountNumber: null, reasoning: null, confidence: 'low' },
    })
    expect(billMissing(p)).toHaveLength(4)
    const r = applyBillEdit(
      p,
      { ...same(p), vendorId: VENDORS[0]!.id, invoiceNumber: 'A-1', totalCents: 5000, expenseAccountId: ACCOUNTS[1]!.id },
      CTX,
    )
    if (!r.ok) throw new Error(r.error)
    expect(billMissing(r.payload)).toEqual([])
    expect(r.payload.expenseAccount).toMatchObject({ accountId: ACCOUNTS[1]!.id, label: '5200 — Utilities', confidence: 'high' })
  })

  it('clearing the due date is allowed (a bill may not state one)', () => {
    const p = payload()
    const r = applyBillEdit(p, { ...same(p), dueDate: '' }, CTX)
    if (!r.ok) throw new Error(r.error)
    expect(r.payload.dueDate).toEqual({ value: null, confidence: 'low' })
    expect(r.editedFields).toEqual(['dueDate'])
  })

  it('drops the AI warnings an edit has answered', () => {
    const p = payload({
      total: { value: 1300, confidence: 'low' },
      warnings: ['The line items add up to $1,200.00, not the $1,300.00 total — check the total against the bill.', 'Handwritten note on page 2.'],
    })
    const r = applyBillEdit(p, { ...same(p), totalCents: 120000 }, CTX)
    if (!r.ok) throw new Error(r.error)
    expect(r.payload.warnings).toEqual(['Handwritten note on page 2.'])
  })
})

describe('applyBillEdit — the money rules', () => {
  const p = payload()
  const refuse = (edit: Partial<BillEditInput>, field: string) => {
    const r = applyBillEdit(p, { ...same(p), ...edit }, CTX)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors)).toContain(field)
  }

  it('refuses a date that is not on the calendar', () => {
    refuse({ invoiceDate: '2026-02-30' }, 'invoiceDate')
    refuse({ invoiceDate: '10/01/2026' }, 'invoiceDate')
    refuse({ dueDate: '2026-13-01' }, 'dueDate')
  })

  it('refuses an invoice dated after today, and a due date before the invoice date', () => {
    refuse({ invoiceDate: '2026-10-18' }, 'invoiceDate')
    refuse({ dueDate: '2026-09-30' }, 'dueDate')
  })

  it('refuses a zero, negative or over-ceiling total', () => {
    refuse({ totalCents: 0, lineItems: [] }, 'totalCents')
    refuse({ totalCents: -500, lineItems: [] }, 'totalCents')
    refuse({ totalCents: 100_000_001, lineItems: [] }, 'totalCents')
  })

  it('refuses line items that do not add up to an edited total', () => {
    refuse({ totalCents: 130000 }, 'lineItems')
    refuse({ lineItems: [{ description: 'Mowing', amountCents: 100000 }] }, 'lineItems')
  })

  it('accepts line items that add up, and unpriced ones are not summed', () => {
    const ok = applyBillEdit(p, { ...same(p), lineItems: [{ description: 'Mowing', amountCents: 100000 }, { description: 'Edging', amountCents: 20000 }] }, CTX)
    expect(ok.ok).toBe(true)
    const unpriced = applyBillEdit(p, { ...same(p), totalCents: 99900, lineItems: [{ description: 'Mowing', amountCents: null }] }, CTX)
    expect(unpriced.ok).toBe(true)
  })

  it('refuses a line item with no description', () => {
    refuse({ lineItems: [{ description: '   ', amountCents: 120000 }] }, 'lineItems')
  })

  it('refuses an expense account or vendor that is not the association’s', () => {
    refuse({ expenseAccountId: '99999999-9999-4999-8999-999999999999' }, 'expenseAccountId')
    refuse({ vendorId: '99999999-9999-4999-8999-999999999999' }, 'vendorId')
  })

  it('refuses a blank invoice number made of spaces only as empty, not as a value', () => {
    const r = applyBillEdit(p, { ...same(p), invoiceNumber: '   ' }, CTX)
    if (!r.ok) throw new Error(r.error)
    expect(r.payload.invoiceNumber.value).toBeNull()
  })
})

// ─── the save composition ───────────────────────────────────────────

function deps(p: BillProposalPayload, over: Partial<BillEditDeps> = {}): BillEditDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    userId: USER,
    now: () => new Date(CTX.editedAt),
    loadRequest: vi.fn(async () => ({ ok: true as const, row: { actionType: 'w36.ap_bill', status: 'proposed', payload: p } })),
    loadOptions: vi.fn(async () => ({ ok: true as const, vendors: VENDORS, accounts: ACCOUNTS, today: CTX.today })),
    invoiceExists: vi.fn(async () => ({ ok: true as const, exists: false })),
    updateProposal: vi.fn(async () => {
      calls.push('proposal')
      return 'ok' as const
    }),
    recordRunEdit: vi.fn(async () => {
      calls.push('run')
      return true
    }),
    ...over,
  }
}

describe('saveBillEdit', () => {
  it('refuses a malformed input before loading anything', async () => {
    const d = deps(payload())
    const r = await saveBillEdit({ approvalRequestId: 'nope' }, d)
    expect(r.ok).toBe(false)
    expect(d.loadRequest).not.toHaveBeenCalled()
  })

  it('refuses something that is not a live bill proposal', async () => {
    const p = payload()
    for (const row of [
      { actionType: 'w18.cash_receipt', status: 'proposed', payload: p },
      { actionType: 'w36.ap_bill', status: 'approved', payload: p },
      { actionType: 'w36.ap_bill', status: 'proposed', payload: { junk: true } },
    ]) {
      const d = deps(p, { loadRequest: vi.fn(async () => ({ ok: true as const, row })) })
      const r = await saveBillEdit({ ...same(p), invoiceNumber: 'X' }, d)
      expect(r.ok).toBe(false)
      expect(d.updateProposal).not.toHaveBeenCalled()
    }
  })

  it('refuses a vendor + invoice number that is already entered', async () => {
    const p = payload()
    const d = deps(p, { invoiceExists: vi.fn(async () => ({ ok: true as const, exists: true })) })
    const r = await saveBillEdit({ ...same(p), invoiceNumber: 'SL-1' }, d)
    expect(r).toMatchObject({ ok: false, fieldErrors: { invoiceNumber: expect.stringContaining('already entered') } })
    expect(d.invoiceExists).toHaveBeenCalledWith(VENDORS[0]!.id, 'SL-1')
    expect(d.updateProposal).not.toHaveBeenCalled()
  })

  it('fails closed when the duplicate check cannot run', async () => {
    const p = payload()
    const d = deps(p, { invoiceExists: vi.fn(async () => ({ ok: false as const })) })
    expect((await saveBillEdit({ ...same(p), invoiceNumber: 'SL-1' }, d)).ok).toBe(false)
    expect(d.updateProposal).not.toHaveBeenCalled()
  })

  it('saves the proposal, then mirrors the edit onto the ai_runs row', async () => {
    const p = payload()
    const d = deps(p)
    const r = await saveBillEdit({ ...same(p), invoiceNumber: 'SL-1' }, d)
    expect(r).toEqual({ ok: true, editedFields: ['invoiceNumber'], canApprove: true })
    expect(d.calls).toEqual(['proposal', 'run'])
    const [, saved] = vi.mocked(d.updateProposal).mock.calls[0]!
    expect(saved.summary).toBe('Bill from Sample Landscaping Co, LLC · #SL-1')
    expect(saved.amount).toBe(1200)
    expect(saved.payload.humanEdits?.fields).toEqual(['invoiceNumber'])
    const [runId, record] = vi.mocked(d.recordRunEdit).mock.calls[0]!
    expect(runId).toBe(RUN)
    expect(record).toMatchObject({ approvalRequestId: REQ, fields: ['invoiceNumber'], editedBy: USER, values: { invoiceNumber: 'SL-1' } })
  })

  it('saves nothing when nothing changed', async () => {
    const p = payload()
    const d = deps(p)
    expect(await saveBillEdit(same(p), d)).toEqual({ ok: true, editedFields: [], canApprove: true })
    expect(d.updateProposal).not.toHaveBeenCalled()
  })

  it('says so when the bill was decided while it was being edited', async () => {
    const p = payload()
    const d = deps(p, { updateProposal: vi.fn(async () => 'not_proposed' as const) })
    const r = await saveBillEdit({ ...same(p), invoiceNumber: 'SL-1' }, d)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('already been decided') })
    expect(d.recordRunEdit).not.toHaveBeenCalled()
  })

  it('a failed ai_runs mirror does not undo the saved edit (the proposal holds the record)', async () => {
    const p = payload()
    const d = deps(p, { recordRunEdit: vi.fn(async () => false) })
    expect((await saveBillEdit({ ...same(p), invoiceNumber: 'SL-1' }, d)).ok).toBe(true)
  })
})
