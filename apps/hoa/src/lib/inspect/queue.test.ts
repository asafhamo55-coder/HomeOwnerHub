import { describe, expect, it, vi } from 'vitest'
import {
  classifyStatus,
  draftRequestFor,
  drainQueue,
  idempotencyKeyFor,
  isDue,
  newQueueItem,
  processItem,
  queueSummary,
  retryDelayMs,
  validatePhoto,
  type QueueDeps,
  type QueueItem,
} from './queue'

const UNIT = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-10-18T12:00:00Z')

function blob(type = 'image/jpeg', size = 1000): Blob {
  return new Blob([new Uint8Array(size)], { type })
}

function item(over: Partial<QueueItem> = {}): QueueItem {
  return {
    ...newQueueItem({
      id: 'q1',
      unitId: UNIT,
      homeLabel: '12 Oak St',
      category: 'lawn_landscape',
      note: '',
      photos: [{ id: 'p1', blob: blob(), name: 'a.jpg', type: 'image/jpeg', size: 1000 }],
      now: NOW,
    }),
    ...over,
  }
}

function deps(over: Partial<QueueDeps> = {}): QueueDeps & { saved: QueueItem[]; removed: string[] } {
  const saved: QueueItem[] = []
  const removed: string[] = []
  let n = 0
  return {
    uploadPhoto: vi.fn(async () => ({ ok: true as const, value: `org/key-${++n}.jpg` })),
    createDraft: vi.fn(async () => ({ ok: true as const, value: 'run-1' })),
    save: vi.fn(async (i: QueueItem) => {
      saved.push(structuredClone({ ...i, photos: i.photos.map((p) => ({ ...p, blob: p.blob ? 'blob' : null })) }) as never)
    }),
    remove: vi.fn(async (id: string) => {
      removed.push(id)
    }),
    now: () => NOW,
    ...over,
    saved,
    removed,
  }
}

describe('validatePhoto (the upload route’s limits, checked before queueing)', () => {
  it('accepts JPG/PNG/WebP/HEIC under 25 MB, and a typeless .heic by name', () => {
    expect(validatePhoto({ type: 'image/jpeg', size: 10, name: 'a.jpg' })).toBeNull()
    expect(validatePhoto({ type: 'image/heic', size: 10, name: 'a.heic' })).toBeNull()
    expect(validatePhoto({ type: '', size: 10, name: 'IMG_1.HEIC' })).toBeNull()
  })
  it('refuses other types and oversize files with a readable reason', () => {
    expect(validatePhoto({ type: 'image/gif', size: 10, name: 'a.gif' })).toMatch(/JPG, PNG, WebP, or HEIC/)
    expect(validatePhoto({ type: 'image/jpeg', size: 26 * 1024 * 1024, name: 'a.jpg' })).toMatch(/25 MB/)
    expect(validatePhoto({ type: 'image/jpeg', size: 0, name: 'a.jpg' })).toMatch(/empty/)
  })
})

describe('draftRequestFor', () => {
  it('builds the existing W3 draft request: unit, category as the type, a ≥10-char description, photo keys', () => {
    const r = draftRequestFor({ ...item(), photos: [{ ...item().photos[0]!, storagePath: 'k1' }] })
    expect(r).toEqual({
      unitId: UNIT,
      violationType: 'Lawn / landscaping',
      description: 'Lawn / landscaping, seen during a board inspection.',
      reporterNotes: 'Logged in inspection mode with 1 photo.',
      photoPaths: ['k1'],
    })
    expect(r.description.length).toBeGreaterThanOrEqual(10)
  })
  it('puts the note in the description (it is what the violation keeps)', () => {
    const r = draftRequestFor(item({ note: '  Grass over a foot tall.  ' }))
    expect(r.description).toBe('Lawn / landscaping: Grass over a foot tall.')
    expect(r.photoPaths).toEqual([])
  })
})

describe('classifyStatus', () => {
  it('network-ish and server answers are retried; a request the server refuses needs a person', () => {
    expect(classifyStatus(0)).toBe('offline')
    for (const s of [408, 429, 500, 502, 503, 504]) expect(classifyStatus(s)).toBe('retry')
    for (const s of [400, 401, 403, 404, 413, 415, 422]) expect(classifyStatus(s)).toBe('rejected')
  })
})

