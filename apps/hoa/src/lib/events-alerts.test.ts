import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecurringEvent } from '@/lib/events'

// BL-056: lib/events-alerts.ts checks every write's error (logged by code
// and ids only), stores a short error CODE in communication_recipients —
// never provider text, which can carry an address — and exposes the
// helpers the cron's retry cap uses.

// ─── Fake admin client ───────────────────────────────────────────────
// Every call is recorded as { table, op, payload, filters }. A result per
// `${table}.${op}` (op: select | insert | update) can be set, or a function
// of the call.

type DbErr = { code: string; message: string }
type Result = { data?: unknown; error: DbErr | null; count?: number | null }
interface Call {
  table: string
  op: string
  payload?: unknown
  filters: Array<[string, string, unknown]>
  selectOpts?: unknown
}
let calls: Call[] = []
let results: Record<string, Result | ((c: Call) => Result)> = {}

function chain(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  calls.push(call)
  const resolve = (): Result => {
    const r = results[`${table}.${call.op}`]
    if (typeof r === 'function') return r(call)
    return r ?? { data: null, error: null }
  }
  const c: Record<string, unknown> = {}
  c.select = (_cols?: string, opts?: unknown) => {
    if (opts) call.selectOpts = opts
    return c
  }
  for (const m of ['eq', 'gte', 'in', 'is', 'neq']) {
    c[m] = (col: string, v: unknown) => {
      call.filters.push([m, col, v])
      return c
    }
  }
  for (const m of ['order', 'limit']) c[m] = () => c
  for (const m of ['insert', 'update']) {
    c[m] = (payload: unknown) => {
      call.op = m
      call.payload = payload
      return c
    }
  }
  c.maybeSingle = async () => resolve()
  c.single = async () => resolve()
  c.then = (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onOk, onErr)
  return c
}
const admin = { from: chain }

vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => admin }))
vi.mock('@homeowner-portal/observability/outbound-guard', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchOrgSandbox: vi.fn(async () => null),
}))
// Mock senders only: nothing here can reach a real provider.
const sendEmail = vi.fn()
const sendSms = vi.fn()
vi.mock('@/lib/email', () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  appUrl: (p: string) => `https://hoa.test${p}`,
}))
vi.mock('@/lib/sms', () => ({
  sendSms: (...a: unknown[]) => sendSms(...a),
  htmlToSmsBody: (s: string) => s,
}))
vi.mock('@/lib/email/sender-name', () => ({ buildSenderName: (n: string) => n }))
const resolveAudience = vi.fn()
vi.mock('@/lib/communications/audience', () => ({
  resolveAudience: (...a: unknown[]) => resolveAudience(...a),
  fetchBoardMembers: vi.fn(async () => []),
  stripAudienceForPersist: (a: unknown) => a,
}))

import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  ALERT_FAILED_NOTIFICATION_KIND,
  countFailedAlertAttempts,
  deliveryErrorCode,
  notifyBoardAlertGaveUp,
  sendEventAlertEmail,
} from './events-alerts'

const PROVIDER_LEAK = 'Resend 422: invalid `to` field jane@example.com'
const DB_LEAK = 'insert or update on table violates foreign key for jane@example.com'

const event: RecurringEvent = {
  id: 'evt-1',
  title: 'Annual meeting',
  description: null,
  event_date: '2026-10-20',
  recurrence: 'annual',
  alert_days_before: 7,
  notify_channels: ['email'],
  notify_audience: { kind: 'board' },
  last_alert_sent_at: null,
  last_alert_sent_for: null,
  is_active: true,
  association_id: 'assoc-1',
  created_at: '2025-01-01T00:00:00Z',
}

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
const logged = () => JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls])
const updatesOf = (table: string) => calls.filter((c) => c.table === table && c.op === 'update')

