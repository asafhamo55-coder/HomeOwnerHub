/**
 * Static guards on migrations/0073_online_payments.sql, for defects that only a
 * database run (CI integration) would otherwise show. Read-only text checks.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(__dirname, '../../../../../migrations/0073_online_payments.sql'), 'utf8')

describe('0073 online_payments RLS', () => {
  it('has no resident read policy on online_payments', () => {
    // The row carries processor ids, the idempotency key and the fee split, and a
    // row-level policy cannot hide columns or apply the buyer sale window
    // (auth_resident_charges_from). The resident screens read through the server.
    expect(sql).not.toMatch(/CREATE POLICY online_payments_resident_select/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS online_payments_resident_select/)
  })
})

describe('record_online_payment_success status guard', () => {
  const fn = sql.slice(sql.indexOf('FUNCTION public.record_online_payment_success'))
  const guard = /IF v_op\.status NOT IN \(([^)]*)\)/.exec(fn)

  it('accepts an attempt marked failed: a declined card can be retried on the same PaymentIntent', () => {
    expect(guard).not.toBeNull()
    expect(guard![1]).toContain("'failed'")
  })

  it('still refuses a canceled or already-reversed attempt', () => {
    expect(guard![1]).not.toMatch(/canceled|refunded|dispute/)
  })
})
