// Fictional data for the board packet PDF's tests and proof renders.
import type { PacketPdfInput } from './pdf-summary'

const acct = (n: string, name: string, balance: number) => ({ accountNumber: n, accountName: name, balance })

export function packetFixture(): PacketPdfInput {
  const expenses = [
    acct('6010', 'Landscaping and grounds maintenance contract', 14_350),
    acct('6020', 'Property insurance premium', 8_400),
    acct('6030', 'Pool service and chemicals', 3_120.5),
    acct('6040', 'Water and sewer', 2_244.18),
    acct('6050', 'Management fee', 1_800),
    acct('6060', 'Legal and professional fees', 975),
    acct('6070', 'Snow and ice removal', 0),
    acct('6080', 'Repairs and maintenance', 1_050.44),
    acct('6090', 'Postage and printing', 120),
    acct('6100', 'Bank fees', 24),
    acct('6110', 'Annual meeting costs', 0),
    acct('6120', 'Common area lighting', 412.6),
    acct('6130', 'Trash collection', 1_020),
    acct('6140', 'Pest control', 180),
    acct('6150', 'Gate and access system', 260),
    acct('6160', 'Sign repairs', 0),
    acct('6170', 'Website and software', 99),
    acct('6180', 'Reserve study', 0),
    acct('6190', 'Taxes and licenses', 75),
    acct('6200', 'Miscellaneous', 12.4),
  ]
  const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0)
  return {
    associationName: 'Maple Creek HOA',
    period: { start_date: '2026-09-01', end_date: '2026-09-30', status: 'open' },
    preparedOn: '2026-10-01',
    balanceSheet: {
      asOfDate: '2026-09-30',
      assets: [acct('1010', 'Operating cash', 48_210.5), acct('1020', 'Reserve cash', 120_000), acct('1100', 'Assessments receivable', 6_420)],
      liabilities: [acct('2010', 'Accounts payable', 3_200), acct('2100', 'Prepaid assessments', 1_750)],
      equity: [acct('3010', 'Operating fund balance', 164_121.62)],
      netIncomePtd: 3_559.88,
      totalAssets: 174_630.5,
      totalLiabilities: 4_950,
      totalEquity: 167_681.5,
      isBalanced: true,
    },
    incomeStatement: {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      income: [acct('4010', 'Assessment income', 30_000), acct('4020', 'Late fees', 900), acct('4030', 'Interest income', 600)],
      expenses,
      totalIncome: 31_500,
      totalExpenses,
      netIncome: 31_500 - totalExpenses,
    },
    cashFlow: {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      rows: [
        { source: 'dues_payment', inflow: 27_450, outflow: 0, net: 27_450 },
        { source: 'vendor_payment', inflow: 0, outflow: 24_100.12, net: -24_100.12 },
        { source: 'manual_journal', inflow: 600, outflow: 0, net: 600 },
      ],
      openingCash: 44_260.62,
      closingCash: 48_210.5,
      totalNet: 3_949.88,
    },
  }
}

export function emptyPacketFixture(): PacketPdfInput {
  return {
    associationName: 'Maple Creek HOA',
    period: { start_date: '2026-09-01', end_date: '2026-09-30', status: 'open' },
    preparedOn: '2026-10-01',
    balanceSheet: { asOfDate: '2026-09-30', assets: [], liabilities: [], equity: [], netIncomePtd: 0, totalAssets: 0, totalLiabilities: 0, totalEquity: 0, isBalanced: true },
    incomeStatement: { startDate: '2026-09-01', endDate: '2026-09-30', income: [], expenses: [], totalIncome: 0, totalExpenses: 0, netIncome: 0 },
    cashFlow: { startDate: '2026-09-01', endDate: '2026-09-30', rows: [], openingCash: 0, closingCash: 0, totalNet: 0 },
  }
}
