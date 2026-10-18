import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INFLATION_PCT,
  buildBudgetDraft,
  isReserveContribution,
  mainChanges,
  parseInflationPct,
  type DraftSource,
} from './budget-draft'

// BL-029: the draft is computed in code, line by line, with the reason
// spelled out. These pin the arithmetic and the wording the board reads.

const acct = (id: string, number: string, name: string, type: 'income' | 'expense') => ({ id, number, name, type })

const SOURCE: DraftSource = {
  accounts: [
    acct('dues', '4000', 'Assessment Income', 'income'),
    acct('late', '4100', 'Late Fee Income', 'income'),
    acct('land', '5000', 'Landscaping', 'expense'),
    acct('ins', '5020', 'Insurance', 'expense'),
    acct('legal', '5050', 'Professional Fees', 'expense'),
    acct('resv', '5800', 'Reserve Contribution', 'expense'),
    acct('bank', '5900', 'Bank Fees', 'expense'),
  ],
  priorBudget: { dues: 120_000, land: 24_000, ins: 10_000, resv: 15_000, legal: 2_000 },
  actuals: { dues: 118_500, land: 26_100, ins: 9_400, resv: 9_000, late: 640 },
  actualMonths: 12,
  reserveAccountIds: ['resv'],
}

const line = (d: ReturnType<typeof buildBudgetDraft>, id: string) => d.lines.find((l) => l.accountId === id)!

describe('buildBudgetDraft', () => {
  const d = buildBudgetDraft(SOURCE, 3)

  it('starts from the actual trailing 12 months, +3%, in whole dollars', () => {
    expect(line(d, 'land').suggested).toBe(26_883) // 26,100 × 1.03
    expect(line(d, 'land').basis).toBe('actual')
    expect(line(d, 'land').explanation).toBe('Last year budget $24,000, actual $26,100, +3%')
  })

  it('uses the prior budget where there were no actuals', () => {
    expect(line(d, 'legal').basis).toBe('prior_budget')
    expect(line(d, 'legal').suggested).toBe(2_060)
    expect(line(d, 'legal').explanation).toBe('Last year budget $2,000, no activity in the last 12 months, +3%')
  })

  it('an account with actuals but no prior budget line still gets a line', () => {
    expect(line(d, 'late').priorBudget).toBeNull()
    expect(line(d, 'late').suggested).toBe(659)
    expect(line(d, 'late').explanation).toBe('No budget last year, actual $640, +3%')
  })

  it('an account with neither is a blank line the board fills in', () => {
    expect(line(d, 'bank').basis).toBe('none')
    expect(line(d, 'bank').suggested).toBe(0)
    expect(line(d, 'bank').explanation).toBe('No budget or activity last year — enter an amount')
  })

  it('keeps the reserve contribution at least at last year’s level', () => {
    // Actual 9,000 × 1.03 = 9,270 would cut reserves; held at 15,000.
    expect(line(d, 'resv').suggested).toBe(15_000)
    expect(line(d, 'resv').reserveFloor).toBe(true)
    expect(line(d, 'resv').explanation).toBe(
      'Last year budget $15,000, actual $9,000, +3% = $9,270; kept at last year’s $15,000 (reserve contributions don’t go down in a draft)',
    )
  })

  it('a reserve contribution above last year is not capped', () => {
    const up = buildBudgetDraft({ ...SOURCE, actuals: { ...SOURCE.actuals, resv: 16_000 } }, 3)
    expect(line(up, 'resv').suggested).toBe(16_480)
    expect(line(up, 'resv').reserveFloor).toBe(false)
  })

  it('totals are the sum of the suggested lines, with last year’s budget beside them', () => {
    const income = 122_055 + 659
    const expense = 26_883 + 9_682 + 2_060 + 15_000 + 0
    expect(d.totals).toEqual({
      income,
      expense,
      net: income - expense,
      priorIncome: 120_000,
      priorExpense: 51_000,
    })
  })

  it('lines are in account-number order, income first', () => {
    expect(d.lines.map((l) => l.accountNumber)).toEqual(['4000', '4100', '5000', '5020', '5050', '5800', '5900'])
  })

  it('a different inflation rate moves every line and says so', () => {
    const z = buildBudgetDraft(SOURCE, 0)
    expect(line(z, 'land').suggested).toBe(26_100)
    expect(line(z, 'land').explanation).toBe('Last year budget $24,000, actual $26,100, +0%')
    const five = buildBudgetDraft(SOURCE, 5.5)
    expect(line(five, 'ins').suggested).toBe(9_917) // 9,400 × 1.055 = 9,917
    expect(line(five, 'ins').explanation).toContain('+5.5%')
  })

  it('annualizes a short history and says how many months it saw', () => {
    const short = buildBudgetDraft({ ...SOURCE, actualMonths: 6, actuals: { land: 13_000 } }, 3)
    expect(line(short, 'land').suggested).toBe(26_780) // 13,000 × 2 × 1.03
    expect(line(short, 'land').explanation).toBe('Last year budget $24,000, actual $13,000 over 6 months (about $26,000 a year), +3%')
  })

  it('negative activity counts as $0 rather than a negative budget', () => {
    const neg = buildBudgetDraft({ ...SOURCE, actuals: { ...SOURCE.actuals, legal: -300 } }, 3)
    expect(line(neg, 'legal').suggested).toBe(0)
    expect(line(neg, 'legal').explanation).toBe('Last year budget $2,000, actual -$300 (counted as $0), +3%')
  })

  it('with no prior budget and no actuals it reports that, and every line is blank', () => {
    const blank = buildBudgetDraft({ ...SOURCE, priorBudget: {}, actuals: {}, actualMonths: 0 }, 3)
    expect(blank.hasPriorData).toBe(false)
    expect(blank.lines.every((l) => l.suggested === 0 && l.basis === 'none')).toBe(true)
    expect(d.hasPriorData).toBe(true)
  })

  it('ignores actuals for accounts outside this fund’s list', () => {
    const extra = buildBudgetDraft({ ...SOURCE, actuals: { ...SOURCE.actuals, stranger: 999 } }, 3)
    expect(extra.lines.find((l) => l.accountId === 'stranger')).toBeUndefined()
  })
})

