import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { flushReport, record, recorded } from './report'

describe('report', () => {
  it('records findings and appends them to the step summary once', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'bl103-')), 'summary.md')
    record('ACH', 'us_bank_account is not enabled in Checkout')
    expect(recorded()).toEqual(['- **ACH:** us_bank_account is not enabled in Checkout'])
    flushReport('checkout', file)
    expect(readFileSync(file, 'utf8')).toBe('\n### Stripe sandbox: checkout\n\n- **ACH:** us_bank_account is not enabled in Checkout\n')
    expect(recorded()).toEqual([])
    flushReport('again', file) // nothing new: nothing appended
    expect(readFileSync(file, 'utf8').match(/###/g)).toHaveLength(1)
  })
})
