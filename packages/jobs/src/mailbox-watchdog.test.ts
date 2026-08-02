import { describe, it, expect, vi } from 'vitest'
import { reconcileStuckSends, STUCK_SEND_REASON } from './mailbox-sync'

// I2: a draft can wedge permanently in 'sending'.
//
// mailbox-send.ts claims a draft by flipping it 'queued' → 'sending', and
// its top-of-function guard makes every Inngest retry early-return. That is
// what guarantees at-most-once delivery, but it also means any uncaught
// throw between the claim and `sendToGmail` strands the row at 'sending'
// forever — never sent, never failed, never retried, with DraftPanel showing
// "Sending…" and Undo suppressed. `reconcileStuckSends` is the only path
// that can correct that.

// The threshold is `now - 30 minutes`: a claim stamped BEFORE it has been
// in flight longer than the window and is stuck; one stamped after it is
// still legitimately in flight.
const THRESHOLD = '2026-01-01T12:00:00.000Z'
const OLD = '2026-01-01T09:00:00.000Z' // claimed three hours ago — stuck
const RECENT = '2026-01-01T12:29:00.000Z' // claimed a minute ago — in flight

/**
 * Minimal `.from('inbox_drafts')` stand-in covering both shapes the function
 * uses: the `select().eq()` read, and the conditional
 * `update().eq().eq().select().maybeSingle()` write.
 */
function buildDb(opts: {
  rows?: Array<{
    id: string
    send_after: string | null
    approved_at: string | null
    created_at: string | null
  }>
  readError?: { code: string; message: string } | null
  /** Draft ids whose conditional update should match zero rows. */
  lostRace?: string[]
  writeError?: { code: string; message: string } | null
}) {
  const updates: Array<{ id: string; patch: Record<string, unknown>; statuses: string[] }> = []

  const read = {
    select: vi.fn(() => read),
    eq: vi.fn(async () => ({
      data: opts.readError ? null : (opts.rows ?? []),
      error: opts.readError ?? null,
    })),
  }

  function writeChain(patch: Record<string, unknown>) {
    const statuses: string[] = []
    let id = ''
    const chain = {
      eq: vi.fn((column: string, value: string) => {
        if (column === 'id') id = value
        if (column === 'status') statuses.push(value)
        return chain
      }),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => {
        updates.push({ id, patch, statuses })
        if (opts.writeError) return { data: null, error: opts.writeError }
        if (opts.lostRace?.includes(id)) return { data: null, error: null }
        return { data: { id }, error: null }
      }),
    }
    return chain
  }

  const table = {
    select: read.select,
    eq: read.eq,
    update: vi.fn((patch: Record<string, unknown>) => writeChain(patch)),
  }

  return {
    db: { from: vi.fn(() => table) } as never,
    updates,
  }
}

function logger() {
  return { error: vi.fn() }
}

describe('reconcileStuckSends', () => {
  it('marks a draft stuck past the threshold as failed', async () => {
    const { db, updates } = buildDb({
      rows: [{ id: 'd1', send_after: OLD, approved_at: OLD, created_at: OLD }],
    })
    const log = logger()

    const count = await reconcileStuckSends(db, log, THRESHOLD)

    expect(count).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0]!.patch).toMatchObject({ status: 'failed', error: STUCK_SEND_REASON })
  })

  it('leaves a recently-claimed send alone — an in-flight send is not a stuck one', async () => {
    const { db, updates } = buildDb({
      rows: [{ id: 'd1', send_after: RECENT, approved_at: RECENT, created_at: RECENT }],
    })

    const count = await reconcileStuckSends(db, logger(), THRESHOLD)

    expect(count).toBe(0)
    expect(updates).toEqual([])
  })

  it('guards the write on status=sending so a send that finishes first is not overwritten', async () => {
    const { db, updates } = buildDb({
      rows: [{ id: 'd1', send_after: OLD, approved_at: OLD, created_at: OLD }],
      lostRace: ['d1'],
    })

    const count = await reconcileStuckSends(db, logger(), THRESHOLD)

    // The update ran but matched zero rows, so nothing was reconciled and a
    // genuinely-sent reply keeps its 'sent' status.
    expect(updates[0]!.statuses).toContain('sending')
    expect(count).toBe(0)
  })

  it('falls back through approved_at and created_at when send_after is null', async () => {
    const { db, updates } = buildDb({
      rows: [
        { id: 'd1', send_after: null, approved_at: OLD, created_at: OLD },
        { id: 'd2', send_after: null, approved_at: null, created_at: OLD },
      ],
    })

    const count = await reconcileStuckSends(db, logger(), THRESHOLD)

    expect(count).toBe(2)
    expect(updates.map((u) => u.id)).toEqual(['d1', 'd2'])
  })

  it('leaves a row with no usable timestamp alone rather than guessing', async () => {
    const { db, updates } = buildDb({
      rows: [{ id: 'd1', send_after: null, approved_at: null, created_at: null }],
    })

    const count = await reconcileStuckSends(db, logger(), THRESHOLD)

    expect(count).toBe(0)
    expect(updates).toEqual([])
  })

  it('throws on a read failure rather than reporting a clean run', async () => {
    const { db } = buildDb({ readError: { code: '08006', message: 'connection reset' } })

    await expect(reconcileStuckSends(db, logger(), THRESHOLD)).rejects.toThrow(
      /failed to load sending drafts/,
    )
  })

  it('never logs anything but the opaque draft id', async () => {
    const { db } = buildDb({
      rows: [{ id: 'd1', send_after: OLD, approved_at: OLD, created_at: OLD }],
    })
    const log = logger()

    await reconcileStuckSends(db, log, THRESHOLD)

    const logged = JSON.stringify(log.error.mock.calls)
    expect(logged).toContain('d1')
    expect(logged).not.toMatch(/@/) // no address ever reaches a log line
  })

  describe('the reason text', () => {
    // A row reaches 'sending' and stalls in two indistinguishable ways: the
    // job died before sending (nothing went out), or the send SUCCEEDED and
    // `recordSent`'s bookkeeping update failed. Wording that asserts failure
    // would push a board member to resend a reply the resident already has —
    // the same double-send this whole wave exists to prevent.
    it('says the outcome is unknown and delivery is possible', () => {
      expect(STUCK_SEND_REASON).toMatch(/cannot tell whether it was delivered/i)
      expect(STUCK_SEND_REASON).toMatch(/may already have reached the resident/i)
    })

    it('does not claim the send failed', () => {
      expect(STUCK_SEND_REASON).not.toMatch(/\bfailed\b/i)
      expect(STUCK_SEND_REASON).not.toMatch(/was not (sent|delivered)/i)
    })

    it('states that nothing was auto-retried', () => {
      expect(STUCK_SEND_REASON).toMatch(/nothing was resent/i)
    })
  })
})
