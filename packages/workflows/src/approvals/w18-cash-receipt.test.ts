import { describe, expect, it } from 'vitest'
import {
  buildCashReceiptProposal,
  validateCashReceipt,
  W18_CASH_RECEIPT,
  type CashReceiptPayload,
} from './w18-cash-receipt'

const payload: CashReceiptPayload = {
  bankTransactionId: '11111111-1111-4111-8111-111111111111',
  associationId: '22222222-2222-4222-8222-222222222222',
  assessmentId: '33333333-3333-4333-8333-333333333333',
  unitId: '44444444-4444-4444-8444-444444444444',
  fiscalPeriodId: '55555555-5555-4555-8555-555555555555',
  bankFundId: '66666666-6666-4666-8666-666666666666',
  amount: 250,
  postedDate: '2026-10-01',
  memoCode: 'MPK-101-DUES',
}

const txn = {
  id: payload.bankTransactionId,
  amount: 250,
  matched_journal_entry_id: null,
  association_id: payload.associationId,
}
const assessment = {
  id: payload.assessmentId,
  association_id: payload.associationId,
  amount: 250,
  status: 'open',
}

describe('buildCashReceiptProposal', () => {
  it('produces a W18 cash-receipt proposal keyed on the bank transaction', () => {
    const p = buildCashReceiptProposal('org-1', payload)
    expect(p.actionType).toBe(W18_CASH_RECEIPT)
    expect(p.workflowId).toBe('W18')
    expect(p.subjectType).toBe('bank_transaction')
    expect(p.subjectId).toBe(payload.bankTransactionId)
    expect(p.organizationId).toBe('org-1')
    expect(p.amount).toBe(250)
    expect(p.payload).toEqual(payload)
    expect(p.summary).toContain('MPK-101-DUES')
    expect(p.summary).toContain('$250.00')
  })
})

describe('validateCashReceipt', () => {
  it('accepts an unmatched txn against an open assessment, paying it in full', () => {
    expect(validateCashReceipt(payload, txn, assessment)).toEqual({
      ok: true,
      newAssessmentStatus: 'paid',
    })
  })

  it('marks a short payment partial', () => {
    const r = validateCashReceipt(payload, txn, { ...assessment, amount: 300 })
    expect(r).toEqual({ ok: true, newAssessmentStatus: 'partial' })
  })

  it('refuses when the transaction was matched since the proposal (no double-post)', () => {
    const r = validateCashReceipt(payload, { ...txn, matched_journal_entry_id: 'je-1' }, assessment)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/already matched/)
  })

  it('refuses when the transaction no longer exists', () => {
    const r = validateCashReceipt(payload, null, assessment)
    expect(r.ok).toBe(false)
  })

  it('refuses when the transaction amount no longer equals the proposed amount', () => {
    const r = validateCashReceipt(payload, { ...txn, amount: 249.99 }, assessment)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/amount/)
  })

  it('refuses when the transaction belongs to another association', () => {
    const r = validateCashReceipt(payload, { ...txn, association_id: 'other' }, assessment)
    expect(r.ok).toBe(false)
  })

  it.each(['paid', 'waived', 'void'])('refuses when the assessment is now %s', (status) => {
    const r = validateCashReceipt(payload, txn, { ...assessment, status })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(status)
  })

  it('refuses when the assessment is gone or in another association', () => {
    expect(validateCashReceipt(payload, txn, null).ok).toBe(false)
    expect(
      validateCashReceipt(payload, txn, { ...assessment, association_id: 'other' }).ok,
    ).toBe(false)
  })
})
