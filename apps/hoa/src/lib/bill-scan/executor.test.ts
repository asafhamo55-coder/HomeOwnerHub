import { describe, expect, it, vi } from 'vitest'
import type { ApprovalRequestRow } from '@homeowner-portal/workflows'
import { makeBillExecutor, type BillExecutorDeps } from './executor'
import { buildBillProposal } from './proposal'

const ASSOC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const VENDOR = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function payload(over: { total?: number | null } = {}) {
  return buildBillProposal(
    {
      runId: 'run-1',
      vendorName: { value: 'Sample Landscaping Co', confidence: 'high' },
      invoiceNumber: { value: 'SL-2210', confidence: 'high' },
      invoiceDate: { value: '2026-10-01', confidence: 'high' },
      dueDate: { value: null, confidence: 'low' },
      total: { value: over.total === undefined ? 1200 : over.total, confidence: 'high' },
      lineItems: [],
      expenseAccount: { accountNumber: '5100', reasoning: 'Grounds.', confidence: 'high' },
      warnings: [],
    },
    {
      associationId: ASSOC,
      storagePath: 'org/bills/x.pdf',
      contentType: 'application/pdf',
      source: 'pdf_text',
      vendors: [{ id: VENDOR, legalName: 'Sample Landscaping Co', dba: null }],
      accounts: [{ id: ACCOUNT, accountNumber: '5100', accountName: 'Landscaping' }],
    },
  ).payload
}

function row(p: unknown): ApprovalRequestRow {
  return {
    id: 'req-1',
    organization_id: 'org-1',
    workflow_id: 'W36',
    action_type: 'w36.ap_bill',
    subject_type: 'bill_document',
    subject_id: 'sub-1',
    payload: p as never,
    summary: 'Bill',
    amount: 1200,
    status: 'approved',
    proposed_at: '2026-10-01T00:00:00Z',
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    posted_at: null,
    result_ref: null,
    error: null,
  }
}

function deps(over: Partial<BillExecutorDeps> = {}): BillExecutorDeps {
  return {
    primaryAssociationId: vi.fn(async () => ASSOC),
    invoiceExists: vi.fn(async () => ({ ok: true as const, exists: false })),
    enterBill: vi.fn(async () => ({ ok: true as const, invoiceId: 'inv-1' })),
    ...over,
  }
}

const adminDb = {} as never

describe('bill executor', () => {
  it('enters the bill through enterBill and returns the invoice id', async () => {
    const d = deps()
    const r = await makeBillExecutor(d)(adminDb, row(payload()))
    expect(r).toEqual({ ok: true, resultRef: 'inv-1' })
    expect(d.enterBill).toHaveBeenCalledWith({
      vendorId: VENDOR,
      invoiceNumber: 'SL-2210',
      invoiceDate: '2026-10-01',
      amount: 1200,
      expenseAccountId: ACCOUNT,
      aiRunId: 'run-1',
      rawDocumentPath: 'org/bills/x.pdf',
    })
  })

  it('refuses an unreadable payload without entering anything', async () => {
    const d = deps()
    const r = await makeBillExecutor(d)(adminDb, row({ demo: true }))
    expect(r.ok).toBe(false)
    expect(d.enterBill).not.toHaveBeenCalled()
  })

  it('refuses an incomplete proposal', async () => {
    const d = deps()
    const r = await makeBillExecutor(d)(adminDb, row(payload({ total: null })))
    expect(r).toEqual({ ok: false, error: 'This bill is missing the total. Enter it by hand instead.' })
    expect(d.enterBill).not.toHaveBeenCalled()
  })

  it('re-validates the association against the one enterBill will use', async () => {
    const d = deps({ primaryAssociationId: vi.fn(async () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') })
    const r = await makeBillExecutor(d)(adminDb, row(payload()))
    expect(r.ok).toBe(false)
    expect(d.enterBill).not.toHaveBeenCalled()
  })

  it('refuses a bill already entered for the same vendor and invoice number', async () => {
    const d = deps({ invoiceExists: vi.fn(async () => ({ ok: true as const, exists: true })) })
    const r = await makeBillExecutor(d)(adminDb, row(payload()))
    expect(r).toEqual({ ok: false, error: 'Invoice SL-2210 from this vendor is already entered.' })
    expect(d.enterBill).not.toHaveBeenCalled()
  })

  it('refuses when the duplicate check itself fails', async () => {
    const d = deps({ invoiceExists: vi.fn(async () => ({ ok: false as const })) })
    const r = await makeBillExecutor(d)(adminDb, row(payload()))
    expect(r.ok).toBe(false)
    expect(d.enterBill).not.toHaveBeenCalled()
  })

  it('passes an enterBill failure through', async () => {
    const d = deps({ enterBill: vi.fn(async () => ({ ok: false as const, error: 'No open fiscal period.' })) })
    expect(await makeBillExecutor(d)(adminDb, row(payload()))).toEqual({ ok: false, error: 'No open fiscal period.' })
  })
})
