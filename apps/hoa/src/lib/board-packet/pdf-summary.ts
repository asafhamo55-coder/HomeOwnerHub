/**
 * The board packet PDF's opening page, as words and figures. Pure: the three
 * reports the packet route already computes go in, sentences come out. No
 * query, no new number: every figure is one of the inputs, or the difference
 * between two of them that the report itself prints (net change in cash).
 */

import { formatDay, formatDayRange, usd } from '@/lib/money/format'

export interface PacketPdfInput {
  associationName: string
  period: { start_date: string; end_date: string; status: string }
  balanceSheet: {
    asOfDate: string
    assets: Array<{ accountNumber: string; accountName: string; balance: number }>
    liabilities: Array<{ accountNumber: string; accountName: string; balance: number }>
    equity: Array<{ accountNumber: string; accountName: string; balance: number }>
    netIncomePtd: number
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    isBalanced: boolean
  }
  incomeStatement: {
    startDate: string
    endDate: string
    income: Array<{ accountNumber: string; accountName: string; balance: number }>
    expenses: Array<{ accountNumber: string; accountName: string; balance: number }>
    totalIncome: number
    totalExpenses: number
    netIncome: number
  }
  cashFlow: {
    startDate: string
    endDate: string
    rows: Array<{ source: string; inflow: number; outflow: number; net: number }>
    openingCash: number
    closingCash: number
    totalNet: number
  }
  /** 'YYYY-MM-DD' in the association's zone; shown as "Prepared ...". Optional. */
  preparedOn?: string
}

export interface PacketFigure {
  label: string
  value: string
  sub: string
  tone?: 'danger' | 'success'
}

export interface PacketSummary {
  periodLabel: string
  /** No entries at all were posted for the period. */
  empty: boolean
  headline: string
  sentences: string[]
  figures: PacketFigure[]
  /** Things to check, only when the figures show them. */
  flags: string[]
}

const zero = (n: number) => Math.abs(n) < 0.005

export function packetPeriodLabel(p: { start_date: string; end_date: string }): string {
  return formatDayRange(p.start_date, p.end_date)
}

/** 'manual_journal' -> 'Manual journal'. */
export function sourceLabel(s: string): string {
  const t = s.replace(/[_-]+/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

export function summarizePacket(i: PacketPdfInput): PacketSummary {
  const { balanceSheet: bs, incomeStatement: is, cashFlow: cf } = i
  const label = packetPeriodLabel(i.period)

  const noBalances = [...bs.assets, ...bs.liabilities, ...bs.equity].every((r) => zero(r.balance)) && zero(bs.totalAssets)
  const empty =
    is.income.length === 0 && is.expenses.length === 0 && zero(is.totalIncome) && zero(is.totalExpenses) && cf.rows.length === 0 && zero(cf.openingCash) && zero(cf.closingCash) && noBalances

  if (empty) {
    return {
      periodLabel: label,
      empty: true,
      headline: 'No entries have been posted for this period.',
      sentences: [
        'There is no income, no expenses and no cash movement on the books for these dates, and no balances to report.',
        'This packet will fill in as entries are posted.',
      ],
      figures: [
        { label: 'Closing cash', value: 'None', sub: 'No cash on the books' },
        { label: 'Net income', value: 'None', sub: 'Nothing posted' },
        { label: 'Total income', value: 'None', sub: 'Nothing posted' },
        { label: 'Total expenses', value: 'None', sub: 'Nothing posted' },
      ],
      flags: [],
    }
  }

  const sentences: string[] = []
  const flags: string[] = []

  if (!(zero(is.totalIncome) && zero(is.totalExpenses))) {
    const outcome = zero(is.netIncome)
      ? 'so income and expenses came out even'
      : is.netIncome > 0
        ? `leaving ${usd(is.netIncome)} more income than expenses`
        : `leaving ${usd(Math.abs(is.netIncome))} more expenses than income`
    sentences.push(`Income was ${usd(is.totalIncome)} and expenses were ${usd(is.totalExpenses)}, ${outcome}.`)
    if (is.netIncome < -0.005) flags.push(`Expenses were higher than income by ${usd(Math.abs(is.netIncome))} in this period.`)
  } else {
    sentences.push('No income or expenses were posted in this period.')
  }

  const move = cf.closingCash - cf.openingCash
  if (zero(move)) sentences.push(`Cash ended the period at ${usd(cf.closingCash)}, where it began.`)
  else sentences.push(`Cash ended the period at ${usd(cf.closingCash)}, ${move > 0 ? 'up' : 'down'} ${usd(Math.abs(move))} from ${usd(cf.openingCash)} at the start.`)

  sentences.push(`Total assets were ${usd(bs.totalAssets)} at the close of ${formatDay(bs.asOfDate)}.`)
  if (!bs.isBalanced) {
    const diff = Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity))
    flags.push(`Assets and liabilities plus equity differ by ${usd(diff)}. Worth a look before this packet is shared.`)
  }

  const headline = flags.length > 0 ? `${flags.length === 1 ? '1 item' : `${flags.length} items`} to look at in this packet.` : 'Nothing in these figures is flagged.'

  return {
    periodLabel: label,
    empty: false,
    headline,
    sentences,
    flags,
    figures: [
      { label: 'Closing cash', value: usd(cf.closingCash), sub: `Opening ${usd(cf.openingCash)}`, ...(cf.closingCash < 0 ? { tone: 'danger' as const } : {}) },
      { label: 'Net income', value: usd(is.netIncome), sub: is.netIncome < 0 ? 'A net loss' : 'For the period', tone: is.netIncome < 0 ? 'danger' : 'success' },
      { label: 'Total income', value: usd(is.totalIncome), sub: 'For the period' },
      { label: 'Total expenses', value: usd(is.totalExpenses), sub: 'For the period' },
    ],
  }
}
