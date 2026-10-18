import { describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ inngest: { createFunction: () => ({}) } }))

const { backfillProgress } = await import('./mailbox-backfill')
const { planConnectBackfill } = await import('../../../apps/hoa/src/lib/inbox/reconnect-backfill')

describe('backfillProgress (BL-018 scope stamp)', () => {
  it('keeps the fields the UI reads and stamps the scope the import ran under', () => {
    expect(backfillProgress(120, false, 118, { scope_mode: 'address', scope_value: 'board@hoa.test' })).toEqual({
      done: 120,
      has_more: false,
      total_estimate: 118,
      scope: 'address:board@hoa.test',
    })
  })

  it('round-trips: a completed import is recognised as complete for the same scope on reconnect', () => {
    const progress = backfillProgress(50, false, 50, { scope_mode: 'all', scope_value: null })
    const now = new Date('2026-10-18T12:00:00Z')
    const base = {
      backfill_status: 'done',
      backfill_progress: progress,
      scope_mode: 'all',
      scope_value: null,
      last_synced_at: '2026-10-18T11:58:00Z',
      sync_cursor: '42',
    }
    expect(planConnectBackfill(base, now).kind).toBe('skip')
    expect(planConnectBackfill({ ...base, scope_mode: 'label', scope_value: 'HOA' }, now).kind).toBe('full')
  })
})
