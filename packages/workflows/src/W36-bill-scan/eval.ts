// W36 — AP bill scan. Eval set: 10 fixture invoices (BL-021 acceptance).
//
// Each case is the bill TEXT (what pdf-parse returns for a text-layer PDF),
// the expense accounts offered, a canned model reply, and the extraction a
// correct pipeline must end with. The unit suite (index.test.ts) runs every
// case through processBillScanResponse with the canned reply — no model is
// called in CI. To score a real model, feed `text` + `accounts` to
// runBillScan with the live BillScanModel and compare against `expected`;
// the canned replies are deliberately imperfect in the ways real replies
// are (fences, money strings, impossible dates, an invented account), so
// the deterministic half is exercised on the same failure modes.
//
// Invented vendors and amounts only. No real people or addresses.

import type { BillScanOutput } from './index'
import type { PromptAccount } from './prompt'

export interface BillEvalCase {
  id: string
  text: string
  accounts: PromptAccount[]
  cannedReply: string
  expected: {
    vendorName: string | null
    invoiceNumber: string | null
    invoiceDate: string | null
    dueDate: string | null
    total: number | null
    accountNumber: string | null
    /** Fields that must come out marked low confidence. */
    lowFields?: Array<'vendorName' | 'invoiceNumber' | 'invoiceDate' | 'dueDate' | 'total'>
  }
}

const ACCOUNTS: PromptAccount[] = [
  { accountNumber: '5100', accountName: 'Landscaping' },
  { accountNumber: '5200', accountName: 'Utilities' },
  { accountNumber: '5300', accountName: 'Insurance' },
  { accountNumber: '5400', accountName: 'Repairs & maintenance' },
  { accountNumber: '5500', accountName: 'Pool service' },
  { accountNumber: '5600', accountName: 'Management & professional fees' },
]

type Conf = 'high' | 'medium' | 'low'
function f<T>(value: T, confidence: Conf = 'high') {
  return { value, confidence }
}
function canned(o: Partial<Record<keyof BillScanOutput, unknown>>): string {
  return JSON.stringify(o)
}

