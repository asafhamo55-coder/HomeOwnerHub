import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-029: the "Main changes vs last year" paragraph. Every figure is
// computed by the app and handed to the model as finished text; the model
// only writes prose around them, and a reply that introduces a number of
// its own is thrown away. The model is mocked — no network.

const runCloud = vi.fn()
vi.mock('../agents/cloud', () => ({ runCloud: (...a: unknown[]) => runCloud(...a) }))

const { acceptBudgetNarrative, budgetNarrativeFacts, generateBudgetNarrative, MAX_BUDGET_NARRATIVE_CHARS } = await import('./budget-narrative')

const INPUT = {
  yearLabel: 'FY 2027',
  fundName: 'Operating Fund',
  inflationPct: 3,
  totals: { income: '$122,714', expense: '$53,625', net: '$69,089', priorIncome: '$120,000', priorExpense: '$51,000' },
  changes: [
    { accountName: 'Landscaping', from: '$24,000', to: '$26,883', change: '+$2,883' },
    { accountName: 'Insurance', from: '$10,000', to: '$9,682', change: '-$318' },
  ],
}

beforeEach(() => runCloud.mockReset())

describe('budgetNarrativeFacts', () => {
  it('lists the finished figures, nothing computed by the model', () => {
    const f = budgetNarrativeFacts(INPUT)
    expect(f).toContain('Budget year: FY 2027 (Operating Fund)')
    expect(f).toContain('Inflation assumption: +3%')
    expect(f).toContain('Income: $122,714 (last year budget $120,000)')
    expect(f).toContain('Landscaping: $24,000 → $26,883 (+$2,883)')
  })
})

describe('acceptBudgetNarrative', () => {
  const facts = budgetNarrativeFacts(INPUT)

  it('accepts prose that only repeats the given figures', () => {
    const ok = 'Landscaping rises to $26,883 (+$2,883), the largest change for FY 2027, while insurance eases by $318.'
    expect(acceptBudgetNarrative(ok, facts)).toBe(ok)
  })

  it('rejects a reply carrying a number that is not in the facts', () => {
    expect(acceptBudgetNarrative('Expenses rise about 5% to $53,625.', facts)).toBeNull()
    expect(acceptBudgetNarrative('Landscaping rises to $26,900.', facts)).toBeNull()
  })

  it('rejects empty and over-long replies, and strips a markdown fence', () => {
    expect(acceptBudgetNarrative('', facts)).toBeNull()
    expect(acceptBudgetNarrative(null, facts)).toBeNull()
    expect(acceptBudgetNarrative('Landscaping goes up. '.repeat(60), facts)).toBeNull()
    expect(MAX_BUDGET_NARRATIVE_CHARS).toBe(700)
    expect(acceptBudgetNarrative('```\nLandscaping goes up the most.\n```', facts)).toBe('Landscaping goes up the most.')
  })
})

describe('generateBudgetNarrative', () => {
  it('sends the facts and returns the accepted paragraph', async () => {
    runCloud.mockResolvedValue('Landscaping is the biggest change, up $2,883 to $26,883.')
    const out = await generateBudgetNarrative(INPUT)
    expect(out).toBe('Landscaping is the biggest change, up $2,883 to $26,883.')
    const [system, user] = runCloud.mock.calls[0] as [string, string]
    expect(system).toMatch(/do not calculate/i)
    expect(user).toContain('Landscaping: $24,000 → $26,883 (+$2,883)')
  })

  it('returns null when the model invents a figure', async () => {
    runCloud.mockResolvedValue('Overall spending grows 4.6%.')
    expect(await generateBudgetNarrative(INPUT)).toBeNull()
  })
})