describe('retryDelayMs / isDue', () => {
  it('backs off from 5 s, doubling, capped at 5 min', () => {
    expect(retryDelayMs(1)).toBe(5_000)
    expect(retryDelayMs(2)).toBe(10_000)
    expect(retryDelayMs(3)).toBe(20_000)
    expect(retryDelayMs(30)).toBe(300_000)
  })
  it('a waiting item is due at its time; one needing attention never is (until retried by hand)', () => {
    expect(isDue(item(), NOW)).toBe(true)
    expect(isDue(item({ nextAttemptAt: NOW + 1 }), NOW)).toBe(false)
    expect(isDue(item({ nextAttemptAt: NOW + 1 }), NOW, { force: true })).toBe(true)
    expect(isDue(item({ status: 'needs_attention' }), NOW, { force: true })).toBe(false)
  })
})

describe('processItem', () => {
  it('uploads every photo, creates the draft with their keys, and removes the item', async () => {
    const d = deps()
    const r = await processItem(item({ photos: [item().photos[0]!, { ...item().photos[0]!, id: 'p2' }] }), d)
    expect(r).toEqual({ outcome: 'done', runId: 'run-1' })
    expect(d.uploadPhoto).toHaveBeenCalledTimes(2)
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({ photoPaths: ['org/key-1.jpg', 'org/key-2.jpg'] }), 'inspect-q1')
    expect(d.removed).toEqual(['q1'])
  })

  it('saves each uploaded key as it lands, so a retry never re-uploads a photo', async () => {
    const d = deps({
      uploadPhoto: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: 'k1' })
        .mockResolvedValueOnce({ ok: false, kind: 'offline', message: 'No signal' }),
    })
    const two = item({ photos: [item().photos[0]!, { ...item().photos[0]!, id: 'p2' }] })
    const r = await processItem(two, d)
    expect(r.outcome).toBe('waiting')
    if (r.outcome !== 'waiting') throw new Error()
    expect(r.offline).toBe(true)
    expect(r.item.photos.map((p) => p.storagePath)).toEqual(['k1', null])
    // The uploaded photo's bytes are dropped; the one still to go keeps them.
    expect(r.item.photos[0]!.blob).toBeNull()
    expect(r.item.photos[1]!.blob).not.toBeNull()
    expect(r.item.attempts).toBe(1)
    expect(r.item.nextAttemptAt).toBe(NOW + 5_000)
    expect(d.createDraft).not.toHaveBeenCalled()
    expect(d.removed).toEqual([])

    // Retry: only the second photo goes up.
    const d2 = deps({ uploadPhoto: vi.fn(async () => ({ ok: true as const, value: 'k2' })) })
    const r2 = await processItem(r.item, d2)
    expect(r2.outcome).toBe('done')
    expect(d2.uploadPhoto).toHaveBeenCalledTimes(1)
    expect(d2.createDraft).toHaveBeenCalledWith(expect.objectContaining({ photoPaths: ['k1', 'k2'] }), 'inspect-q1')
  })

  it('a draft that fails to save keeps the item (with its keys) waiting', async () => {
    const d = deps({ createDraft: vi.fn(async () => ({ ok: false as const, kind: 'retry' as const, message: 'AI busy' })) })
    const r = await processItem(item(), d)
    expect(r.outcome).toBe('waiting')
    if (r.outcome !== 'waiting') throw new Error()
    expect(r.offline).toBe(false)
    expect(r.item.photos[0]!.storagePath).toBe('org/key-1.jpg')
    expect(r.item.lastError).toBe('AI busy')
    expect(d.removed).toEqual([])
    expect(d.saved.at(-1)?.status).toBe('waiting')
  })

  it('a refused request is never dropped: it waits for a person, with the reason', async () => {
    const d = deps({ uploadPhoto: vi.fn(async () => ({ ok: false as const, kind: 'rejected' as const, message: 'Photo must be under 25 MB.' })) })
    const r = await processItem(item(), d)
    expect(r.outcome).toBe('needs_attention')
    if (r.outcome !== 'needs_attention') throw new Error()
    expect(r.item.status).toBe('needs_attention')
    expect(r.item.lastError).toBe('Photo must be under 25 MB.')
    expect(r.item.photos[0]!.blob).not.toBeNull()
    expect(d.removed).toEqual([])
  })

  it('a photo with neither bytes nor a key needs attention (never silently skipped)', async () => {
    const d = deps()
    const r = await processItem(item({ photos: [{ ...item().photos[0]!, blob: null }] }), d)
    expect(r.outcome).toBe('needs_attention')
    expect(d.createDraft).not.toHaveBeenCalled()
  })

  it('a throwing transport counts as offline, not a crash', async () => {
    const d = deps({ uploadPhoto: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) })
    const r = await processItem(item(), d)
    expect(r.outcome).toBe('waiting')
    if (r.outcome === 'waiting') expect(r.offline).toBe(true)
  })

  it('if removing the finished item fails, it still reports done (the draft exists)', async () => {
    const d = deps({ remove: vi.fn(async () => Promise.reject(new Error('idb'))) })
    const r = await processItem(item(), d)
    expect(r.outcome).toBe('done')
  })
})

