import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dateSpan, dedupeKey, planImport, storedCents } from './dedupe'
import { parseStatement, type ParsedTxn } from './parse'

const here = path.dirname(fileURLToPath(import.meta.url))

function rowsOf(name: string): ParsedTxn[] {
  const r = parseStatement(readFileSync(path.join(here, 'fixtures', name), 'utf8'))
  if (!r.ok) throw new Error(r.error)
  return r.rows
}

const t = (postedDate: string, amountCents: number, description: string, line = 1): ParsedTxn => ({ line, postedDate, amountCents, description })

describe('dedupe by date, amount and description', () => {
  it('the key ignores case, punctuation and spacing in the description', () => {
    expect(dedupeKey('2026-10-03', -120_000, 'ACME LANDSCAPING, LLC')).toBe(dedupeKey('2026-10-03', -120_000, 'acme  landscaping llc'))
    expect(dedupeKey('2026-10-03', -120_000, 'ACME')).not.toBe(dedupeKey('2026-10-04', -120_000, 'ACME'))
    expect(dedupeKey('2026-10-03', -120_000, 'ACME')).not.toBe(dedupeKey('2026-10-03', -120_001, 'ACME'))
  })

  it('stored numeric dollars become exact cents', () => {
    expect(storedCents('312.47')).toBe(31_247)
    expect(storedCents(0.29)).toBe(29)
    expect(storedCents('-1200.00')).toBe(-120_000)
  })

  it('re-importing the same statement inserts nothing', () => {
    const rows = rowsOf('chase-style.csv')
    const stored = rows.map((r) => ({ posted_date: r.postedDate, amount: (r.amountCents / 100).toFixed(2), memo: r.description, merchant: null }))
    const plan = planImport(rows, stored)
    expect(plan.toInsert).toEqual([])
    expect(plan.duplicates).toHaveLength(rows.length)
  })

  it('an overlapping statement imports only the rows not already stored', () => {
    const rows = rowsOf('chase-style.csv')
    const stored = rows.slice(0, 2).map((r) => ({ posted_date: r.postedDate, amount: r.amountCents / 100, memo: r.description.toLowerCase(), merchant: null }))
    const plan = planImport(rows, stored)
    expect(plan.duplicates.map((r) => r.line)).toEqual([2, 3])
    expect(plan.toInsert.map((r) => r.line)).toEqual([4, 5, 6])
  })

  it('counts: two identical checks in the file, one stored, imports one', () => {
    const rows = [t('2026-10-05', -2500, 'CHECK', 2), t('2026-10-05', -2500, 'CHECK', 3)]
    const plan = planImport(rows, [{ posted_date: '2026-10-05', amount: -25, memo: 'CHECK', merchant: null }])
    expect(plan.duplicates.map((r) => r.line)).toEqual([2])
    expect(plan.toInsert.map((r) => r.line)).toEqual([3])
  })

  it('two identical rows with nothing stored are both new', () => {
    const plan = planImport([t('2026-10-05', -2500, 'CHECK', 2), t('2026-10-05', -2500, 'CHECK', 3)], [])
    expect(plan.toInsert).toHaveLength(2)
  })

  it('matches a Plaid row on its merchant, its memo, or both together', () => {
    const plan = planImport(
      [t('2026-10-01', 100, 'Acme'), t('2026-10-01', 200, 'ref 9'), t('2026-10-01', 300, 'Acme ref 9')],
      [
        { posted_date: '2026-10-01', amount: 1, memo: 'something else', merchant: 'ACME' },
        { posted_date: '2026-10-01', amount: 2, memo: 'REF 9', merchant: 'Other' },
        { posted_date: '2026-10-01', amount: 3, memo: 'Ref 9', merchant: 'Acme' },
      ],
    )
    expect(plan.toInsert).toEqual([])
  })

  it('a stored row is used up once even when it matches on two keys', () => {
    const plan = planImport(
      [t('2026-10-01', 100, 'Acme', 1), t('2026-10-01', 100, 'Acme', 2)],
      [{ posted_date: '2026-10-01', amount: 1, memo: 'Acme', merchant: 'Acme' }],
    )
    expect(plan.duplicates).toHaveLength(1)
    expect(plan.toInsert).toHaveLength(1)
  })

  it('dateSpan covers the file', () => {
    expect(dateSpan(rowsOf('preamble-running-balance.csv'))).toEqual({ from: '2026-10-02', to: '2026-10-20' })
    expect(dateSpan([])).toBeNull()
  })
})
