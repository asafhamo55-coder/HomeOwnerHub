import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alertState } from '@/app/(dashboard)/events/event-dates'
import type { RecurringEvent } from '@/lib/events'

// ─── In-memory fake of the service-role client ──────────────────────────
// Supports exactly the query shapes the cron uses: a paged select
// (eq / lte / order / range / limit) and conditional updates (eq / is, then
// select('id') to learn how many rows matched). Filters are applied on
// await, against `db.rows`, so overlapping runs race the way they would
// against Postgres row-level compare-and-swap.
//
// Like PostgREST, every select response is capped at MAX_ROWS rows,
// WHATEVER range or limit is asked for. A `.limit(1000)` read of 1001 rows
// therefore returns 1000, exactly as production does (R-11).

const MAX_ROWS = 1000

type Row = Record<string, unknown> & { id: string }
type DbErr = { code: string; message: string }
type UpdateKind = 'claim' | 'stamp' | 'release' | 'roll'

interface UpdateCall {
  kind: UpdateKind
  patch: Record<string, unknown>
  matched: number
}

const db = {
  rows: [] as Row[],
  failSelect: null as null | DbErr,
  /** Runs before an update is applied; return an error to fail it, or mutate db.rows to race it. */
  beforeUpdate: null as null | ((call: { kind: UpdateKind; patch: Record<string, unknown> }) => DbErr | void),
  updates: [] as UpdateCall[],
}

// What the route's update is, from its patch: roll moves event_date; stamp
// sets last_alert_sent_for; claim sets last_alert_sent_at to a value; release
// restores it, matched on the claim's own timestamp.
function kindOf(patch: Record<string, unknown>, eqs: Record<string, unknown>): UpdateKind {
  if ('event_date' in patch) return 'roll'
  if ('last_alert_sent_for' in patch) return 'stamp'
  if ('event_date' in eqs) return 'claim'
  return 'release'
}

function builder() {
  const filters: Array<(r: Row) => boolean> = []
  const eqs: Record<string, unknown> = {}
  let mode: 'select' | 'update' = 'select'
  let patch: Record<string, unknown> = {}
  let range: [number, number] | null = null
  let limit: number | null = null
  const b = {
    select: () => b,
    update: (p: Record<string, unknown>) => {
      mode = 'update'
      patch = p
      return b
    },
    eq: (col: string, val: unknown) => {
      eqs[col] = val
      filters.push((r) => r[col] === val)
      return b
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val)
      return b
    },
    lte: (col: string, val: string) => {
      filters.push((r) => String(r[col]) <= val)
      return b
    },
    order: () => b,
    limit: (n: number) => {
      limit = n
      return b
    },
    range: (from: number, to: number) => {
      range = [from, to]
      return b
    },
    then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
      try {
        if (mode === 'select') {
          if (db.failSelect) return resolve({ data: null, error: db.failSelect })
          let out = db.rows
            .filter((r) => filters.every((f) => f(r)))
            .sort((a, c) => (a.id < c.id ? -1 : 1))
          if (range) out = out.slice(range[0], range[1] + 1)
          if (limit !== null) out = out.slice(0, limit)
          out = out.slice(0, MAX_ROWS) // the server cap
          return resolve({ data: out.map((r) => ({ ...r })), error: null })
        }
        const kind = kindOf(patch, eqs)
        const err = db.beforeUpdate?.({ kind, patch })
        if (err) {
          db.updates.push({ kind, patch, matched: 0 })
          return resolve({ data: null, error: err })
        }
        const hit = db.rows.filter((r) => filters.every((f) => f(r)))
        for (const r of hit) Object.assign(r, patch)
        db.updates.push({ kind, patch, matched: hit.length })
        return resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
      } catch (e) {
        reject(e)
      }
    },
  }
  return b
}

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn(() => builder()) })),
}))

