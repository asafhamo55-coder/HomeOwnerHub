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
  builder.then = (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data })
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

    const map = await getLastRemindedByEmail('assoc-1')

    expect(map.get('dana@example.com')).toBe('2026-08-06T10:00:00Z')
    expect(map.get('sam@example.com')).toBe('2026-07-02T10:00:00Z')
  })

  it('normalizes email case so lookups match packet keys', async () => {
    mockFrom.mockReturnValue(
      table([
        { sent_at: '2026-08-06T10:00:00Z', communication_recipients: [{ email: 'DANA@Example.com' }] },
      ]),
    )

    const map = await getLastRemindedByEmail('assoc-1')

    expect(map.get('dana@example.com')).toBe('2026-08-06T10:00:00Z')
  })

  it('returns an empty map when nothing has been sent', async () => {
    mockFrom.mockReturnValue(table([]))

    expect((await getLastRemindedByEmail('assoc-1')).size).toBe(0)
  })

  it('ignores rows with a null sent_at', async () => {
    mockFrom.mockReturnValue(
      table([{ sent_at: null, communication_recipients: [{ email: 'dana@example.com' }] }]),
    )

    expect((await getLastRemindedByEmail('assoc-1')).size).toBe(0)
  })
})
