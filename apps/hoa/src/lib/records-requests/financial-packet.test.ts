import { describe, expect, it } from 'vitest'
import { adoptedForYear, packetYears, statementMonth, statementsForYear } from './financial-packet'

describe('packetYears', () => {
  it('the last three fiscal years that have ended, most recent first; a year in progress never counts', () => {
    const periods = [
      { start_date: '2023-07-01', end_date: '2024-06-30' },
      { start_date: '2026-07-01', end_date: '2027-06-30' },
      { start_date: '2025-07-01', end_date: '2026-06-30' },
      { start_date: '2022-07-01', end_date: '2023-06-30' },
      { start_date: '2024-07-01', end_date: '2025-06-30' },
    ]
    const ys = packetYears(periods, '2026-10-26')
    expect(ys.map((y) => y.end)).toEqual(['2026-06-30', '2025-06-30', '2024-06-30'])
    expect(ys.every((y) => !y.calendar)).toBe(true)
  })

  it('a year ending today is not finalized yet', () => {
    expect(packetYears([{ start_date: '2026-01-01', end_date: '2026-10-26' }], '2026-10-26')[0]!.calendar).toBe(true)
  })

  it('fewer than three on record: only those; none: the three calendar years before', () => {
    expect(packetYears([{ start_date: '2025-01-01', end_date: '2025-12-31' }], '2026-10-26')).toHaveLength(1)
    const cal = packetYears([], '2027-01-04')
    expect(cal.map((y) => [y.start, y.end, y.calendar])).toEqual([
      ['2026-01-01', '2026-12-31', true],
      ['2025-01-01', '2025-12-31', true],
      ['2024-01-01', '2024-12-31', true],
    ])
  })
})

describe('bank statements in Documents', () => {
  it('reads the month from common file names', () => {
    expect(statementMonth('Bank statement 2025-03.pdf')).toBe('2025-03')
    expect(statementMonth('stmt_2025_3.pdf')).toBe('2025-03')
    expect(statementMonth('Statement 03-2025')).toBe('2025-03')
    expect(statementMonth('Truist statement March 2025')).toBe('2025-03')
    expect(statementMonth('Sept 2025 bank')).toBe('2025-09')
    expect(statementMonth('Bank statements 2025')).toBeNull()
    expect(statementMonth('Statement 2025-13')).toBeNull()
  })

  it('picks the year’s statements, counts months, and masks account numbers', () => {
    const docs = [
      { id: '1', name: 'Bank statement 2025-01 acct 123456789' },
      { id: '2', name: 'Bank statement 2025-02' },
      { id: '3', name: 'Bank statement 2025-02 (copy)' },
      { id: '4', name: 'Bank statement 2024-12' },
      { id: '5', name: 'Bylaws 2025' },
      { id: '6', name: 'Bank statements 2025 all' },
    ]
    const st = statementsForYear(docs, { start: '2025-01-01', end: '2025-12-31' })
    expect(st.docs.map((d) => d.id)).toEqual(['1', '2', '3', '6'])
    expect(st.monthsFound).toBe(2)
    expect(st.monthsInYear).toBe(12)
    expect(st.docs[0]!.name).not.toContain('123456789')
  })

  it('a fiscal year across two calendar years', () => {
    const st = statementsForYear([{ id: 'a', name: 'statement 2025-07' }, { id: 'b', name: 'statement 2026-06' }, { id: 'c', name: 'statement 2026-07' }], {
      start: '2025-07-01',
      end: '2026-06-30',
    })
    expect(st.docs.map((d) => d.id)).toEqual(['a', 'b'])
    expect(st.monthsInYear).toBe(12)
  })
})

describe('adoptedForYear', () => {
  it('approved budgets for exactly that fiscal year; drafts left out', () => {
    const fp = { start_date: '2025-01-01', end_date: '2025-12-31' }
    const list = [
      { id: 'a', status: 'approved', fiscalPeriod: fp },
      { id: 'b', status: 'draft', fiscalPeriod: fp },
      { id: 'c', status: 'approved', fiscalPeriod: { start_date: '2024-01-01', end_date: '2024-12-31' } },
      { id: 'd', status: 'approved', fiscalPeriod: null },
    ]
    expect(adoptedForYear(list, { start: '2025-01-01', end: '2025-12-31' }).map((b) => b.id)).toEqual(['a'])
  })
})