beforeEach(() => {
  calls = []
  results = {
    'associations.select': { data: { name: 'Maple', type: 'hoa' }, error: null },
    'communications.insert': { data: { id: 'comm-1' }, error: null },
    'communication_recipients.insert': {
      data: [{ id: 'rec-1', channel: 'email', email: 'jane@example.com', phone: null }],
      error: null,
    },
  }
  resolveAudience.mockReset()
  resolveAudience.mockResolvedValue({
    recipients: [
      { unitId: 'u-1', unitAddress: null, unitNumber: null, recipientName: 'Jane', email: 'jane@example.com', phone: null, userId: 'user-1' },
    ],
    summary: 'Board (1)',
  })
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ ok: true, messageId: 'msg-1' })
  sendSms.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('deliveryErrorCode', () => {
  it('maps provider text to a short code', () => {
    expect(deliveryErrorCode('email', PROVIDER_LEAK)).toBe('email_provider_error')
    expect(deliveryErrorCode('sms', 'Non White-listed Destination')).toBe('sms_provider_error')
    expect(deliveryErrorCode('email', OUTBOUND_BLOCKED_ERROR)).toBe('outbound_blocked')
    expect(deliveryErrorCode('email', 'EMAIL_FROM is not configured.')).toBe('email_not_configured')
    expect(deliveryErrorCode('sms', 'VONAGE_FROM_NUMBER is not configured.')).toBe('sms_not_configured')
  })
})

describe('sendEventAlertEmail — recipient error codes', () => {
  it('stores a short code in communication_recipients, never the provider text', async () => {
    sendEmail.mockResolvedValue({ ok: false, error: PROVIDER_LEAK })
    const r = await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(r.sent).toBe(0)
    const recUpdate = updatesOf('communication_recipients')[0]!
    expect(recUpdate.payload).toMatchObject({ delivery_status: 'failed', error_message: 'email_provider_error' })
    expect(JSON.stringify(calls)).not.toContain('invalid `to` field')
    expect(r.failed.map((f) => f.reason)).toEqual(['email_provider_error'])
    expect(logged()).not.toContain('jane@example.com')
  })

  it('a guard-blocked send is stored as outbound_blocked', async () => {
    sendEmail.mockResolvedValue({ ok: false, error: OUTBOUND_BLOCKED_ERROR })
    await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(updatesOf('communication_recipients')[0]!.payload).toMatchObject({ error_message: 'outbound_blocked' })
  })
})

describe('sendEventAlertEmail — every write checks its error', () => {
  const dbErr = { code: '08006', message: DB_LEAK }

  it('a failed recipient status write is logged by code and ids, never the message', async () => {
    results['communication_recipients.update'] = { data: null, error: dbErr }
    const r = await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(r.sent).toBe(1) // the email went out; only the status write failed
    expect(logged()).toContain('08006')
    expect(logged()).toContain('rec-1')
    expect(logged()).not.toContain('jane@example.com')
  })

  it('a failed communications status write is logged', async () => {
    results['communications.update'] = { data: null, error: dbErr }
    await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(logged()).toContain('08006')
    expect(logged()).toContain('comm-1')
    expect(logged()).not.toContain('jane@example.com')
  })

  it('a failed communications insert is logged and still falls back to a direct send', async () => {
    results['communications.insert'] = { data: null, error: dbErr }
    const r = await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
    expect(logged()).toContain('08006')
    expect(logged()).not.toContain('foreign key')
  })

  it('a failed recipients insert is logged, marks the communication failed, and still sends directly', async () => {
    results['communication_recipients.insert'] = { data: null, error: dbErr }
    const r = await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(logged()).toContain('08006')
    expect(logged()).not.toContain('foreign key')
    expect(updatesOf('communications').map((c) => c.payload)).toContainEqual(expect.objectContaining({ status: 'failed' }))
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
  })

  it('a failed event stamp is logged', async () => {
    results['hoa_recurring_events.update'] = { data: null, error: dbErr }
    await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(logged()).toContain('08006')
    expect(logged()).toContain('evt-1')
  })

  it('a failed status write on the no-deliverable-recipient path is logged', async () => {
    resolveAudience.mockResolvedValue({
      recipients: [{ unitId: 'u-1', unitAddress: null, unitNumber: null, recipientName: 'X', email: null, phone: null, userId: null }],
      summary: 'x',
    })
    results['communications.update'] = { data: null, error: dbErr }
    const r = await sendEventAlertEmail({ event, organizationId: 'org-1' })
    expect(r.sent).toBe(0)
    expect(logged()).toContain('08006')
  })
})