const sendEventAlertEmail = vi.fn()
vi.mock('@/lib/events-alerts', () => ({
  sendEventAlertEmail: (...args: unknown[]) => sendEventAlertEmail(...args),
}))

import { GET } from './route'

const TODAY = '2026-10-16'
const SECRET = 's3cret'
const BEARER = `Bearer ${SECRET}`

const req = (auth?: string, query = '') =>
  new Request(`https://hoa.test/api/cron/recurring-events${query}`, {
    headers: auth ? { authorization: auth } : {},
  })

function event(over: Partial<Row> = {}): Row {
  return {
    id: 'evt-1',
    organization_id: 'org-1',
    association_id: null,
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
    created_at: '2025-01-01T00:00:00Z',
    ...over,
  }
}

const updatesOf = (kind: UpdateKind) => db.updates.filter((u) => u.kind === kind)
const failKind = (kind: UpdateKind, err: DbErr) => {
  db.beforeUpdate = (c) => (c.kind === kind ? err : undefined)
}

describe('GET /api/cron/recurring-events', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(`${TODAY}T14:00:00Z`), toFake: ['Date'] })
    vi.stubEnv('CRON_SECRET', SECRET)
    db.rows = []
    db.failSelect = null
    db.beforeUpdate = null
    db.updates = []
    sendEventAlertEmail.mockReset()
    sendEventAlertEmail.mockResolvedValue({ sent: 1, failed: [] })
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    errSpy.mockRestore()
  })

  // ─── RC-7 / RC-1: bearer only, fail closed, envelope ─────────────────

  it('fails closed with a 503 not_configured envelope when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const res = await GET(req(BEARER))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('not_configured')
    expect(sendEventAlertEmail).not.toHaveBeenCalled()
  })

  it('answers a missing or wrong bearer with the 401 envelope', async () => {
    for (const r of [req(), req('Bearer nope')]) {
      const res = await GET(r)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.code).toBe('unauthenticated')
      expect(typeof body.error.message).toBe('string')
    }
  })

  it('no longer accepts the secret in the query string', async () => {
    db.rows = [event()]
    const res = await GET(req(undefined, `?key=${SECRET}`))
    expect(res.status).toBe(401)
    expect(sendEventAlertEmail).not.toHaveBeenCalled()
  })

  // ─── RC-2 / RC-6: failures are generic envelopes, no raw text ─────────

  it('a failed events read is a generic 500 with no database text', async () => {
    db.failSelect = { code: '42P01', message: 'relation "hoa_recurring_events" does not exist' }
    const res = await GET(req(BEARER))
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain('"code":"internal"')
    expect(text).not.toContain('hoa_recurring_events')
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('does not exist')
  })

  it('a failed claim write sends nothing and answers non-2xx with no raw text', async () => {
    db.rows = [event()]
    failKind('claim', { code: '40001', message: 'could not serialize access for row secret@x.test' })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(500)
    expect(sendEventAlertEmail).not.toHaveBeenCalled()
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('serialize')
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('secret@x.test')
  })

  it('a failed stamp write answers 500, and the occurrence stays retryable (not shown as sent)', async () => {
    db.rows = [event()]
    failKind('stamp', { code: '08006', message: 'connection failure near jane@example.test' })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('jane@example.test')
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('jane@example.test')
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(1)
    expect(db.rows[0]!.last_alert_sent_for).toBeNull()
    expect(alertState(db.rows[0] as unknown as RecurringEvent, TODAY).kind).toBe('due')
  })

  it('a failed release write answers 500, and the lease still expires so the next run retries', async () => {
    db.rows = [event()]
    sendEventAlertEmail.mockResolvedValue({ sent: 0, failed: [] })
    failKind('release', { code: '08006', message: 'connection failure' })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(500)
    expect(updatesOf('release')).toHaveLength(1)
    expect(db.rows[0]!.last_alert_sent_for).toBeNull()

    // Next day: the stale claim is reclaimed and the alert goes out.
    db.beforeUpdate = null
    sendEventAlertEmail.mockResolvedValue({ sent: 1, failed: [] })
    vi.setSystemTime(new Date('2026-10-17T14:00:00Z'))
    const next = await GET(req(BEARER))
    expect(next.status).toBe(200)
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(2)
    expect(db.rows[0]!.last_alert_sent_for).toBe('2026-10-20')
  })

  it('a failed roll-forward write answers 500 with no raw text, and leaves the date', async () => {
    db.rows = [event({ event_date: '2026-10-10', last_alert_sent_for: '2026-10-10' })]
    failKind('roll', { code: '23514', message: 'violates check constraint "hoa_recurring_events_chk"' })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('constraint')
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('constraint')
    expect(db.rows[0]!.event_date).toBe('2026-10-10')
  })

  // ─── X-01: lease-claim before send, release on failure, no PII ───────

  it('claims the occurrence, sends, stamps it, and reports camelCase counts', async () => {
    db.rows = [event()]
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ processed: 1, alertsSent: 1, errors: [] })
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(1)
    expect(db.updates.map((u) => u.kind)).toEqual(['claim', 'stamp'])
    expect(db.rows[0]!.last_alert_sent_for).toBe('2026-10-20')
  })

  it('the claim alone never marks the occurrence as sent', async () => {
    db.rows = [event()]
    let stateDuringSend: string | undefined
    sendEventAlertEmail.mockImplementation(async () => {
      stateDuringSend = alertState(db.rows[0] as unknown as RecurringEvent, TODAY).kind
      return { sent: 1, failed: [] }
    })
    await GET(req(BEARER))
    expect(stateDuringSend).toBe('due')
  })

  it('overlapping runs send an occurrence exactly once', async () => {
    db.rows = [event()]
    const [a, b] = await Promise.all([GET(req(BEARER)), GET(req(BEARER))])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(1)
  })

  it("skips an occurrence another run claimed minutes ago (live lease)", async () => {
    db.rows = [event({ last_alert_sent_at: '2026-10-16T13:58:00.000Z' })]
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(sendEventAlertEmail).not.toHaveBeenCalled()
  })

  it('an invocation that dies after claiming strands nothing: the next run sends', async () => {
    db.rows = [event()]
    // Run 1 claims, then hangs in the send until the platform kills it.
    sendEventAlertEmail.mockImplementationOnce(() => new Promise(() => {}))
    void GET(req(BEARER))
    await vi.waitFor(() => expect(sendEventAlertEmail).toHaveBeenCalledTimes(1))
    expect(updatesOf('claim')[0]!.matched).toBe(1)
    // Abandoned mid-send: the event page does not claim it was sent.
    expect(alertState(db.rows[0] as unknown as RecurringEvent, TODAY).kind).toBe('due')

    // Tomorrow's run reclaims the stale lease and delivers.
    vi.setSystemTime(new Date('2026-10-17T14:00:00Z'))
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(2)
    expect(db.rows[0]!.last_alert_sent_for).toBe('2026-10-20')
  })

  it('skips an occurrence that is already alerted', async () => {
    db.rows = [event({ last_alert_sent_for: '2026-10-20' })]
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(sendEventAlertEmail).not.toHaveBeenCalled()
  })

  it('releases the claim when nothing was delivered, and the summary carries no email or provider text', async () => {
    db.rows = [event({ last_alert_sent_at: '2025-10-13T14:00:00.000Z', last_alert_sent_for: '2025-10-20' })]
    sendEventAlertEmail.mockResolvedValue({
      sent: 0,
      failed: [{ email: 'jane@example.test', reason: 'Resend: domain example.test not verified' }],
    })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    const body = await res.json()
    const text = JSON.stringify(body)
    expect(text).not.toContain('jane@example.test')
    expect(text).not.toContain('not verified')
    expect(body.errors).toEqual([{ eventId: 'evt-1', code: 'delivery_failed', count: 1 }])
    // Released to exactly what was there, so tomorrow's run retries.
    expect(db.rows[0]!.last_alert_sent_for).toBe('2025-10-20')
    expect(db.rows[0]!.last_alert_sent_at).toBe('2025-10-13T14:00:00.000Z')
  })

  it('releases the claim when the send throws, without leaking the thrown text', async () => {
    db.rows = [event()]
    sendEventAlertEmail.mockRejectedValue(new Error('boom for bob@example.test'))
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('bob@example.test')
    expect(text).toContain('send_failed')
    expect(db.rows[0]!.last_alert_sent_for).toBeNull()
    expect(db.rows[0]!.last_alert_sent_at).toBeNull()
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('bob@example.test')
  })

  // ─── X-01: annual roll-forward ───────────────────────────────────────

  it('rolls an already-alerted annual event forward once its date has passed', async () => {
    // Alerted 7 days ahead of 2026-10-10; the date has now passed.
    db.rows = [event({ event_date: '2026-10-10', last_alert_sent_for: '2026-10-10' })]
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(db.rows[0]!.event_date).toBe('2027-10-10')
    expect(sendEventAlertEmail).not.toHaveBeenCalled()
  })

  it('sends a late alert for a passed, never-alerted annual occurrence before rolling it', async () => {
    // alert_days_before = 0 and yesterday's run was missed (an outage).
    db.rows = [event({ event_date: '2026-10-15', alert_days_before: 0 })]
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(1)
    expect(sendEventAlertEmail.mock.calls[0]![0].event.event_date).toBe('2026-10-15')
    expect(db.rows[0]!.last_alert_sent_for).toBe('2026-10-15')
    expect(db.rows[0]!.event_date).toBe('2027-10-15')
    expect(db.updates.map((u) => u.kind)).toEqual(['claim', 'stamp', 'roll'])
  })

  it('sends the same late alert for a passed one-time event, and does not roll it', async () => {
    db.rows = [event({ recurrence: 'none', event_date: '2026-10-15', alert_days_before: 0 })]
    await GET(req(BEARER))
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(1)
    expect(db.rows[0]!.event_date).toBe('2026-10-15')
  })

  it('keeps a passed annual date when the late alert could not be attempted, so the next run retries it', async () => {
    db.rows = [event({ event_date: '2026-10-15', alert_days_before: 0 })]
    sendEventAlertEmail.mockRejectedValue(new Error('boom'))
    await GET(req(BEARER))
    expect(db.rows[0]!.event_date).toBe('2026-10-15')
    expect(updatesOf('roll')).toHaveLength(0)
  })

  // ─── Refutation: roll / mark alerted only when delivery succeeded ────

  it('does NOT roll a passed annual occurrence when every send failed (sent=0, res.ok=false)', async () => {
    db.rows = [event({ event_date: '2026-10-15', alert_days_before: 0 })]
    sendEventAlertEmail.mockResolvedValue({
      sent: 0,
      failed: [{ email: 'jane@example.test', reason: 'Resend 500' }],
    })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.errors).toEqual([{ eventId: 'evt-1', code: 'delivery_failed', count: 1 }])
    expect(JSON.stringify(body)).not.toContain('jane@example.test')
    // Still the missed occurrence, still un-alerted: tomorrow retries it.
    expect(db.rows[0]!.event_date).toBe('2026-10-15')
    expect(db.rows[0]!.last_alert_sent_for).toBeNull()
    expect(db.rows[0]!.last_alert_sent_at).toBeNull()
    expect(updatesOf('roll')).toHaveLength(0)
    expect(updatesOf('stamp')).toHaveLength(0)
    expect(alertState(db.rows[0] as unknown as RecurringEvent, TODAY).kind).not.toBe('sent')
  })

  it('does NOT roll or mark alerted when nothing was delivered and nothing failed (no recipients)', async () => {
    db.rows = [event({ event_date: '2026-10-15', alert_days_before: 0 })]
    sendEventAlertEmail.mockResolvedValue({ sent: 0, failed: [] })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Visible in the summary instead of silently "fine".
    expect(body.errors).toEqual([{ eventId: 'evt-1', code: 'nothing_delivered' }])
    expect(body.alertsSent).toBe(0)
    expect(db.rows[0]!.event_date).toBe('2026-10-15')
    expect(db.rows[0]!.last_alert_sent_for).toBeNull()
    expect(updatesOf('roll')).toHaveLength(0)
  })

  it('a failed delivery today followed by a successful one tomorrow sends, then rolls', async () => {
    db.rows = [event({ event_date: '2026-10-15', alert_days_before: 0 })]
    sendEventAlertEmail.mockResolvedValueOnce({ sent: 0, failed: [{ email: 'x@example.test', reason: 'down' }] })
    await GET(req(BEARER))
    expect(db.rows[0]!.event_date).toBe('2026-10-15')

    vi.setSystemTime(new Date('2026-10-17T14:00:00Z'))
    sendEventAlertEmail.mockResolvedValueOnce({ sent: 1, failed: [] })
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(sendEventAlertEmail).toHaveBeenCalledTimes(2)
    expect(db.rows[0]!.last_alert_sent_for).toBe('2026-10-15')
    expect(db.rows[0]!.event_date).toBe('2027-10-15')
  })

  it('a partial delivery (some sent, some failed) counts as delivered: stamps, rolls, reports the failures', async () => {
    db.rows = [event({ event_date: '2026-10-15', alert_days_before: 0 })]
    sendEventAlertEmail.mockResolvedValue({ sent: 2, failed: [{ email: 'x@example.test', reason: 'bounce' }] })
    const res = await GET(req(BEARER))
    const body = await res.json()
    expect(body.alertsSent).toBe(2)
    expect(body.errors).toEqual([{ eventId: 'evt-1', code: 'delivery_failed', count: 1 }])
    expect(db.rows[0]!.last_alert_sent_for).toBe('2026-10-15')
    expect(db.rows[0]!.event_date).toBe('2027-10-15')
  })

  it('rolls a years-stale annual event to its next occurrence on or after today', async () => {
    db.rows = [event({ event_date: '2024-10-20', last_alert_sent_for: '2024-10-20' })]
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(db.rows[0]!.event_date).toBe('2026-10-20')
  })

  it('roll-forward is compare-and-swap: a run that lost the race does not move the date again', async () => {
    db.rows = [event({ event_date: '2026-10-10', last_alert_sent_for: '2026-10-10' })]
    // Another run rolls the row between our read and our update.
    db.beforeUpdate = (c) => {
      if (c.kind === 'roll') db.rows[0]!.event_date = '2027-10-10'
    }
    const res = await GET(req(BEARER))
    expect(res.status).toBe(200)
    expect(updatesOf('roll')).toEqual([expect.objectContaining({ matched: 0 })])
    expect(db.rows[0]!.event_date).toBe('2027-10-10')
  })

  it('overlapping runs roll an annual event exactly once', async () => {
    db.rows = [event({ event_date: '2026-10-10', last_alert_sent_for: '2026-10-10' })]
    await Promise.all([GET(req(BEARER)), GET(req(BEARER))])
    expect(updatesOf('roll').filter((u) => u.matched > 0)).toHaveLength(1)
    expect(db.rows[0]!.event_date).toBe('2027-10-10')
  })

  it('does not roll a one-time event', async () => {
    db.rows = [event({ recurrence: 'none', event_date: '2026-10-10', last_alert_sent_for: '2026-10-10' })]
    await GET(req(BEARER))
    expect(db.rows[0]!.event_date).toBe('2026-10-10')
  })
})
