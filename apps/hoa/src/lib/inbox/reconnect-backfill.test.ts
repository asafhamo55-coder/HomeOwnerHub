import { describe, expect, it } from 'vitest'
import { backfillScopeStamp, planConnectBackfill, type ConnectBackfillAccount } from './reconnect-backfill'

const NOW = new Date('2026-10-18T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const completed = (over: Partial<ConnectBackfillAccount> = {}): ConnectBackfillAccount => ({
  backfill_status: 'done',
  backfill_progress: { done: 4200, has_more: false, total_estimate: 4100, scope: backfillScopeStamp('address', 'board@hoa.test') },
  scope_mode: 'address',
  scope_value: 'board@hoa.test',
  last_synced_at: daysAgo(1),
  sync_cursor: '987654',
  ...over,
})

describe('planConnectBackfill', () => {
  it('a brand-new account gets the full 12-month backfill', () => {
    expect(
      planConnectBackfill(
        { backfill_status: 'pending', backfill_progress: null, scope_mode: 'all', scope_value: null, last_synced_at: null, sync_cursor: null },
        NOW,
      ),
    ).toEqual({ kind: 'full', reason: 'not_complete' })
  })

  it('complete + same scope + recent sync: skipped — the 2-minute sync resumes from the history id', () => {
    expect(planConnectBackfill(completed(), NOW)).toEqual({ kind: 'skip', reason: 'incremental' })
  })

  it('complete before the scope stamp existed: treated as unchanged scope', () => {
    expect(planConnectBackfill(completed({ backfill_progress: { done: 10, has_more: false } }), NOW)).toEqual({
      kind: 'skip',
      reason: 'incremental',
    })
  })

  it('complete but the scope changed since: full backfill under the new scope', () => {
    expect(planConnectBackfill(completed({ scope_mode: 'label', scope_value: 'HOA' }), NOW)).toEqual({
      kind: 'full',
      reason: 'scope_changed',
    })
  })

  it('complete, long gap (history id likely expired): a bounded window from the last sync, a day of overlap', () => {
    expect(planConnectBackfill(completed({ last_synced_at: daysAgo(40) }), NOW)).toEqual({
      kind: 'bounded',
      reason: 'long_gap',
      afterDate: '2026/09/07',
    })
  })

  it('a gap longer than the backfill horizon is capped at 12 months', () => {
    expect(planConnectBackfill(completed({ last_synced_at: daysAgo(800) }), NOW)).toEqual({
      kind: 'bounded',
      reason: 'long_gap',
      afterDate: '2025/10/18',
    })
  })

  it('complete but never synced (no cursor or no last sync): bounded is impossible, so full', () => {
    expect(planConnectBackfill(completed({ last_synced_at: null }), NOW)).toEqual({ kind: 'full', reason: 'no_sync_point' })
    expect(planConnectBackfill(completed({ sync_cursor: null }), NOW)).toEqual({ kind: 'full', reason: 'no_sync_point' })
  })

  it('failed: full backfill, so a broken import can still be recovered by reconnecting', () => {
    expect(planConnectBackfill(completed({ backfill_status: 'failed' }), NOW)).toEqual({ kind: 'full', reason: 'not_complete' })
  })

  it('wedged (stuck at running): full backfill — reconnect must keep rescuing it', () => {
    expect(
      planConnectBackfill(completed({ backfill_status: 'running', backfill_progress: { done: 300, has_more: true } }), NOW),
    ).toEqual({ kind: 'full', reason: 'not_complete' })
  })
})