describe('parseInflationPct', () => {
  it('accepts 0–20 with up to one decimal, defaulting to 3', () => {
    expect(DEFAULT_INFLATION_PCT).toBe(3)
    expect(parseInflationPct('3')).toBe(3)
    expect(parseInflationPct(' 4.5 ')).toBe(4.5)
    expect(parseInflationPct('0')).toBe(0)
    expect(parseInflationPct('20')).toBe(20)
  })
  it('refuses anything else', () => {
    for (const bad of ['', '-1', '21', 'abc', '3.25', '1e1']) expect(parseInflationPct(bad), bad).toBeNull()
  })
})

describe('isReserveContribution', () => {
  it('matches contribution and transfer accounts by name', () => {
    expect(isReserveContribution({ name: 'Reserve Contribution', type: 'expense' }, 'operating')).toBe(true)
    expect(isReserveContribution({ name: 'Transfer to Reserves', type: 'expense' }, 'operating')).toBe(true)
    expect(isReserveContribution({ name: 'Contribution to reserve fund', type: 'expense' }, 'operating')).toBe(true)
  })
  it('counts reserve-fund income except interest', () => {
    expect(isReserveContribution({ name: 'Reserve Assessments', type: 'income' }, 'reserve')).toBe(true)
    expect(isReserveContribution({ name: 'Interest Income', type: 'income' }, 'reserve')).toBe(false)
  })
  it('leaves spending from reserves alone', () => {
    expect(isReserveContribution({ name: 'Reserve Expenditures', type: 'expense' }, 'reserve')).toBe(false)
    expect(isReserveContribution({ name: 'Landscaping', type: 'expense' }, 'operating')).toBe(false)
  })
})

describe('mainChanges', () => {
  it('lists the largest moves against last year’s budget, biggest first', () => {
    const d = buildBudgetDraft(SOURCE, 3)
    expect(mainChanges(d.lines, 3)).toEqual([
      { accountName: 'Landscaping', accountType: 'expense', from: 24_000, to: 26_883, change: 2_883 },
      { accountName: 'Assessment Income', accountType: 'income', from: 120_000, to: 122_055, change: 2_055 },
      { accountName: 'Late Fee Income', accountType: 'income', from: 0, to: 659, change: 659 },
    ])
  })
  it('skips lines that did not move', () => {
    const d = buildBudgetDraft({ ...SOURCE, actuals: {} }, 0)
    expect(mainChanges(d.lines)).toEqual([])
  })
})