describe('countFailedAlertAttempts', () => {
  it("counts this event's failed communications since the occurrence's window opened", async () => {
    results['communications.select'] = { data: null, error: null, count: 2 }
    const r = await countFailedAlertAttempts(admin as never, {
      eventId: 'evt-1',
      organizationId: 'org-1',
      sinceIso: '2026-10-13',
    })
    expect(r).toEqual({ ok: true, count: 2 })
    const q = calls.find((c) => c.table === 'communications')!
    expect(q.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'organization_id', 'org-1'],
        ['eq', 'related_resource->>type', 'recurring_event'],
        ['eq', 'related_resource->>id', 'evt-1'],
        ['eq', 'status', 'failed'],
        ['gte', 'created_at', '2026-10-13T00:00:00Z'],
      ]),
    )
  })

  it('reports a read failure instead of a zero', async () => {
    results['communications.select'] = { data: null, error: { code: '57014', message: DB_LEAK }, count: null }
    const r = await countFailedAlertAttempts(admin as never, { eventId: 'evt-1', organizationId: 'org-1', sinceIso: '2026-10-13' })
    expect(r.ok).toBe(false)
  })
})

describe('notifyBoardAlertGaveUp', () => {
  const args = { event, organizationId: 'org-1', attempts: 3, sinceIso: '2026-10-13' }

  it('notifies every board member and admin once, linking to the event', async () => {
    results['org_members.select'] = { data: [{ user_id: 'b-1' }, { user_id: 'a-1' }], error: null }
    results['notifications.select'] = { data: [], error: null }
    const r = await notifyBoardAlertGaveUp(admin as never, args)
    expect(r).toEqual({ ok: true, notified: 2 })
    const ins = calls.find((c) => c.table === 'notifications' && c.op === 'insert')!
    const rows = ins.payload as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      organization_id: 'org-1',
      kind: ALERT_FAILED_NOTIFICATION_KIND,
      entity_type: 'recurring_event',
      entity_id: 'evt-1',
      link: '/events/evt-1',
    })
    expect(String(rows[0]!.title)).toContain('Annual meeting')
  })

  it('does not notify again for the same occurrence', async () => {
    results['org_members.select'] = { data: [{ user_id: 'b-1' }], error: null }
    results['notifications.select'] = {
      data: [{ id: 'n-1', user_id: 'b-1', created_at: '2026-10-15T14:00:00Z' }],
      error: null,
    }
    const r = await notifyBoardAlertGaveUp(admin as never, args)
    expect(r).toEqual({ ok: true, notified: 0 })
    expect(calls.some((c) => c.table === 'notifications' && c.op !== 'select')).toBe(false)
  })

  it("re-surfaces last occurrence's (read) notification as unread instead of a duplicate insert", async () => {
    results['org_members.select'] = { data: [{ user_id: 'b-1' }], error: null }
    results['notifications.select'] = {
      data: [{ id: 'n-1', user_id: 'b-1', created_at: '2025-10-15T14:00:00Z' }],
      error: null,
    }
    const r = await notifyBoardAlertGaveUp(admin as never, args)
    expect(r).toEqual({ ok: true, notified: 1 })
    const upd = calls.find((c) => c.table === 'notifications' && c.op === 'update')!
    expect(upd.payload).toMatchObject({ read_at: null })
    expect(upd.filters).toContainEqual(['eq', 'id', 'n-1'])
    expect(calls.some((c) => c.table === 'notifications' && c.op === 'insert')).toBe(false)
  })

  it('a concurrent duplicate (23505) is the desired end state, not a failure', async () => {
    results['org_members.select'] = { data: [{ user_id: 'b-1' }], error: null }
    results['notifications.select'] = { data: [], error: null }
    results['notifications.insert'] = { data: null, error: { code: '23505', message: 'dup' } }
    const r = await notifyBoardAlertGaveUp(admin as never, args)
    expect(r.ok).toBe(true)
  })

  it('reports any other failure', async () => {
    results['org_members.select'] = { data: null, error: { code: '57014', message: DB_LEAK } }
    const r = await notifyBoardAlertGaveUp(admin as never, args)
    expect(r.ok).toBe(false)
  })
})
