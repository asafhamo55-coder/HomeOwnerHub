import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { applySmsStatus, smsFailureMessage, smsStatusMove } from './sms-status'

// BL-146: Vonage delivery receipts. An in-memory communication_recipients
// that honours the filters the module uses (eq / is / in), so idempotency
// and forward-only moves are checked against real row state.

type Row = Record<string, unknown> & { id: string }

function fakeDb(rows: Row[], opts: { failOn?: 'update' } = {}) {
  const calls: Array<{ table: string; patch: Record<string, unknown>; filters: string[] }> = []
  const db = {
    from(table: string) {
      let patch: Record<string, unknown> = {}
      const preds: Array<(r: Row) => boolean> = []
      const filters: string[] = []
      let selecting = false
      const builder = {
        update(p: Record<string, unknown>) {
          patch = p
          return builder
        },
        eq(col: string, v: unknown) {
          filters.push(`eq:${col}`)
          preds.push((r) => r[col] === v)
          return builder
        },
        is(col: string, v: unknown) {
          filters.push(`is:${col}`)
          preds.push((r) => (r[col] ?? null) === v)
          return builder
        },
        in(col: string, vs: unknown[]) {
          filters.push(`in:${col}`)
          preds.push((r) => vs.includes(r[col]))
          return builder
        },
        select() {
          selecting = true
          return builder
        },
        then(resolve: (v: { data: unknown; error: unknown }) => void) {
          calls.push({ table, patch, filters })
          if (opts.failOn === 'update') return resolve({ data: null, error: { code: '57014', message: 'secret detail' } })
          const hit = rows.filter((r) => preds.every((p) => p(r)))
          for (const r of hit) Object.assign(r, patch)
          resolve({ data: selecting ? hit.map((r) => ({ id: r.id })) : null, error: null })
        },
      }
      return builder
    },
  }
  return { db: db as never, calls }
}

const row = (over: Partial<Row> = {}): Row => ({
  id: 'r1',
  channel: 'sms',
  external_id: 'uuid-1',
  delivery_status: 'sent',
  sent_at: '2026-10-21T10:00:00.000Z',
  delivered_at: null,
  failed_at: null,
  error_message: null,
  ...over,
})

describe('smsStatusMove', () => {
  it('maps Vonage statuses; anything else changes nothing', () => {
    expect(smsStatusMove('delivered')?.status).toBe('delivered')
    expect(smsStatusMove('DELIVERED')?.timestamp).toBe('delivered_at')
    expect(smsStatusMove('submitted')?.status).toBe('sent')
    for (const s of ['rejected', 'undeliverable', 'failed']) expect(smsStatusMove(s)?.status).toBe('failed')
    expect(smsStatusMove('read')).toBeNull()
    expect(smsStatusMove('accepted')).toBeNull()
    expect(smsStatusMove(null)).toBeNull()
  })

  it('never moves backwards: failed cannot overwrite delivered', () => {
    expect(smsStatusMove('failed')?.from).not.toContain('delivered')
    expect(smsStatusMove('delivered')?.from).not.toContain('failed')
  })
})

describe('smsFailureMessage', () => {
  it('fixed wording, with a short code only', () => {
    expect(smsFailureMessage('undeliverable', '1320')).toBe('The carrier did not deliver this text (code 1320).')
    expect(smsFailureMessage('rejected', null)).toBe('Vonage rejected this text.')
    expect(smsFailureMessage('failed', 'Number 14045551234 is barred by the operator')).toBe(
      'The carrier did not deliver this text.',
    )
  })
})

describe('applySmsStatus', () => {
  const at = '2026-10-21T10:05:00.000Z'

  it('delivered: sets delivered_at and the status, matched by provider id and channel only', async () => {
    const rows = [row()]
    const { db, calls } = fakeDb(rows)
    expect(await applySmsStatus(db, { messageId: 'uuid-1', status: 'delivered', at })).toEqual({ updated: 1 })
    expect(rows[0]).toMatchObject({ delivery_status: 'delivered', delivered_at: at })
    for (const c of calls) {
      expect(c.table).toBe('communication_recipients')
      expect(c.filters).toEqual(expect.arrayContaining(['eq:external_id', 'eq:channel']))
      expect(c.filters.some((f) => /phone|email|user_id|unit_id/.test(f))).toBe(false)
    }
  })

  it('is idempotent: a retried receipt changes nothing and keeps the first time', async () => {
    const rows = [row()]
    const { db } = fakeDb(rows)
    await applySmsStatus(db, { messageId: 'uuid-1', status: 'delivered', at })
    expect(await applySmsStatus(db, { messageId: 'uuid-1', status: 'delivered', at: '2026-10-22T00:00:00.000Z' })).toEqual({
      updated: 0,
    })
    expect(rows[0].delivered_at).toBe(at)
  })

  it('failure: failed_at, status and a fixed reason; never over a delivered row', async () => {
    const rows = [row(), row({ id: 'r2', external_id: 'uuid-2', delivery_status: 'delivered' })]
    const { db } = fakeDb(rows)
    await applySmsStatus(db, { messageId: 'uuid-1', status: 'undeliverable', at, errorCode: '1320' })
    expect(rows[0]).toMatchObject({
      delivery_status: 'failed',
      failed_at: at,
      error_message: 'The carrier did not deliver this text (code 1320).',
    })
    expect(await applySmsStatus(db, { messageId: 'uuid-2', status: 'failed', at })).toEqual({ updated: 0 })
    expect(rows[1]).toMatchObject({ delivery_status: 'delivered', error_message: null })
  })

  it('leaves email rows and other messages alone', async () => {
    const rows = [row({ channel: 'email' }), row({ id: 'r2', external_id: 'other' })]
    const { db } = fakeDb(rows)
    expect(await applySmsStatus(db, { messageId: 'uuid-1', status: 'delivered', at })).toEqual({ updated: 0 })
    expect(rows.every((r) => r.delivered_at === null)).toBe(true)
  })

  it('a status that changes nothing writes nothing', async () => {
    const { db, calls } = fakeDb([row()])
    expect(await applySmsStatus(db, { messageId: 'uuid-1', status: 'read', at })).toEqual({ updated: 0 })
    expect(calls).toHaveLength(0)
  })

  it('a failed write throws the generic error (the route answers 500 so Vonage retries)', async () => {
    const { db } = fakeDb([row()], { failOn: 'update' })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(applySmsStatus(db, { messageId: 'uuid-1', status: 'delivered', at })).rejects.toMatchObject({
      code: 'internal',
    })
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret detail')
    err.mockRestore()
  })
})
