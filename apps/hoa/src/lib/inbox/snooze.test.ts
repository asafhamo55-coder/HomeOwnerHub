import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-134 (inbox plan B1, migration 0067) — snooze. Flag off: the action
 * refuses before touching the database, and the queues are unchanged.
 * Flag on: the action writes inbox_threads.snoozed_until (org-scoped), and
 * every queue hides threads snoozed into the future while the Snoozed
 * view shows exactly those. Also the reply clock and provenance readers.
 */

const h = vi.hoisted(() => ({ m3: false }))
vi.mock('@homeowner-portal/db/m3', () => ({
  get M3_APPLIED() {
    return h.m3
  },
}))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'board' as const, org: { id: 'org-1', name: 'Madison Park' } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const updates: unknown[] = []
const eqs: unknown[][] = []
let updated: { id: string } | null = { id: 'thread-1' }
const from = vi.fn(() => {
  const chain: Record<string, unknown> = {
    update: vi.fn((values: unknown) => {
      updates.push(values)
      return chain
    }),
    eq: vi.fn((...args: unknown[]) => {
      eqs.push(args)
      return chain
    }),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: updated, error: null })),
  }
  return chain
})
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => ({ from })) }))

import { snoozeThread } from './snooze'
import { SNOOZE_ERRORS, SNOOZE_MAX_DAYS, checkSnoozeUntil, isSnoozed, snoozePresets, snoozedLabel } from './snooze-rules'
import { countThreadsByStatus, listThreads, type SnoozeScope } from './queries'
import { loadThreadClock, replyClockLabel } from './thread-clock'
import { documentEmailSource, filedAttachmentDocuments } from './provenance'
import { LINK_ERRORS, linkWriteError } from './links'

const THREAD = '11111111-1111-4111-8111-111111111111'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

beforeEach(() => {
  h.m3 = false
  updates.length = 0
  eqs.length = 0
  updated = { id: 'thread-1' }
  from.mockClear()
})

describe('checkSnoozeUntil', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  it('accepts a future instant within the cap, normalised; null un-snoozes', () => {
    expect(checkSnoozeUntil('2026-10-21T08:00:00-04:00', now)).toEqual({ ok: true, until: '2026-10-21T12:00:00.000Z' })
    expect(checkSnoozeUntil(null, now)).toEqual({ ok: true, until: null })
  })
  it('refuses the past, junk and anything past the cap', () => {
    expect(checkSnoozeUntil('2026-10-20T11:00:00Z', now)).toEqual({ ok: false, error: SNOOZE_ERRORS.past })
    expect(checkSnoozeUntil('soon', now)).toEqual({ ok: false, error: SNOOZE_ERRORS.invalid })
    expect(checkSnoozeUntil(42, now)).toEqual({ ok: false, error: SNOOZE_ERRORS.invalid })
    expect(checkSnoozeUntil(new Date(now + (SNOOZE_MAX_DAYS + 1) * DAY).toISOString(), now)).toEqual({
      ok: false,
      error: SNOOZE_ERRORS.tooFar,
    })
  })
})

describe('snooze presets and labels', () => {
  it('every preset is in the future and within the cap', () => {
    for (const day of [18, 19, 20, 21, 22, 23, 24]) {
      for (const hour of [7, 13, 20]) {
        const now = new Date(2026, 9, day, hour, 15)
        const presets = snoozePresets(now)
        expect(presets.length).toBeGreaterThan(1)
        for (const p of presets) {
          expect(checkSnoozeUntil(p.until.toISOString(), now.getTime()).ok, `${p.key} ${now.toString()}`).toBe(true)
        }
      }
    }
  })
  it('no "later today" in the evening; Friday only early in the week', () => {
    expect(snoozePresets(new Date(2026, 9, 20, 20, 0)).map((p) => p.key)).not.toContain('later_today')
    expect(snoozePresets(new Date(2026, 9, 20, 9, 0)).map((p) => p.key)).toContain('friday') // Tue
    expect(snoozePresets(new Date(2026, 9, 23, 9, 0)).map((p) => p.key)).not.toContain('friday') // Fri
  })
  it('isSnoozed and the label', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')
    expect(isSnoozed(null, now)).toBe(false)
    expect(isSnoozed('2026-10-20T11:00:00Z', now)).toBe(false)
    expect(isSnoozed('2026-10-21T11:00:00Z', now)).toBe(true)
    expect(snoozedLabel(new Date(2026, 9, 23, 8, 0).toISOString())).toBe('Snoozed until Fri, Oct 23, 8:00 AM')
  })
})

