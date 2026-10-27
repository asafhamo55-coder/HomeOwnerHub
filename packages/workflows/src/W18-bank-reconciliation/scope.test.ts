import { describe, expect, it } from 'vitest'
import { checkBankTxnScope } from './index'

describe('checkBankTxnScope', () => {
  it('accepts a transaction and bank account in the run org', () => {
    expect(checkBankTxnScope('org-1', 'org-1', { organization_id: 'org-1' })).toBeNull()
  })

  it('refuses a transaction in another org', () => {
    expect(checkBankTxnScope('org-1', 'org-2', { organization_id: 'org-1' })).toMatch(/transaction/)
  })

  it('refuses a bank account in another org', () => {
    expect(checkBankTxnScope('org-1', 'org-1', { organization_id: 'org-2' })).toMatch(/bank_account/)
  })

  it('refuses a missing bank account', () => {
    expect(checkBankTxnScope('org-1', 'org-1', null)).toMatch(/bank_account/)
  })
})