describe('drainQueue', () => {
  it('sends due items oldest first and stops at the first offline failure', async () => {
    const calls: string[] = []
    const d = deps({
      createDraft: vi.fn(async (body) => {
        calls.push(body.unitId)
        return calls.length === 1 ? { ok: true as const, value: 'run-a' } : { ok: false as const, kind: 'offline' as const, message: 'No signal' }
      }),
    })
    const a = item({ id: 'a', unitId: 'unit-a', createdAt: '2026-10-18T10:00:00Z' })
    const b = item({ id: 'b', unitId: 'unit-b', createdAt: '2026-10-18T10:01:00Z' })
    const c = item({ id: 'c', unitId: 'unit-c', createdAt: '2026-10-18T10:02:00Z' })
    const r = await drainQueue([c, a, b], d)
    expect(calls).toEqual(['unit-a', 'unit-b'])
    expect(r.done).toEqual([{ id: 'a', runId: 'run-a' }])
    expect(r.items.map((i) => i.id)).toEqual(['b', 'c'])
    expect(r.offline).toBe(true)
  })

  it('skips items not yet due and items needing attention, unless forced', async () => {
    const d = deps()
    const later = item({ id: 'later', nextAttemptAt: NOW + 60_000 })
    const stuck = item({ id: 'stuck', status: 'needs_attention' })
    const r = await drainQueue([later, stuck], d)
    expect(d.createDraft).not.toHaveBeenCalled()
    expect(r.items.map((i) => i.id).sort()).toEqual(['later', 'stuck'])
    const forced = await drainQueue([later, stuck], deps(), { force: true })
    expect(forced.done.map((x) => x.id)).toEqual(['later'])
  })
})

describe('queueSummary', () => {
  it('counts what is waiting and what needs a person, with a visible label', () => {
    expect(queueSummary([])).toEqual({ waiting: 0, needsAttention: 0, label: null })
    expect(queueSummary([item(), item({ id: 'b' })]).label).toBe('2 waiting to upload')
    expect(queueSummary([item(), item({ id: 'b', status: 'needs_attention' })])).toEqual({
      waiting: 1,
      needsAttention: 1,
      label: '1 waiting to upload · 1 needs attention',
    })
    expect(queueSummary([item({ status: 'needs_attention' })]).label).toBe('1 needs attention')
  })
})

describe('idempotency key (a lost response must not make a second draft)', () => {
  it('is stable for an item and differs between items', () => {
    expect(idempotencyKeyFor(item())).toBe(idempotencyKeyFor(item({ attempts: 3, status: 'needs_attention' })))
    expect(idempotencyKeyFor(item())).not.toBe(idempotencyKeyFor(item({ id: 'q2' })))
    expect(idempotencyKeyFor(item())).toMatch(/^[A-Za-z0-9._:-]{8,128}$/)
  })

  it('a retry after a lost draft response sends the same key again', async () => {
    const keys: string[] = []
    let calls = 0
    const d = deps({
      createDraft: vi.fn(async (_body, key: string) => {
        keys.push(key)
        // The first request reached the server, but the answer never came back.
        return ++calls === 1
          ? { ok: false as const, kind: 'offline' as const, message: 'No connection.' }
          : { ok: true as const, value: 'run-1' }
      }),
    })
    const first = await processItem(item(), d)
    expect(first.outcome).toBe('waiting')
    if (first.outcome !== 'waiting') throw new Error('unreachable')
    const second = await processItem(first.item, d)
    expect(second).toEqual({ outcome: 'done', runId: 'run-1' })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(keys[0]).toBe(idempotencyKeyFor(item()))
  })
})
