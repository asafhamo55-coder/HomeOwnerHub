import { describe, expect, it } from 'vitest'
import { csvDocument } from '../../csv'
import { AGING_MAX_FILE_BYTES, AGING_MAX_ROWS, UNMATCHED_HEADER, decodeAgingFile, parseCincAging, unmatchedRows } from './cinc-aging'
import type { BooksUnitRow } from './model'

// Fabricated fixtures only: invented streets, accounts and amounts. No
// customer file is used (BL-031 still has no real CINC export).

const u = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const UNITS: BooksUnitRow[] = [
  { id: u(1), address_line1: '12 Test Lane', unit_number: null, lot_number: '14' },
  { id: u(2), address_line1: '40 Sample Court', unit_number: '101', lot_number: null },
  { id: u(3), address_line1: '40 Sample Court', unit_number: '102', lot_number: null },
  { id: u(4), address_line1: '7 Example Way', unit_number: 'A7', lot_number: null },
  { id: u(5), address_line1: '99 Fixture Road', unit_number: null, lot_number: null },
]

const REPORT = [
  'Fabricated Community HOA',
  'Homeowner Aging Report as of 12/31/2025',
  '',
  'Account #,Homeowner Name,Property Address,Unit,Current,31-60,61-90,Over 90,Total Balance',
  '1001,Owner One,12 Test Lane,,100.00,50.00,0.00,0.00,150.00',
  '1002,Owner Two,40 Sample Court,101,"1,200.00",0.00,0.00,300.10,"1,500.10"',
  'A7,Owner Three,,,25.00,0.00,0.00,0.00,25.00',
  '1004,Owner Four,99 Fixture Road,,(40.00),0.00,0.00,0.00,(40.00)',
  '1005,Owner Five,5 Nowhere Street,,10.00,0.00,0.00,0.00,10.00',
  '1006,Owner Six,40 Sample Court,102,0.00,0.00,0.00,0.00,0.00',
  'Account #,Homeowner Name,Property Address,Unit,Current,31-60,61-90,Over 90,Total Balance',
  'Grand Total,,,,,,,,"1,645.10"',
].join('\n')

describe('parseCincAging — a CINC-style aging report', () => {
  const r = parseCincAging(REPORT, UNITS)
  if (!r.ok) throw new Error(r.error)

  it('finds the header under the report title and maps the columns, never the name', () => {
    expect(r.mapping).toEqual({ account: 0, address: 2, unit: 3, total: 8 })
    expect(r.buckets).toEqual([4, 5, 6, 7])
    expect(r.headers[1]).toBe('Homeowner Name')
  })

  it('matches by address, and by account number against a unit or lot number', () => {
    expect(r.matched.map((m) => [m.unitId, m.cents, m.via])).toEqual([
      [u(1), 15000, 'address'],
      [u(2), 150010, 'address'],
      [u(4), 2500, 'account'],
    ])
  })

  it('counts credits and zero balances, never charging them', () => {
    expect(r.credits).toBe(1)
    expect(r.zero).toBe(1)
    expect(r.totals.creditCents).toBe(4000)
  })

  it('lists the unmatched row with its reason and amount', () => {
    expect(r.unmatchedCount).toBe(1)
    expect(r.unmatched[0]).toMatchObject({ line: 9, account: '1005', address: '5 Nowhere Street', cents: 1000 })
  })

  it('skips the repeated page header and the grand total, and reconciles cents-exact', () => {
    expect(r.rowsRead).toBe(6)
    expect(r.summaryRows).toBe(1)
    expect(r.totals).toMatchObject({ matchedCents: 167510, unmatchedCents: 1000, fileCents: 164510, reportCents: 164510, reconciles: true })
  })

  it('never puts the homeowner name anywhere in the result', () => {
    const body = JSON.stringify({ ...r, headers: [] })
    expect(body).not.toContain('Owner One')
    expect(body).not.toContain('Owner Five')
  })
})

