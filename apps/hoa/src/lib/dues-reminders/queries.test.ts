import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
}))

import { getLastRemindedByEmail, RECENT_REMINDER_DAYS } from './queries'

function table(data: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data, error: null })
  return builder
}

function errorTable(message: string) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
    resolve({ data: null, error: { message } })
  return builder
}

beforeEach(() => mockFrom.mockReset())

describe('RECENT_REMINDER_DAYS', () => {
  it('is a single source of truth for the repeat window', () => {
    expect(RECENT_REMINDER_DAYS).toBe(7)
  })
})

describe('getLastRemindedByEmail', () => {
  it('keeps the most recent send per email', async () => {
    mockFrom.mockReturnValue(
      table([
        { sent_at: '2026-08-01T10:00:00Z', communication_recipients: [{ email: 'dana@example.com' }] },
        { sent_at: '2026-08-06T10:00:00Z', communication_recipients: [{ email: 'dana@example.com' }] },
        { sent_at: '2026-07-02T10:00:00Z', communication_recipients: [{ email: 'sam@example.com' }] },
      ]),
    )

    const result = await getLastRemindedByEmail('assoc-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lastReminded.get('dana@example.com')).toBe('2026-08-06T10:00:00Z')
    expect(result.lastReminded.get('sam@example.com')).toBe('2026-07-02T10:00:00Z')
  })

  it('normalizes email case so lookups match packet keys', async () => {
    mockFrom.mockReturnValue(
      table([
        { sent_at: '2026-08-06T10:00:00Z', communication_recipients: [{ email: 'DANA@Example.com' }] },
      ]),
    )

    const result = await getLastRemindedByEmail('assoc-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lastReminded.get('dana@example.com')).toBe('2026-08-06T10:00:00Z')
  })

  it('returns an empty map when nothing has been sent', async () => {
    mockFrom.mockReturnValue(table([]))

    const result = await getLastRemindedByEmail('assoc-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lastReminded.size).toBe(0)
  })

  it('ignores rows with a null sent_at', async () => {
    mockFrom.mockReturnValue(
      table([{ sent_at: null, communication_recipients: [{ email: 'dana@example.com' }] }]),
    )

    const result = await getLastRemindedByEmail('assoc-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lastReminded.size).toBe(0)
  })

  it('returns ok:false, not an empty-but-successful map, when the query errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(errorTable('permission denied for table communications'))

    const result = await getLastRemindedByEmail('assoc-1')

    expect(result).toEqual({ ok: false })
    spy.mockRestore()
  })

  it('logs only the error message on failure, never row data', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(errorTable('permission denied for table communications'))

    await getLastRemindedByEmail('assoc-1')

    expect(spy).toHaveBeenCalledWith('getLastRemindedByEmail: lookup failed', {
      message: 'permission denied for table communications',
    })
    spy.mockRestore()
  })
})
