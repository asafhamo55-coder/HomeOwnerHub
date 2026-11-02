import { describe, expect, it } from 'vitest'
import type { NecCandidate } from './model'
import { addressLines, build1099Rows, form1099Csv, tinLast4 } from './form1099'

const cand = (o: Partial<NecCandidate>): NecCandidate => ({
  vendorId: 'v1', vendorName: 'Acme Lawn', dba: null, payments: 3, totalCents: 250_000, cardCents: 0,
  firstDay: '2026-01-01', lastDay: '2026-12-01', overHigherThreshold: true, w9OnFile: true, hasTin: true, ...o,
})

describe('1099 summary', () => {
  it('masks tax ids to the last four', () => {
    expect(tinLast4('12-3456789')).toBe('6789')
    expect(tinLast4('12')).toBeNull()
    expect(tinLast4(null)).toBeNull()
  })
  it('never puts a full tax id in the csv', () => {
    const rows = build1099Rows([cand({})], new Map([['v1', { tinLast4: tinLast4('12-3456789'), address: null }]]))
    const csv = form1099Csv(rows, 2026)
    expect(csv).toContain('***-**-6789')
    expect(csv).not.toContain('3456789')
  })
  it('takes card payments out of box 1a and applies the 2,000 dollar floor', () => {
    const [r] = build1099Rows([cand({ totalCents: 250_000, cardCents: 100_000 })], new Map())
    expect(r.box1aCents).toBe(150_000)
    expect(r.meetsThreshold).toBe(false)
    const [r2] = build1099Rows([cand({ totalCents: 200_000 })], new Map())
    expect(r2.meetsThreshold).toBe(true)
  })
  it('formats an address', () => {
    expect(addressLines({ line1: '1 Main', city: 'Atlanta', state: 'GA', postal_code: '30301' })).toEqual(['1 Main', 'Atlanta GA 30301'])
    expect(addressLines(null)).toEqual([])
  })
})
