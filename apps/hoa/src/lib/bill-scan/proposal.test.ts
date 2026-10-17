import { describe, expect, it } from 'vitest'
import type { BillScanOutput } from '@homeowner-portal/workflows'
import {
  billMissing,
  billNeedsCheck,
  billSubjectId,
  buildBillProposal,
  enterBillInputFrom,
  matchVendor,
  readBillPayload,
  type AccountCandidate,
  type VendorCandidate,
} from './proposal'

const VENDORS: VendorCandidate[] = [
  { id: '11111111-1111-4111-8111-111111111111', legalName: 'Sample Landscaping Co, LLC', dba: null },
  { id: '22222222-2222-4222-8222-222222222222', legalName: 'Demo Pool Services Inc', dba: 'Blue Water Pools' },
  { id: '33333333-3333-4333-8333-333333333333', legalName: 'Demo Plumbing LLC', dba: null },
  { id: '44444444-4444-4444-8444-444444444444', legalName: 'Demo Plumbing & Heating LLC', dba: null },
]

const ACCOUNTS: AccountCandidate[] = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accountNumber: '5100', accountName: 'Landscaping' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', accountNumber: '5200', accountName: 'Utilities' },
]

describe('matchVendor', () => {
  it('matches the legal name ignoring case, punctuation and company suffixes', () => {
    expect(matchVendor('SAMPLE LANDSCAPING CO.', VENDORS)).toMatchObject({
      vendorId: VENDORS[0]!.id,
      method: 'exact',
      confidence: 'high',
    })
  })

  it('matches a d/b/a', () => {
    expect(matchVendor('Blue Water Pools', VENDORS)).toMatchObject({ vendorId: VENDORS[1]!.id, method: 'exact' })
  })

  it('a close name is a medium-confidence match, flagged as such', () => {
    expect(matchVendor('Sample Landscaping of Florida', VENDORS)).toMatchObject({
      vendorId: VENDORS[0]!.id,
      method: 'close',
      confidence: 'medium',
    })
  })

  it('two close candidates is ambiguous — no vendor is picked', () => {
    const m = matchVendor('Demo Plumbing Heating', [
      { id: 'x1', legalName: 'Demo Plumbing Heating North', dba: null },
      { id: 'x2', legalName: 'Demo Plumbing Heating South', dba: null },
    ])
    expect(m).toMatchObject({ vendorId: null, method: 'ambiguous', confidence: 'low' })
    expect(m.candidates).toHaveLength(2)
  })

  it('an exact match beats a close one', () => {
    expect(matchVendor('Demo Plumbing', VENDORS)).toMatchObject({ vendorId: VENDORS[2]!.id, method: 'exact' })
  })

  it('no match and no name are both "none"', () => {
    expect(matchVendor('Totally Different Roofing', VENDORS)).toMatchObject({ vendorId: null, method: 'none' })
    expect(matchVendor(null, VENDORS)).toMatchObject({ vendorId: null, method: 'none' })
  })
})

function scan(over: Partial<BillScanOutput> = {}): BillScanOutput & { runId: string } {
  return {
    runId: 'run-1',
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

const CTX = {
  associationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  storagePath: 'org/bills/x.pdf',
  contentType: 'application/pdf',
  source: 'pdf_text' as const,
  vendors: VENDORS,
  accounts: ACCOUNTS,
}

describe('buildBillProposal', () => {
  it('builds a complete proposal', () => {
    const p = buildBillProposal(scan(), CTX)
    expect(p.amount).toBe(1200)
    expect(p.summary).toBe('Bill from Sample Landscaping Co, LLC · #SL-2210')
    expect(p.payload.vendor.vendorId).toBe(VENDORS[0]!.id)
    expect(p.payload.expenseAccount).toMatchObject({ accountId: ACCOUNTS[0]!.id, label: '5100 — Landscaping', reasoning: 'Grounds work.' })
    expect(p.payload.aiRunId).toBe('run-1')
    expect(billMissing(p.payload)).toEqual([])
    expect(billNeedsCheck(p.payload)).toEqual([])
  })

  it('never fills a missing field: an unknown vendor and total stay empty and are listed as missing', () => {
    const p = buildBillProposal(scan({ vendorName: { value: 'Unknown Roofing', confidence: 'high' }, total: { value: null, confidence: 'low' } }), CTX)
    expect(p.amount).toBeNull()
    expect(p.payload.vendor.vendorId).toBeNull()
    expect(p.payload.total.value).toBeNull()
    expect(p.summary).toBe('Bill from Unknown Roofing (not on file) · #SL-2210')
    expect(billMissing(p.payload)).toEqual(['a vendor on file', 'the total'])
  })

  it('lists low/medium fields as needing a check', () => {
    const p = buildBillProposal(
      scan({
        vendorName: { value: 'Sample Landscaping of Florida', confidence: 'high' },
        invoiceNumber: { value: 'SL-22l0', confidence: 'low' },
        total: { value: 1200, confidence: 'medium' },
      }),
      CTX,
    )
    expect(billNeedsCheck(p.payload)).toEqual(['vendor', 'invoice number', 'total'])
  })

  it('a bill with no readable name still gets a summary', () => {
    const p = buildBillProposal(scan({ vendorName: { value: null, confidence: 'low' }, invoiceNumber: { value: null, confidence: 'low' } }), CTX)
    expect(p.summary).toBe('Bill from an unknown vendor')
  })
})

describe('readBillPayload', () => {
  it('round-trips a built payload', () => {
    const p = buildBillProposal(scan(), CTX)
    expect(readBillPayload(JSON.parse(JSON.stringify(p.payload)))).toEqual(p.payload)
  })

  it('returns null for anything else', () => {
    expect(readBillPayload({ demo: true })).toBeNull()
    expect(readBillPayload(null)).toBeNull()
  })
})

describe('enterBillInputFrom', () => {
  it('maps a complete payload to enterBill input, with the AI run and the stored file', () => {
    const p = buildBillProposal(scan(), CTX)
    expect(enterBillInputFrom(p.payload)).toEqual({
      ok: true,
      input: {
        vendorId: VENDORS[0]!.id,
        invoiceNumber: 'SL-2210',
        invoiceDate: '2026-10-01',
        dueDate: '2026-10-31',
        amount: 1200,
        expenseAccountId: ACCOUNTS[0]!.id,
        aiRunId: 'run-1',
        rawDocumentPath: 'org/bills/x.pdf',
      },
    })
  })

  it('refuses an incomplete payload, naming what is missing', () => {
    const p = buildBillProposal(scan({ invoiceDate: { value: null, confidence: 'low' } }), CTX)
    expect(enterBillInputFrom(p.payload)).toEqual({ ok: false, error: 'This bill is missing the invoice date. Enter it by hand instead.' })
  })
})

describe('BILL_ACTION', () => {
  it('is the action_type W36 declares (kept local so client bundles skip the workflows package)', async () => {
    const { W36_AP_BILL } = await import('@homeowner-portal/workflows')
    const { BILL_ACTION } = await import('./proposal')
    expect(BILL_ACTION).toBe(W36_AP_BILL)
  })
})

describe('billSubjectId', () => {
  it('is a stable uuid per org and file', async () => {
    const a = await billSubjectId('org-1', new Uint8Array([1, 2, 3]))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await billSubjectId('org-1', new Uint8Array([1, 2, 3]))).toBe(a)
    expect(await billSubjectId('org-2', new Uint8Array([1, 2, 3]))).not.toBe(a)
    expect(await billSubjectId('org-1', new Uint8Array([1, 2, 4]))).not.toBe(a)
  })
})