describe('parseCincAging — defensive cases', () => {
  it('flags a report total that does not match its rows', () => {
    const r = parseCincAging('Account,Property Address,Balance\n1,12 Test Lane,10.00\nTotal,,99.00', UNITS)
    expect(r.ok && r.totals.reconciles).toBe(false)
  })

  it('adds up the aging columns when there is no balance column', () => {
    const r = parseCincAging('Property Address,Current,30 Days,60 Days,90+\n12 Test Lane,0.10,0.20,,1.00', UNITS)
    expect(r.ok && r.matched[0]?.cents).toBe(130)
  })

  it('refuses a row whose aging columns disagree with its total', () => {
    const r = parseCincAging('Property Address,Current,Over 90,Balance\n12 Test Lane,1.00,1.00,3.00', UNITS)
    expect(r.ok && r.unmatched[0]?.reason).toMatch(/don’t add up/)
    expect(r.ok && r.matched).toEqual([])
  })

  it('never guesses between several homes at one address', () => {
    const r = parseCincAging('Property Address,Balance\n40 Sample Court,10.00', UNITS)
    expect(r.ok && r.unmatched[0]?.reason).toMatch(/Several homes match/)
  })

  it('refuses an account number and an address that point at different homes', () => {
    const r = parseCincAging('Account,Property Address,Balance\n14,7 Example Way,10.00', UNITS)
    expect(r.ok && r.unmatched[0]?.reason).toMatch(/different homes/)
  })

  it('lists the same home twice as unmatched (a past owner’s account)', () => {
    const r = parseCincAging('Property Address,Balance\n12 Test Lane,10.00\n12 Test Lane,5.00', UNITS)
    expect(r.ok && r.matched.length).toBe(1)
    expect(r.ok && r.unmatched[0]?.reason).toMatch(/same home as line 2/)
  })

  it('reads accountant-style amounts exactly', () => {
    const r = parseCincAging('Property Address,Balance\n12 Test Lane,$0.29\n99 Fixture Road,1234.5', UNITS)
    expect(r.ok && r.matched.map((m) => m.cents)).toEqual([29, 123450])
  })

  it('refuses an amount over the cap and one that is not a number', () => {
    const r = parseCincAging('Property Address,Balance\n12 Test Lane,20000000.00\n99 Fixture Road,abc', UNITS)
    expect(r.ok && r.unmatched.map((i) => i.reason)).toEqual(['That amount is too large. Check the number.', '“abc” isn’t an amount.'])
  })

  it('needs a heading row with a home column and a money column', () => {
    const r = parseCincAging('Name,Phone\nA,1', UNITS)
    expect(r.ok).toBe(false)
  })

  it('refuses a file with too many rows, whole', () => {
    const rows = Array.from({ length: AGING_MAX_ROWS + 30 }, (_, i) => `${i},1.00`)
    const r = parseCincAging(['Account,Balance', ...rows].join('\n'), UNITS)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/more than 5,000 rows/) })
  })

  it('takes a column choice from the preview, and refuses an invalid one', () => {
    // Unrecognised headings: refused, but the columns come back to choose from.
    const text = 'Fabricated report\nRef,Street,Owed\n1,12 Test Lane,5.00'
    expect(parseCincAging(text, UNITS)).toMatchObject({
      ok: false,
      headers: ['Ref', 'Street', 'Owed'],
      mapping: { account: -1, address: -1, unit: -1, total: -1 },
    })
    const r = parseCincAging(text, UNITS, { address: 1, total: 2 })
    expect(r.ok && r.matched[0]).toMatchObject({ unitId: u(1), cents: 500, line: 3 })
    const named = 'Account,Street,Owed,Balance\n9,12 Test Lane,5.00,'
    const m = parseCincAging(named, UNITS, { account: -1, address: 1, unit: -1, total: 2 })
    expect(m.ok && m.matched[0]).toMatchObject({ unitId: u(1), cents: 500 })
    expect(parseCincAging(named, UNITS, { address: 1, total: 1 })).toMatchObject({ ok: false })
    expect(parseCincAging(named, UNITS, { address: 99, total: 2 })).toMatchObject({ ok: false })
  })
})

describe('decodeAgingFile', () => {
  it('refuses empty, oversized and binary files', () => {
    expect(decodeAgingFile(new Uint8Array())).toMatchObject({ ok: false })
    expect(decodeAgingFile(new Uint8Array(AGING_MAX_FILE_BYTES + 1))).toMatchObject({ ok: false })
    expect(decodeAgingFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toMatchObject({ ok: false })
  })
  it('drops a BOM', () => {
    const r = decodeAgingFile(new TextEncoder().encode('﻿Account,Balance'))
    expect(r).toEqual({ ok: true, text: 'Account,Balance' })
  })
})

describe('unmatched rows download', () => {
  it('neutralises formulas from the file and keeps balances numeric', () => {
    const r = parseCincAging('Account,Property Address,Balance\n=HYPERLINK("x"),+1 Evil St,-12.00', UNITS)
    if (!r.ok) throw new Error(r.error)
    const csv = csvDocument(UNMATCHED_HEADER, unmatchedRows(r.unmatched))
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain(`'+1 Evil St`)
    expect(csv).toMatch(/,-12\r\n$/)
  })
})
