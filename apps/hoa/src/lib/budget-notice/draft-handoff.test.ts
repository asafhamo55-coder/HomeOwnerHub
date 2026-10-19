import { describe, expect, it } from 'vitest'
import { BUDGET_NOTICE_DRAFT_KEY, BUDGET_NOTICE_WIZARD_HREF, readBudgetNoticeDraft, writeBudgetNoticeDraft } from './draft-handoff'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('budget notice hand-off to the wizard', () => {
  const draft = { budgetId: 'b1', subject: 'Annual budget', bodyHtml: '<p>x</p>' }

  it('round-trips through storage', () => {
    const s = memory()
    expect(writeBudgetNoticeDraft(s, draft)).toBe(true)
    expect(readBudgetNoticeDraft(s)).toEqual(draft)
    expect(BUDGET_NOTICE_WIZARD_HREF).toBe('/communications/new?from=budget-notice')
  })

  it('no storage, throwing storage, junk or empty drafts read as missing', () => {
    expect(writeBudgetNoticeDraft(null, draft)).toBe(false)
    expect(readBudgetNoticeDraft(null)).toBeNull()
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(writeBudgetNoticeDraft(throwing, draft)).toBe(false)
    expect(readBudgetNoticeDraft(throwing)).toBeNull()
    const s = memory()
    s.setItem(BUDGET_NOTICE_DRAFT_KEY, '{not json')
    expect(readBudgetNoticeDraft(s)).toBeNull()
    s.setItem(BUDGET_NOTICE_DRAFT_KEY, JSON.stringify({ ...draft, bodyHtml: '  ' }))
    expect(readBudgetNoticeDraft(s)).toBeNull()
  })
})
