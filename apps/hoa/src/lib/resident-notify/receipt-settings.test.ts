import { describe, expect, it } from 'vitest'
import {
  PAYMENT_RECEIPTS_KEY,
  paymentReceiptsOn,
  readPaymentReceiptSettings,
  signPaymentReceiptSettings,
  withPaymentReceiptSettings,
} from './receipt-settings'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const SECRET = 'secret'
const stamp = { updatedAt: '2026-10-20T00:00:00Z', updatedBy: 'board-1' }

describe('payment receipt setting (BL-114)', () => {
  it('nothing saved is OFF', () => {
    expect(readPaymentReceiptSettings(A, {}, SECRET)).toEqual({ state: 'not_configured' })
    expect(paymentReceiptsOn(A, {}, SECRET)).toBe(false)
    expect(paymentReceiptsOn(A, null, SECRET)).toBe(false)
  })

  it('a signed ON round-trips', () => {
    const cs = { [PAYMENT_RECEIPTS_KEY]: signPaymentReceiptSettings(A, { emailOnRecord: true }, stamp, SECRET) }
    expect(readPaymentReceiptSettings(A, cs, SECRET)).toMatchObject({ state: 'configured', settings: { emailOnRecord: true } })
    expect(paymentReceiptsOn(A, cs, SECRET)).toBe(true)
  })

  it('a hand-edited value, a value copied from another association, or no secret reads as OFF', () => {
    const stored = signPaymentReceiptSettings(A, { emailOnRecord: false }, stamp, SECRET)
    const flipped = { [PAYMENT_RECEIPTS_KEY]: { ...stored, email_on_record: true } }
    expect(readPaymentReceiptSettings(A, flipped, SECRET).state).toBe('unverified')
    expect(paymentReceiptsOn(A, flipped, SECRET)).toBe(false)

    const on = { [PAYMENT_RECEIPTS_KEY]: signPaymentReceiptSettings(A, { emailOnRecord: true }, stamp, SECRET) }
    expect(paymentReceiptsOn(B, on, SECRET)).toBe(false)
    expect(paymentReceiptsOn(A, on, null)).toBe(false)
    expect(paymentReceiptsOn(A, { [PAYMENT_RECEIPTS_KEY]: true }, SECRET)).toBe(false)
  })

  it('a write keeps every other compliance_settings key', () => {
    const stored = signPaymentReceiptSettings(A, { emailOnRecord: true }, stamp, SECRET)
    const next = withPaymentReceiptSettings({ pay_by_zelle: { x: 1 }, resident_notifications: { y: 2 } }, stored)
    expect(next).toEqual({ pay_by_zelle: { x: 1 }, resident_notifications: { y: 2 }, [PAYMENT_RECEIPTS_KEY]: stored })
  })
})
