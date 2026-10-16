import { describe, expect, it } from 'vitest'
import { backfillBanner } from './backfill-banner'
import type { MailboxStatus } from './queries'

function status(over: Partial<MailboxStatus> = {}): MailboxStatus {
  return {
    id: 'acct-1',
    emailAddress: 'board@example.test',
    scopeMode: 'all',
    scopeValue: null,
    syncStatus: 'ok',
    syncError: null,
    lastSyncedAt: null,
    backfillStatus: 'done',
    backfillDone: 0,
    backfillTotalEstimate: null,
    ...over,
  }
}

describe('backfillBanner', () => {
  it('is hidden when the import is complete', () => {
    expect(backfillBanner({ kind: 'loaded', status: status({ backfillStatus: 'done' }) }, true)).toBeNull()
  })

  it('shows "N of ~M" while running', () => {
    const b = backfillBanner(
      { kind: 'loaded', status: status({ backfillStatus: 'running', backfillDone: 1240, backfillTotalEstimate: 5300 }) },
      true,
    )!
    expect(b.variant).toBe('info')
    expect(b.title).toBe('Importing history — 1,240 of ~5,300')
    expect(b.percent).toBe(23)
  })

  it('never claims a total it has already passed (the estimate is only an estimate)', () => {
    const b = backfillBanner(
      { kind: 'loaded', status: status({ backfillStatus: 'running', backfillDone: 6000, backfillTotalEstimate: 5300 }) },
      true,
    )!
    expect(b.title).toBe('Importing history — 6,000 so far')
    expect(b.percent).toBeNull()
  })

  it('shows a count without a total before the first page reports an estimate', () => {
    const b = backfillBanner(
      { kind: 'loaded', status: status({ backfillStatus: 'running', backfillDone: 0, backfillTotalEstimate: null }) },
      true,
    )!
    expect(b.title).toBe('Importing history — 0 so far')
    expect(b.percent).toBeNull()
  })

  it('pending reads as starting, not as complete', () => {
    const b = backfillBanner({ kind: 'loaded', status: status({ backfillStatus: 'pending' }) }, true)!
    expect(b.variant).toBe('info')
    expect(b.title).toBe('Importing history — starting')
  })

  it('failure points an admin to Settings', () => {
    const b = backfillBanner({ kind: 'loaded', status: status({ backfillStatus: 'failed' }) }, true)!
    expect(b.variant).toBe('error')
    expect(b.title).toBe('Import failed — retry from Settings')
    expect(b.action).toEqual({ href: '/settings/mailbox', label: 'Open mailbox settings' })
  })

  it('failure tells a board member who can fix it instead of linking to an admin-only page', () => {
    const b = backfillBanner({ kind: 'loaded', status: status({ backfillStatus: 'failed' }) }, false)!
    expect(b.variant).toBe('error')
    expect(b.action).toBeNull()
    expect(b.body).toMatch(/admin/i)
  })

  it('a failed status read says so — it neither hides the banner nor claims the import is done', () => {
    const b = backfillBanner({ kind: 'failed' }, true)!
    expect(b.variant).toBe('warning')
    expect(b.title).toBe('Couldn’t check the mailbox status')
    expect(b.body).toMatch(/import|sync/i)
  })
})
