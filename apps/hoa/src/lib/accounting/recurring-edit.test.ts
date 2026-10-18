import { describe, expect, it } from 'vitest'
import {
  allowedActions,
  entryTotal,
  isTemplateEntryNumber,
  RECURRING_AUDIT,
  recurringState,
  templateChanged,
  templateEntryNumber,
  validateRecurringEdit,
  type RecurringEditInput,
} from './recurring-edit'

// BL-081. `today` is the association's day, passed in — no clock read.

const OP = 'fund-op'
const RES = 'fund-res'
const accounts = [
  { id: 'cash-op', fundId: OP, isActive: true },
  { id: 'cash-res', fundId: RES, isActive: true },
  { id: 'mgmt-fee', fundId: null, isActive: true },
  { id: 'old', fundId: null, isActive: false },
]
const ctx = { accounts, fundIds: [OP, RES], today: '2026-10-18' }

const good = (over: Partial<RecurringEditInput> = {}): RecurringEditInput => ({
  memo: 'Management fee',
  cadence: 'monthly',
  nextRunDate: '2026-11-01',
  lines: [
    { accountId: 'mgmt-fee', fundId: OP, debit: 1250, credit: 0 },
    { accountId: 'cash-op', fundId: OP, debit: 0, credit: 1250 },
  ],
  ...over,
})

describe('validateRecurringEdit', () => {
  it('accepts a balanced entry on accounts in the association', () => {
    expect(validateRecurringEdit(good(), ctx)).toEqual({})
  })

  it('accepts the association’s today, refuses the day before', () => {
    expect(validateRecurringEdit(good({ nextRunDate: '2026-10-18' }), ctx)).toEqual({})
    expect(validateRecurringEdit(good({ nextRunDate: '2026-10-17' }), ctx)).toEqual({ nextRunDate: 'Pick today or a later date.' })
  })

  it('refuses a date that does not exist', () => {
    expect(validateRecurringEdit(good({ nextRunDate: '2026-02-30' }), ctx).nextRunDate).toBe('Pick a date.')
  })

  it('refuses unbalanced lines, to the cent', () => {
    const r = validateRecurringEdit(
      good({ lines: [{ accountId: 'mgmt-fee', fundId: OP, debit: 1250.01, credit: 0 }, { accountId: 'cash-op', fundId: OP, debit: 0, credit: 1250 }] }),
      ctx,
    )
    expect(r).toEqual({ lines: 'Debits (1250.01) and credits (1250.00) must be equal.' })
  })

  it('accepts float sums that are equal in cents', () => {
    const r = validateRecurringEdit(
      good({
        lines: [
          { accountId: 'mgmt-fee', fundId: OP, debit: 0.1, credit: 0 },
          { accountId: 'mgmt-fee', fundId: OP, debit: 0.2, credit: 0 },
          { accountId: 'cash-op', fundId: OP, debit: 0, credit: 0.3 },
        ],
      }),
      ctx,
    )
    expect(r).toEqual({})
  })

  it('refuses an entry that balances overall but not per fund', () => {
    const r = validateRecurringEdit(
      good({ lines: [{ accountId: 'mgmt-fee', fundId: OP, debit: 100, credit: 0 }, { accountId: 'cash-res', fundId: RES, debit: 0, credit: 100 }] }),
      ctx,
    )
    expect(r.lines).toMatch(/Each fund must balance/)
  })

  it('refuses an account from another association, an inactive one, and a fund mismatch', () => {
    const r = validateRecurringEdit(
      good({
        lines: [
          { accountId: 'someone-elses', fundId: OP, debit: 10, credit: 0 },
          { accountId: 'old', fundId: OP, debit: 0, credit: 5 },
          { accountId: 'cash-res', fundId: OP, debit: 0, credit: 5 },
        ],
      }),
      ctx,
    )
    expect(r['lines.0.account']).toMatch(/chart of accounts/)
    expect(r['lines.1.account']).toMatch(/inactive/)
    expect(r['lines.2.fund']).toMatch(/different fund/)
    // Line problems first; the balance check waits for them.
    expect(r.lines).toBeUndefined()
  })

  it('refuses a line with both or neither side', () => {
    const r = validateRecurringEdit(
      good({ lines: [{ accountId: 'mgmt-fee', fundId: OP, debit: 5, credit: 5 }, { accountId: 'cash-op', fundId: OP, debit: 0, credit: 0 }] }),
      ctx,
    )
    expect(Object.keys(r).sort()).toEqual(['lines.0.amount', 'lines.1.amount'])
  })

  it('needs two lines, a memo and a known cadence', () => {
    expect(validateRecurringEdit(good({ lines: [good().lines[0]] }), ctx).lines).toBe('An entry needs at least two lines.')
    expect(validateRecurringEdit(good({ memo: '   ' }), ctx).memo).toBe('Enter a description.')
    expect(validateRecurringEdit(good({ cadence: 'hourly' }), ctx).cadence).toBe('Choose how often it repeats.')
  })
})

describe('recurringState / allowedActions', () => {
  it('active rules can be paused or stopped', () => {
    expect(recurringState(true, RECURRING_AUDIT.stopped)).toBe('active') // re-made from the ledger
    expect(allowedActions('active')).toEqual(['pause', 'stop'])
  })
  it('an inactive rule is paused unless its newest lifecycle row says stopped', () => {
    expect(recurringState(false, null)).toBe('paused')
    expect(recurringState(false, RECURRING_AUDIT.paused)).toBe('paused')
    expect(recurringState(false, RECURRING_AUDIT.stopped)).toBe('stopped')
    expect(allowedActions('paused')).toEqual(['resume', 'stop'])
    expect(allowedActions('stopped')).toEqual([])
  })
})

describe('templates', () => {
  it('a new template only when the memo or lines change', () => {
    const before = { memo: 'Management fee', lines: good().lines }
    expect(templateChanged(before, { memo: ' Management fee ', lines: good().lines.map((l) => ({ ...l })) })).toBe(false)
    expect(templateChanged(before, { memo: 'Management fee', lines: [{ ...good().lines[0], debit: 1300 }, { ...good().lines[1], credit: 1300 }] })).toBe(true)
    expect(templateChanged(before, { memo: 'Mgmt fee', lines: good().lines })).toBe(true)
    expect(templateChanged(before, { memo: 'Management fee', lines: [{ ...good().lines[0], accountId: 'cash-res' }, good().lines[1]] })).toBe(true)
  })

  it('edited templates are numbered off the ledger sequence', () => {
    const n = templateEntryNumber('abcdef12-3456-4789-8abc-def012345678', new Date('2026-10-18T12:00:00Z'))
    expect(n).toMatch(/^TPL-abcdef12-[0-9a-z]+$/)
    expect(isTemplateEntryNumber(n)).toBe(true)
    expect(isTemplateEntryNumber('JE-2026-00012')).toBe(false)
  })

  it('the amount is the total of the debits', () => {
    expect(entryTotal(good().lines)).toBe(1250)
  })
})