describe('snoozeThread', () => {
  const until = () => new Date(Date.now() + DAY).toISOString()

  it('flag off: refuses before any database call', async () => {
    expect(await snoozeThread(THREAD, until())).toEqual({ error: SNOOZE_ERRORS.notLive })
    expect(from).not.toHaveBeenCalled()
  })

  it('flag on: writes snoozed_until on this org’s thread only', async () => {
    h.m3 = true
    const at = until()
    expect(await snoozeThread(THREAD, at)).toEqual({ ok: true, snoozedUntil: new Date(at).toISOString() })
    expect(updates).toEqual([{ snoozed_until: new Date(at).toISOString() }])
    expect(eqs).toContainEqual(['id', THREAD])
    expect(eqs).toContainEqual(['organization_id', 'org-1'])
  })

  it('flag on: unsnooze writes NULL', async () => {
    h.m3 = true
    expect(await snoozeThread(THREAD, null)).toEqual({ ok: true, snoozedUntil: null })
    expect(updates).toEqual([{ snoozed_until: null }])
  })

  it('flag on: a foreign or stale id is "not found", a bad id or time never reaches the database', async () => {
    h.m3 = true
    updated = null
    expect(await snoozeThread(THREAD, until())).toEqual({ error: 'Thread not found.' })
    from.mockClear()
    expect(await snoozeThread('not-a-uuid', until())).toEqual({ error: 'Thread not found.' })
    expect(await snoozeThread(THREAD, '2000-01-01T00:00:00Z')).toEqual({ error: SNOOZE_ERRORS.past })
    expect(from).not.toHaveBeenCalled()
  })
})

/** A query recorder for the list/count filters. */
function listDb() {
  const perCall: Array<Record<string, unknown[][]>> = []
  const db = {
    from: vi.fn(() => {
      const calls: Record<string, unknown[][]> = {}
      perCall.push(calls)
      const chain: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'or', 'not', 'in', 'gt', 'order', 'range']) {
        chain[op] = vi.fn((...args: unknown[]) => {
          ;(calls[op] ??= []).push(args)
          return chain
        })
      }
      chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
      return chain
    }),
  }
  return { db: db as never, perCall }
}

describe('queues and the Snoozed view (applyInboxFilter)', () => {
  const NOW = '2026-10-20T12:00:00.000Z'
  const off: SnoozeScope = { live: false, nowIso: NOW }
  const on: SnoozeScope = { live: true, nowIso: NOW }
  const awake = `snoozed_until.is.null,snoozed_until.lte.${NOW}`

  it('flag off: no snooze predicate anywhere, and no Snoozed count query', async () => {
    const list = listDb()
    await listThreads(list.db, 'org-1', 'needs_review', 50, 0, undefined, off)
    expect(list.perCall[0].or ?? []).not.toContainEqual([awake])
    expect(list.perCall[0].gt).toBeUndefined()

    const counts = listDb()
    const result = await countThreadsByStatus(counts.db, 'org-1', undefined, off)
    expect(counts.perCall).toHaveLength(5)
    expect(result).not.toHaveProperty('snoozed')
  })

  it('flag on: every status queue and All hide threads snoozed into the future', async () => {
    for (const filter of ['needs_review', 'awaiting_resident', 'open', 'waiting', 'closed', 'all'] as const) {
      const list = listDb()
      await listThreads(list.db, 'org-1', filter, 50, 0, undefined, on)
      expect(list.perCall[0].or, filter).toContainEqual([awake])
    }
  })

  it('flag on: the Snoozed view is snoozed_until > now, and gets its own count outside All', async () => {
    const list = listDb()
    await listThreads(list.db, 'org-1', 'snoozed', 50, 0, undefined, on)
    expect(list.perCall[0].gt).toEqual([['snoozed_until', NOW]])

    const counts = listDb()
    const result = await countThreadsByStatus(counts.db, 'org-1', undefined, on)
    expect(counts.perCall).toHaveLength(6)
    expect(counts.perCall[5].gt).toEqual([['snoozed_until', NOW]])
    expect(result.all).toBe(0)
    expect(result.snoozed).toBe(0)
  })

  it('flag off: a forced ?filter=snoozed matches nothing instead of erroring', async () => {
    const list = listDb()
    await listThreads(list.db, 'org-1', 'snoozed', 50, 0, undefined, off)
    expect(list.perCall[0].is).toContainEqual(['id', null])
    expect(list.perCall[0].gt).toBeUndefined()
  })
})

