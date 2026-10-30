import { describe, expect, it } from 'vitest'
import { duesRowStatus } from './row-status'

const TODAY = '2026-10-30'
const row = (over: Partial<Parameters<typeof duesRowStatus>[0]>) => ({ status: 'pending', amount: 100, paid: 0, dueDate: '2026-11-05', ...over })

describe('duesRowStatus', () => {
  it('Paid is success', () => {
    expect(duesRowStatus(row({ status: 'paid', paid: 100 }), TODAY)).toMatchObject({ kind: 'paid', tone: 'success', label: 'Paid' })
  })
  it('Due is warning, including due today', () => {
    expect(duesRowStatus(row({}), TODAY)).toMatchObject({ kind: 'due', tone: 'warning', label: 'Due' })
    expect(duesRowStatus(row({ dueDate: TODAY }), TODAY).kind).toBe('due')
  })
  it('Late is danger and says how many days', () => {
    expect(duesRowStatus(row({ dueDate: '2026-10-29' }), TODAY)).toMatchObject({ kind: 'late', tone: 'danger', label: 'Late · 1 day' })
    expect(duesRowStatus(row({ dueDate: '2026-10-20', status: 'partial', paid: 40 }), TODAY).label).toBe('Late · 10 days · part paid')
  })
  it('Credit is info when payments exceed the charge', () => {
    expect(duesRowStatus(row({ status: 'paid', paid: 130 }), TODAY)).toMatchObject({ kind: 'credit', tone: 'info', label: 'Credit' })
  })
  it('a part-paid charge not yet late is Due', () => {
    expect(duesRowStatus(row({ status: 'partial', paid: 40 }), TODAY)).toMatchObject({ kind: 'due', label: 'Due · part paid' })
  })
  it('waived stays neutral, even when old', () => {
    expect(duesRowStatus(row({ status: 'waived', dueDate: '2026-01-01' }), TODAY)).toMatchObject({ kind: 'waived', tone: 'neutral' })
  })
  it('the late boundary is by calendar day across fall back', () => {
    expect(duesRowStatus(row({ dueDate: '2026-10-31' }), '2026-11-01').kind).toBe('late')
  })
})
