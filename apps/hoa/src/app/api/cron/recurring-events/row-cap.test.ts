import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb, rangesFor } from '@/lib/supabase/capped-fake-db'

/**
 * BL-053: the daily recurring-events worklist was one `.limit(1000)` read
 * across EVERY org (service role). Past 1000 active events in the 90-day
 * window, the rest were never looked at — their alerts never went out and
 * annual events never rolled forward. The fake caps responses at 1000 like
 * PostgREST's max_rows. No email is sent: the alert sender is mocked.
 */
let db: SupabaseClient
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => db }))
const sendEventAlertEmail = vi.fn(async () => ({ sent: 1, failed: [] as { email: string; reason: string }[] }))
vi.mock('@/lib/events-alerts', () => ({
  sendEventAlertEmail,
  countFailedAlertAttempts: async () => ({ ok: true, count: 0 }),
  notifyBoardAlertGaveUp: async () => ({ ok: true, notified: 0 }),
}))

const { GET } = await import('./route')

const SECRET = 'test-cron-secret'
// Pinned (BL-065): the cron judges each event on its association day, so a
// wall-clock UTC "today" would be tomorrow for Eastern after 8pm.
const today = '2026-10-15'
const NOW = new Date('2026-10-15T16:00:00Z')
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`
const events = Array.from({ length: 2345 }, (_, i) => ({
  id: id('ev', i),
  organization_id: 'org-1',
  association_id: 'assoc-1',
  title: 't',
  description: null,
  event_date: today,
  recurrence: 'none',
  alert_days_before: 0,
  notify_channels: ['email'],
  notify_audience: 'board',
  last_alert_sent_at: null,
  last_alert_sent_for: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}))
const call = () => GET(new Request('http://localhost/api/cron/recurring-events', { headers: { authorization: `Bearer ${SECRET}` } }))

describe('recurring-events cron worklist', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    vi.stubEnv('CRON_SECRET', SECRET)
    sendEventAlertEmail.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('processes every due event, not the first 1000', async () => {
    const fake = cappedFakeDb({ hoa_recurring_events: events })
    db = fake.db
    const res = await call()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { processed: number; alertsSent: number }
    expect(body.processed).toBe(2345)
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(2345)
    expect(rangesFor(fake.calls, 'hoa_recurring_events').length).toBeGreaterThan(2)
  })

  it('a failed later page sends nothing and is a 500', async () => {
    db = cappedFakeDb({ hoa_recurring_events: events }, { failAt: { table: 'hoa_recurring_events', from: 1000 } }).db
    const res = await call()
    expect(res.status).toBe(500)
    expect(sendEventAlertEmail).not.toHaveBeenCalled()
  })
})