describe('reply clock (thread-clock.ts)', () => {
  it('flag off: no query', async () => {
    const db = { from: vi.fn() }
    expect(await loadThreadClock(db, 'org-1', THREAD, false)).toBeNull()
    expect(db.from).not.toHaveBeenCalled()
  })

  it('flag on: reads the three columns, org-scoped', async () => {
    const eqCalls: unknown[][] = []
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (...a: unknown[]) => {
        eqCalls.push(a)
        return chain
      },
      maybeSingle: async () => ({
        data: { first_inbound_at: '2026-10-20T08:00:00Z', first_response_at: null, snoozed_until: null },
        error: null,
      }),
    }
    const clock = await loadThreadClock({ from: () => chain }, 'org-1', THREAD, true)
    expect(clock).toEqual({ firstInboundAt: '2026-10-20T08:00:00Z', firstResponseAt: null, snoozedUntil: null })
    expect(eqCalls).toContainEqual(['organization_id', 'org-1'])
  })

  it('labels', () => {
    const now = Date.parse('2026-10-22T08:00:00Z')
    expect(replyClockLabel(null, now)).toBeNull()
    expect(replyClockLabel({ firstInboundAt: null, firstResponseAt: null, snoozedUntil: null }, now)).toBeNull()
    expect(
      replyClockLabel({ firstInboundAt: '2026-10-20T08:00:00Z', firstResponseAt: '2026-10-20T13:30:00Z', snoozedUntil: null }, now),
    ).toBe('First reply after 5h')
    expect(replyClockLabel({ firstInboundAt: '2026-10-18T08:00:00Z', firstResponseAt: null, snoozedUntil: null }, now)).toBe(
      'No reply yet · 4d since the first message',
    )
  })
})

describe('provenance (provenance.ts)', () => {
  it('flag off: no query either way', async () => {
    const db = { from: vi.fn() }
    expect((await filedAttachmentDocuments(db, 'org-1', ['a1'], false)).size).toBe(0)
    expect(await documentEmailSource(db, 'org-1', 'doc-1', false)).toBeNull()
    expect(db.from).not.toHaveBeenCalled()
  })

  it('flag on: maps filed attachments to their documents, org-scoped', async () => {
    const calls: unknown[][] = []
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (...a: unknown[]) => (calls.push(['eq', ...a]), chain),
      in: (...a: unknown[]) => (calls.push(['in', ...a]), chain),
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: 'doc-1', source_inbox_attachment_id: 'a1' }], error: null }).then(resolve),
    }
    const map = await filedAttachmentDocuments({ from: () => chain }, 'org-1', ['a1', 'a2'], true)
    expect([...map]).toEqual([['a1', 'doc-1']])
    expect(calls).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(calls).toContainEqual(['in', 'source_inbox_attachment_id', ['a1', 'a2']])
  })

  it('flag on: a document filed from email resolves its thread; an upload resolves nothing', async () => {
    const answers: Record<string, unknown> = {
      hoa_documents: { source_inbox_attachment_id: 'a1' },
      inbox_attachments: { thread_id: THREAD, created_at: '2026-10-19T10:00:00Z' },
    }
    const db = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: answers[table] ?? null, error: null }),
        }
        return chain
      },
    }
    expect(await documentEmailSource(db, 'org-1', 'doc-1', true)).toEqual({ threadId: THREAD, receivedAt: '2026-10-19T10:00:00Z' })
    answers.hoa_documents = { source_inbox_attachment_id: null }
    expect(await documentEmailSource(db, 'org-1', 'doc-1', true)).toBeNull()
  })
})

describe('thread link validation (links.ts, 0067 trigger)', () => {
  it('flag on: the trigger’s 23503 reads as "record not found"; anything else stays generic', () => {
    expect(linkWriteError('23503', true)).toBe(LINK_ERRORS.target)
    expect(linkWriteError('42501', true)).toBe(LINK_ERRORS.failed)
  })
  it('flag off: every failure is generic', () => {
    expect(linkWriteError('23503', false)).toBe(LINK_ERRORS.failed)
  })
})
