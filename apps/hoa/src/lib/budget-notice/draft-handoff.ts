/**
 * Hands the finished budget notice to the communications wizard (BL-091).
 *
 * The notice page writes the subject and HTML body to this tab's
 * sessionStorage and opens /communications/new?from=budget-notice; the
 * wizard reads it back and pre-fills the message. Nothing is saved on the
 * server and nothing is sent: the board reviews it in the wizard, and the
 * normal send (with the outbound guard) is the only way it leaves.
 *
 * sessionStorage can be missing or throw (private windows, blocked site
 * data), so every access is guarded; the wizard says so when the draft
 * didn't arrive. Pure apart from the storage it is given.
 */

export const BUDGET_NOTICE_FROM = 'budget-notice'
export const BUDGET_NOTICE_DRAFT_KEY = 'hoh:budget-notice-draft'
export const BUDGET_NOTICE_WIZARD_HREF = `/communications/new?from=${BUDGET_NOTICE_FROM}`

export interface BudgetNoticeDraft {
  budgetId: string
  subject: string
  bodyHtml: string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function writeBudgetNoticeDraft(storage: StorageLike | null | undefined, draft: BudgetNoticeDraft): boolean {
  try {
    if (!storage) return false
    storage.setItem(BUDGET_NOTICE_DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readBudgetNoticeDraft(storage: StorageLike | null | undefined): BudgetNoticeDraft | null {
  try {
    const raw = storage?.getItem(BUDGET_NOTICE_DRAFT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<BudgetNoticeDraft>
    if (typeof v.subject !== 'string' || typeof v.bodyHtml !== 'string' || typeof v.budgetId !== 'string') return null
    if (!v.subject.trim() || !v.bodyHtml.trim()) return null
    return { budgetId: v.budgetId, subject: v.subject, bodyHtml: v.bodyHtml }
  } catch {
    return null
  }
}

/** window.sessionStorage, or null where reading it throws. */
export function sessionStore(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}