export const BILL_EVAL_CASES: BillEvalCase[] = [
  {
    id: 'landscaping-clean',
    text: 'Sample Landscaping Co\nINVOICE # SL-2210\nDate: October 1, 2026\nDue: October 31, 2026\nBill to: Demo Park HOA\nMonthly mowing 900.00\nShrub trimming 300.00\nTOTAL DUE $1,200.00',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Sample Landscaping Co'),
      invoiceNumber: f('SL-2210'),
      invoiceDate: f('2026-10-01'),
      dueDate: f('2026-10-31'),
      total: f(1200),
      lineItems: [
        { description: 'Monthly mowing', amount: 900 },
        { description: 'Shrub trimming', amount: 300 },
      ],
      expenseAccount: { accountNumber: '5100', reasoning: 'Mowing and trimming are grounds maintenance.', confidence: 'high' },
    }),
    expected: { vendorName: 'Sample Landscaping Co', invoiceNumber: 'SL-2210', invoiceDate: '2026-10-01', dueDate: '2026-10-31', total: 1200, accountNumber: '5100' },
  },
  {
    id: 'utility-fenced-money-string',
    text: 'Demo Water Utility\nAccount 0042-77\nStatement date 09/15/2026\nAmount due $312.48 by 10/05/2026',
    accounts: ACCOUNTS,
    cannedReply:
      '```json\n' +
      canned({
        vendorName: f('Demo Water Utility'),
        invoiceNumber: f('0042-77-0915', 'medium'),
        invoiceDate: f('2026-09-15'),
        dueDate: f('2026-10-05'),
        total: f('$312.48'),
        lineItems: [],
        expenseAccount: { accountNumber: '5200', reasoning: 'A water bill is a utility.', confidence: 'high' },
      }) +
      '\n```',
    expected: { vendorName: 'Demo Water Utility', invoiceNumber: '0042-77-0915', invoiceDate: '2026-09-15', dueDate: '2026-10-05', total: 312.48, accountNumber: '5200' },
  },
  {
    id: 'due-on-receipt',
    text: 'Demo Plumbing LLC\nInvoice 7781\n2026-10-03\nRepair leaking valve at clubhouse 185.00\nDue on receipt',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Demo Plumbing LLC'),
      invoiceNumber: f('7781'),
      invoiceDate: f('2026-10-03'),
      dueDate: f(null),
      total: f(185),
      lineItems: [{ description: 'Repair leaking valve at clubhouse', amount: 185 }],
      expenseAccount: { accountNumber: '5400', reasoning: 'A valve repair is maintenance.', confidence: 'high' },
    }),
    expected: { vendorName: 'Demo Plumbing LLC', invoiceNumber: '7781', invoiceDate: '2026-10-03', dueDate: null, total: 185, accountNumber: '5400' },
  },
  {
    id: 'lines-do-not-add-up',
    text: 'Demo Pool Services\nINV PS-55\nOct 2, 2026\nWeekly service x4 400.00\nChemicals 95.00\nTotal 459.00',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Demo Pool Services'),
      invoiceNumber: f('PS-55'),
      invoiceDate: f('2026-10-02'),
      dueDate: f(null),
      total: f(459),
      lineItems: [
        { description: 'Weekly service x4', amount: 400 },
        { description: 'Chemicals', amount: 95 },
      ],
      expenseAccount: { accountNumber: '5500', reasoning: 'Pool service.', confidence: 'high' },
    }),
    expected: { vendorName: 'Demo Pool Services', invoiceNumber: 'PS-55', invoiceDate: '2026-10-02', dueDate: null, total: 459, accountNumber: '5500', lowFields: ['total'] },
  },
  {
    id: 'impossible-date',
    text: 'Demo Roofing Partners\nInvoice R-901\nDate 02/30/2026\nRoof inspection 250.00',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Demo Roofing Partners'),
      invoiceNumber: f('R-901'),
      invoiceDate: f('2026-02-30'),
      dueDate: f(null),
      total: f(250),
      lineItems: [{ description: 'Roof inspection', amount: 250 }],
      expenseAccount: { accountNumber: '5400', reasoning: 'An inspection is maintenance.', confidence: 'medium' },
    }),
    expected: { vendorName: 'Demo Roofing Partners', invoiceNumber: 'R-901', invoiceDate: null, dueDate: null, total: 250, accountNumber: '5400', lowFields: ['invoiceDate'] },
  },
  {
    id: 'invented-account',
    text: 'Demo Security Patrol\nInvoice 3302\n2026-10-04\nNight patrol, September 640.00',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Demo Security Patrol'),
      invoiceNumber: f('3302'),
      invoiceDate: f('2026-10-04'),
      dueDate: f(null),
      total: f(640),
      lineItems: [{ description: 'Night patrol, September', amount: 640 }],
      expenseAccount: { accountNumber: '5750', reasoning: 'Security.', confidence: 'high' },
    }),
    expected: { vendorName: 'Demo Security Patrol', invoiceNumber: '3302', invoiceDate: '2026-10-04', dueDate: null, total: 640, accountNumber: null },
  },
  {
    id: 'blurry-photo-low-confidence',
    text: '(photo) Sample Tree Care ... Inv 4?17 ... total 1,0?0.00',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Sample Tree Care', 'medium'),
      invoiceNumber: f('4417', 'low'),
      invoiceDate: f(null),
      dueDate: f(null),
      total: f(1080, 'low'),
      lineItems: [],
      expenseAccount: { accountNumber: '5100', reasoning: 'Tree care is grounds work.', confidence: 'medium' },
    }),
    expected: { vendorName: 'Sample Tree Care', invoiceNumber: '4417', invoiceDate: null, dueDate: null, total: 1080, accountNumber: '5100', lowFields: ['invoiceNumber', 'total', 'invoiceDate'] },
  },
  {
    id: 'insurance-premium',
    text: 'Demo Mutual Insurance\nPolicy invoice DM-2026-118\nIssued 2026-09-20\nDue 2026-10-20\nAnnual D&O premium 2,450.00',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Demo Mutual Insurance'),
      invoiceNumber: f('DM-2026-118'),
      invoiceDate: f('2026-09-20'),
      dueDate: f('2026-10-20'),
      total: f(2450),
      lineItems: [{ description: 'Annual D&O premium', amount: 2450 }],
      expenseAccount: { accountNumber: '5300', reasoning: 'An insurance premium.', confidence: 'high' },
    }),
    expected: { vendorName: 'Demo Mutual Insurance', invoiceNumber: 'DM-2026-118', invoiceDate: '2026-09-20', dueDate: '2026-10-20', total: 2450, accountNumber: '5300' },
  },
  {
    id: 'due-before-issue',
    text: 'Demo CPA Group\nInvoice 2026-77\nDate 2026-10-05\nDue 2026-09-05\nAnnual review 1,800.00',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f('Demo CPA Group'),
      invoiceNumber: f('2026-77'),
      invoiceDate: f('2026-10-05'),
      dueDate: f('2026-09-05'),
      total: f(1800),
      lineItems: [{ description: 'Annual review', amount: 1800 }],
      expenseAccount: { accountNumber: '5600', reasoning: 'Accounting is a professional fee.', confidence: 'high' },
    }),
    expected: { vendorName: 'Demo CPA Group', invoiceNumber: '2026-77', invoiceDate: '2026-10-05', dueDate: '2026-09-05', total: 1800, accountNumber: '5600', lowFields: ['dueDate'] },
  },
  {
    id: 'not-a-bill',
    text: 'Thank you for your payment. Your balance is $0.00.',
    accounts: ACCOUNTS,
    cannedReply: canned({
      vendorName: f(null),
      invoiceNumber: f(null),
      invoiceDate: f(null),
      dueDate: f(null),
      total: f(0),
      lineItems: [],
      expenseAccount: { accountNumber: null, reasoning: null, confidence: 'low' },
    }),
    expected: { vendorName: null, invoiceNumber: null, invoiceDate: null, dueDate: null, total: null, accountNumber: null, lowFields: ['vendorName', 'invoiceNumber', 'invoiceDate', 'total'] },
  },
]
