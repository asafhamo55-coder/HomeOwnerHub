import type { EditLine, RecurringState } from '@/lib/accounting/recurring-edit'

/** One recurring rule as /accounting/recurring shows it (BL-081). */
export interface RecurringRuleView {
  id: string
  cadence: string
  nextRunDate: string
  state: RecurringState
  template: {
    id: string
    entryNumber: string
    memo: string
    lines: EditLine[]
    /** An edited template (a draft, never posted) rather than a ledger entry. */
    edited: boolean
  } | null
}

export interface AccountOption {
  id: string
  label: string
  /** The account's own fund, when it has one. */
  fundId: string | null
}

export interface FundOption {
  id: string
  label: string
}

export interface RecurringOptions {
  /** The association's calendar day, YYYY-MM-DD. */
  today: string
  accounts: AccountOption[]
  funds: FundOption[]
  /** False when the accounts or funds didn't load: Edit is not offered. */
  editable: boolean
}
