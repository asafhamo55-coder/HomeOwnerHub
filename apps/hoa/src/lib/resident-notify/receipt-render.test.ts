import { describe, expect, it } from 'vitest'
import { balanceLabel, receiptMethodLabel, renderPaymentReceiptEmail } from './receipt-render'

const base = {
  associationName: 'Maple <Court>',
  amount: 1200,
  paidDay: '2026-01-05',
  method: 'zelle_assisted',
  propertyLabel: '12 Oak St · Unit 4',
  balance: 0,
  portalUrl: 'https://app.test/resident/dues/ledger',
}

describe('renderPaymentReceiptEmail (BL-114)', () => {
  it('states the amount, date, method, property, balance and the ledger link', () => {
    const r = renderPaymentReceiptEmail(base)
    expect(r.subject).toBe('Payment received: $1,200.00')
    expect(r.text).toContain('Amount: $1,200.00')
    expect(r.text).toContain('Date: Jan 5, 2026')
    expect(r.text).toContain('Paid by: Zelle')
    expect(r.text).toContain('Property: 12 Oak St · Unit 4')
    expect(r.text).toContain('Remaining balance: $0.00')
    expect(r.text).toContain('https://app.test/resident/dues/ledger')
    expect(r.html).toContain('View your ledger')
  })

  it('escapes the association name in HTML', () => {
    const r = renderPaymentReceiptEmail(base)
    expect(r.html).toContain('Maple &lt;Court&gt;')
    expect(r.html).not.toContain('Maple <Court>')
  })

  it('an unreadable balance points to the portal instead of guessing', () => {
    const r = renderPaymentReceiptEmail({ ...base, balance: null })
    expect(r.text).not.toContain('Remaining balance')
    expect(r.text).toContain('Your current balance is in your ledger')
  })

  it('labels a credit and an unknown method plainly', () => {
    expect(balanceLabel(-25)).toBe('$25.00 credit')
    expect(receiptMethodLabel('other')).toBe('Recorded by the board')
    expect(receiptMethodLabel(null)).toBe('Recorded by the board')
    expect(receiptMethodLabel('check')).toBe('Check')
  })
})
