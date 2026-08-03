import { describe, it, expect, vi, beforeEach } from 'vitest'

// sendReply must never actually be reachable in a test run — this suite
// mocks it. `buildMimeMessage` is mocked alongside it purely so tests don't
// have to supply header-valid inputs; MailboxAuthError and every other
// export of @homeowner-portal/mailbox stay real so `instanceof` checks in
// mailbox-send.ts still work against the classes the tests construct.
vi.mock('@homeowner-portal/mailbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@homeowner-portal/mailbox')>()
  return {
    ...actual,
    buildMimeMessage: vi.fn(() => 'mime-message'),
    sendReply: vi.fn(),
  }
})

vi.mock('./mailbox-tokens', () => ({
  getAccessTokenFor: vi.fn(async () => 'access-token'),
  markAuthFailed: vi.fn(async () => undefined),
}))

import { runMailboxSend, type MailboxSendStep, type MailboxSendLogger } from './mailbox-send'
import { buildMimeMessage, sendReply, MailboxAuthError } from '@homeowner-portal/mailbox'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

type Row = { data: unknown; error: unknown }

/**
 * A `.from(table)` result stands in for one Supabase query builder call.
 * Every chain method returns itself so any call order compiles, and the
 * chain is directly `await`-able (via `then`) as well as terminable with
 * `.maybeSingle()`, matching the two shapes mailbox-send.ts actually uses:
 * `.update(...).eq(...)` (awaited directly, no `.maybeSingle()`) and
 * `.select(...).eq(...).maybeSingle()`.
 */
function makeChain(result: Row) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (r: Row) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

/**
 * Queues one result per successive `.from(table)` call, in call order.
 * Running out of queued results for a table is a test-authoring bug (the
 * code under test made a call the test didn't script for), so it throws
 * loudly rather than returning something that would silently mask a bug —
 * this doubles as an assertion that the job makes exactly the calls the
 * test expects and no more (see the "never sends twice" test, which relies
 * on this to prove no extra `fail()` write happens).
 */
function buildDb(queues: Record<string, Row[]>) {
  const from = vi.fn((table: string) => {
    const queue = queues[table]
    if (!queue || queue.length === 0) {
      throw new Error(`buildDb: no queued result left for table "${table}"`)
    }
    return makeChain(queue.shift()!)
  })
  return { from } as unknown as Parameters<typeof runMailboxSend>[0]
}

function fakeStep(): MailboxSendStep {
  return {
    sleepUntil: vi.fn(async () => undefined),
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  } as unknown as MailboxSendStep
}

/**
 * A filter-aware `inbox_drafts` fake, used only for the claim race itself.
 * `makeChain`/`buildDb` above are deliberately dumb — they return whatever
 * result a test pre-scripts, regardless of which `.eq(...)` filters the
 * code under test actually chained — which is fine for every other test
 * here but WRONG for the one test that exists to prove the claim is
 * conditional: a mutation that deletes `.eq('status', 'queued')` from
 * mailbox-send.ts would not change what a dumb mock returns, so it could
 * never fail that test. This fake instead holds one mutable row and only
 * "succeeds" the claim update when every `.eq(...)` filter the code
 * attached actually matches the row's current state — exactly what
 * Postgres does. `cancelDuringSleep` flips the row to 'cancelled' inside
 * the faked `step.sleepUntil`, modeling a board member pressing Undo while
 * the real job would be asleep.
 */
function buildClaimRaceDb(opts: {
  cancelDuringSleep: boolean
  otherQueues?: Record<string, Row[]>
}): { db: Parameters<typeof runMailboxSend>[0]; step: MailboxSendStep } {
  const record = { status: 'queued' as string }
  let draftCall = 0
  const otherQueues = opts.otherQueues ?? {}

  const from = vi.fn((table: string) => {
    if (table !== 'inbox_drafts') {
      const queue = otherQueues[table]
      if (!queue || queue.length === 0) {
        throw new Error(`buildClaimRaceDb: no queued result left for table "${table}"`)
      }
      return makeChain(queue.shift()!)
    }

    draftCall++
    if (draftCall === 1) {
      // Initial read: the row as it looked when the job started.
      return makeChain({ data: { ...queuedDraftRow(), status: record.status }, error: null })
    }
    if (draftCall === 2) {
      // The claim itself: a real conditional UPDATE. Only "matches" if
      // every filter the code attached agrees with the row's CURRENT state.
      const filters: Record<string, unknown> = {}
      const chain: Record<string, unknown> = {
        update: vi.fn(() => chain),
        eq: vi.fn((col: string, val: unknown) => {
          filters[col] = val
          return chain
        }),
        select: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          const idOk = !('id' in filters) || filters.id === DRAFT_ID
          const statusOk = !('status' in filters) || filters.status === record.status
          if (idOk && statusOk) {
            record.status = 'sending'
            return { data: { id: DRAFT_ID }, error: null }
          }
          return { data: null, error: null }
        }),
        then: (resolve: (r: Row) => unknown) =>
          (chain.maybeSingle as () => Promise<Row>)().then(resolve),
      }
      return chain
    }

    // Any further inbox_drafts call (the terminal 'sent'/'failed' write).
    const queue = otherQueues.inbox_drafts
    if (!queue || queue.length === 0) {
      throw new Error('buildClaimRaceDb: no queued follow-up result for "inbox_drafts"')
    }
    return makeChain(queue.shift()!)
  })

  const step: MailboxSendStep = {
    sleepUntil: vi.fn(async () => {
      if (opts.cancelDuringSleep) record.status = 'cancelled'
    }),
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  } as unknown as MailboxSendStep

  return { db: { from } as unknown as Parameters<typeof runMailboxSend>[0], step }
}

function fakeLogger(): MailboxSendLogger {
  return { info: vi.fn(), error: vi.fn() }
}

const DRAFT_ID = 'draft-1'
const THREAD_ID = 'thread-1'
const ACCOUNT_ID = 'account-1'
const RESIDENT_EMAIL = 'resident@example.com'

function queuedDraftRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DRAFT_ID,
    organization_id: 'org-1',
    thread_id: THREAD_ID,
    subject: 'Re: Fence',
    body_text: 'Thanks for writing.',
    send_after: '2026-01-01T00:00:30.000Z',
    status: 'queued',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runMailboxSend', () => {
  it('does not touch a draft that is no longer queued (e.g. already sent)', async () => {
    const db = buildDb({
      inbox_drafts: [{ data: { ...queuedDraftRow(), status: 'sent' }, error: null }],
    })
    const step = fakeStep()

    const result = await runMailboxSend(db, step, fakeLogger(), DRAFT_ID)

    expect(result).toEqual({ sent: false, reason: 'sent' })
    expect(step.sleepUntil).not.toHaveBeenCalled()
    expect(sendReply).not.toHaveBeenCalled()
  })

  // ─── THE CRUX ────────────────────────────────────────────────────────
  // Uses buildClaimRaceDb, not the dumb per-call queue: the claim must be
  // proven conditional on the row's live state, not just on a pre-scripted
  // mock response. See buildClaimRaceDb's docstring and the mutation-test
  // note at the bottom of this file.
  it('does not send a draft cancelled during the undo window — the atomic claim matches zero rows', async () => {
    const { db, step } = buildClaimRaceDb({ cancelDuringSleep: true })
    const logger = fakeLogger()

    const result = await runMailboxSend(db, step, logger, DRAFT_ID)

    expect(result).toEqual({ sent: false, reason: 'cancelled' })
    expect(step.sleepUntil).toHaveBeenCalledTimes(1)
    expect(sendReply).not.toHaveBeenCalled()
    expect(buildMimeMessage).not.toHaveBeenCalled()
    expect(getAccessTokenFor).not.toHaveBeenCalled()
  })

  it('sends and marks the draft sent on the happy path (claim genuinely matches a still-queued row)', async () => {
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'gm-1', threadId: 'gm-thread-1' })

    const { db, step } = buildClaimRaceDb({
      cancelDuringSleep: false,
      otherQueues: {
        inbox_drafts: [{ data: null, error: null }], // final 'sent' update succeeds
        inbox_threads: [
          {
            data: { gmail_thread_id: 'gm-thread-1', mailbox_account_id: ACCOUNT_ID },
            error: null,
          },
        ],
        mailbox_accounts: [
          { data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null },
        ],
        inbox_messages: [
          {
            data: { rfc822_message_id: '<abc@mail.gmail.com>', from_email: RESIDENT_EMAIL },
            error: null,
          },
        ],
      },
    })

    const result = await runMailboxSend(db, step, fakeLogger(), DRAFT_ID)

    expect(result).toEqual({ sent: true, messageId: 'gm-1' })
    expect(sendReply).toHaveBeenCalledWith('access-token', 'gm-thread-1', 'mime-message')
  })

  it('fails the draft without attempting a send when the mailbox is disconnected', async () => {
    const db = buildDb({
      inbox_drafts: [
        { data: queuedDraftRow(), error: null },
        { data: { id: DRAFT_ID }, error: null }, // claim succeeds
        { data: null, error: null }, // fail() write
      ],
      inbox_threads: [
        { data: { gmail_thread_id: 'gm-thread-1', mailbox_account_id: ACCOUNT_ID }, error: null },
      ],
      mailbox_accounts: [
        {
          data: { email_address: 'hoa@example.com', disconnected_at: '2026-01-01T00:00:00Z' },
          error: null,
        },
      ],
    })
    const step = fakeStep()

    const result = await runMailboxSend(db, step, fakeLogger(), DRAFT_ID)

    expect(result).toEqual({ sent: false, reason: 'disconnected' })
    expect(sendReply).not.toHaveBeenCalled()
    expect(getAccessTokenFor).not.toHaveBeenCalled()
  })

  it('fails the draft when there is no inbound message to reply to', async () => {
    const db = buildDb({
      inbox_drafts: [
        { data: queuedDraftRow(), error: null },
        { data: { id: DRAFT_ID }, error: null },
        { data: null, error: null }, // fail() write
      ],
      inbox_threads: [
        { data: { gmail_thread_id: 'gm-thread-1', mailbox_account_id: ACCOUNT_ID }, error: null },
      ],
      mailbox_accounts: [
        { data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null },
      ],
      inbox_messages: [{ data: null, error: null }],
    })
    const step = fakeStep()

    const result = await runMailboxSend(db, step, fakeLogger(), DRAFT_ID)

    expect(result).toEqual({ sent: false, reason: 'no_recipient' })
    expect(sendReply).not.toHaveBeenCalled()
  })

  // ─── The other irreversibility trap ────────────────────────────────────
  it('never marks the row failed when Gmail send succeeded but the status update failed — no second send', async () => {
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'gm-2', threadId: 'gm-thread-1' })

    const db = buildDb({
      inbox_drafts: [
        { data: queuedDraftRow(), error: null },
        { data: { id: DRAFT_ID }, error: null }, // claim succeeds
        // final 'sent' update itself fails (e.g. connection pool exhaustion)
        { data: null, error: { message: 'connection reset', code: '08006' } },
      ],
      inbox_threads: [
        { data: { gmail_thread_id: 'gm-thread-1', mailbox_account_id: ACCOUNT_ID }, error: null },
      ],
      mailbox_accounts: [
        { data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null },
      ],
      inbox_messages: [
        {
          data: { rfc822_message_id: '<abc@mail.gmail.com>', from_email: RESIDENT_EMAIL },
          error: null,
        },
      ],
    })
    const step = fakeStep()
    const logger = fakeLogger()

    const result = await runMailboxSend(db, step, logger, DRAFT_ID)

    // The send happened and is reported as such — a caller must not resend.
    expect(result).toEqual({ sent: true, messageId: 'gm-2' })
    // No PII in the loud log line.
    expect(logger.error).toHaveBeenCalledTimes(1)
    const loggedMessage = vi.mocked(logger.error).mock.calls[0]![0] as string
    expect(loggedMessage).not.toContain(RESIDENT_EMAIL)
    expect(loggedMessage).not.toContain('Fence')
    // db.from('inbox_drafts') was called exactly 3 times (select, claim,
    // final update) and no 4th "mark failed" write was attempted — buildDb
    // would have thrown above if the code had tried one.
  })

  // ─── The post-send update THROWS, not just returns an error ───────────
  it('never marks the row failed when the post-send status update throws (not merely returns an error)', async () => {
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'gm-3', threadId: 'gm-thread-1' })

    let draftCall = 0
    let failWriteAttempted = false
    const from = vi.fn((table: string) => {
      if (table === 'inbox_threads') {
        return makeChain({
          data: { gmail_thread_id: 'gm-thread-1', mailbox_account_id: ACCOUNT_ID },
          error: null,
        })
      }
      if (table === 'mailbox_accounts') {
        return makeChain({
          data: { email_address: 'hoa@example.com', disconnected_at: null },
          error: null,
        })
      }
      if (table === 'inbox_messages') {
        return makeChain({
          data: { rfc822_message_id: '<abc@mail.gmail.com>', from_email: RESIDENT_EMAIL },
          error: null,
        })
      }

      draftCall++
      if (draftCall === 1) return makeChain({ data: queuedDraftRow(), error: null })
      if (draftCall === 2) return makeChain({ data: { id: DRAFT_ID }, error: null }) // claim
      if (draftCall === 3) {
        // The post-send 'sent' status update — throws outright instead of
        // resolving with `{ error }`, simulating an unexpected client
        // exception rather than a returned PostgrestError.
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => {
              throw new Error('unexpected client throw')
            }),
          })),
        }
      }
      // Any further inbox_drafts write would be fail()'s 'failed' write.
      // Record that it happened but let it "succeed" so a regression here
      // surfaces via the assertion below, not via an unrelated exception.
      failWriteAttempted = true
      return makeChain({ data: null, error: null })
    })

    const db = { from } as unknown as Parameters<typeof runMailboxSend>[0]
    const step = fakeStep()
    const logger = fakeLogger()

    const result = await runMailboxSend(db, step, logger, DRAFT_ID)

    // The send happened and is reported as such — a caller must not resend.
    expect(result).toEqual({ sent: true, messageId: 'gm-3' })
    expect(failWriteAttempted).toBe(false)
  })

  it('marks the draft failed and the account auth_failed on a MailboxAuthError, then rethrows', async () => {
    vi.mocked(getAccessTokenFor).mockRejectedValueOnce(new MailboxAuthError('token revoked'))

    const db = buildDb({
      inbox_drafts: [
        { data: queuedDraftRow(), error: null },
        { data: { id: DRAFT_ID }, error: null },
        { data: null, error: null }, // fail() write
      ],
      inbox_threads: [
        { data: { gmail_thread_id: 'gm-thread-1', mailbox_account_id: ACCOUNT_ID }, error: null },
      ],
      mailbox_accounts: [
        { data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null },
      ],
      inbox_messages: [
        {
          data: { rfc822_message_id: '<abc@mail.gmail.com>', from_email: RESIDENT_EMAIL },
          error: null,
        },
      ],
    })
    const step = fakeStep()

    await expect(runMailboxSend(db, step, fakeLogger(), DRAFT_ID)).rejects.toBeInstanceOf(
      MailboxAuthError,
    )
    expect(markAuthFailed).toHaveBeenCalledWith(db, ACCOUNT_ID, 'token revoked')
    expect(sendReply).not.toHaveBeenCalled()
  })

  it('throws when the initial draft read errors, rather than treating it as not-found', async () => {
    const db = buildDb({
      inbox_drafts: [{ data: null, error: { message: 'connection reset', code: '08006' } }],
    })
    const step = fakeStep()

    await expect(runMailboxSend(db, step, fakeLogger(), DRAFT_ID)).rejects.toThrow(
      /failed to load draft/,
    )
  })

  it('throws when the claim update itself errors, rather than treating it as cancelled', async () => {
    const db = buildDb({
      inbox_drafts: [
        { data: queuedDraftRow(), error: null },
        { data: null, error: { message: 'connection reset', code: '08006' } },
      ],
    })
    const step = fakeStep()

    await expect(runMailboxSend(db, step, fakeLogger(), DRAFT_ID)).rejects.toThrow(/claim failed/)
  })
})

/**
 * Inngest does not run a function straight through. Each `step.run` /
 * `step.sleepUntil` result is memoized and reported to the executor, which
 * then RE-INVOKES the function from the top; memoized steps return their
 * recorded value instead of re-running, and every line OUTSIDE a step runs
 * again on every invocation. (See the SDK's `stepCompletionOrder` /
 * `remainingStepsToBeSeen` execution state.)
 *
 * `fakeStep()` above models a single straight-through pass, so nothing in
 * this suite exercises that replay. This harness does: `runToCompletion`
 * drives `runMailboxSend` the way the Inngest executor actually would.
 */
class StepInterrupt extends Error {}

function memoizingStep(): MailboxSendStep {
  const memo = new Map<string, unknown>()
  return {
    sleepUntil: vi.fn(async (id: string) => {
      if (memo.has(id)) return
      memo.set(id, null)
      throw new StepInterrupt(id)
    }),
    run: vi.fn(async (id: string, fn: () => Promise<unknown>) => {
      if (memo.has(id)) return memo.get(id)
      const result = await fn()
      memo.set(id, result)
      // Inngest ends the invocation here to record the step's result.
      throw new StepInterrupt(id)
    }),
  } as unknown as MailboxSendStep
}

async function runToCompletion(
  db: Parameters<typeof runMailboxSend>[0],
  step: MailboxSendStep,
  logger: MailboxSendLogger,
): Promise<unknown> {
  for (let invocation = 0; invocation < 20; invocation++) {
    try {
      return await runMailboxSend(db, step, logger, DRAFT_ID)
    } catch (error) {
      if (error instanceof StepInterrupt) continue
      throw error
    }
  }
  throw new Error('runToCompletion: function never settled')
}

/**
 * A stateful `inbox_drafts`/threads/accounts/messages fake. Unlike
 * `buildDb`'s pre-scripted queues, this one holds real mutable rows and
 * applies `.eq(...)` filters, so it answers the SAME way on a replay that
 * Postgres would — which is the entire point of these tests.
 */
function buildStatefulDb() {
  const draft: Record<string, unknown> = {
    id: DRAFT_ID,
    organization_id: 'org-1',
    thread_id: THREAD_ID,
    subject: 'Re: Fence',
    body_text: 'Thanks for writing.',
    send_after: '2026-01-01T00:00:30.000Z',
    status: 'queued',
  }

  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {}
    let pendingUpdate: Record<string, unknown> | null = null

    const rowFor = (): unknown => {
      if (table === 'inbox_threads') {
        return { gmail_thread_id: 'gmail-thread-1', mailbox_account_id: ACCOUNT_ID }
      }
      if (table === 'mailbox_accounts') {
        return { email_address: 'hoa@example.com', disconnected_at: null }
      }
      if (table === 'inbox_messages') {
        return { rfc822_message_id: '<abc@mail.gmail.com>', from_email: RESIDENT_EMAIL }
      }
      return { ...draft }
    }

    const settle = async (): Promise<Row> => {
      if (!pendingUpdate) return { data: rowFor(), error: null }
      // A conditional UPDATE: apply only if every filter matches the row.
      const matches = Object.entries(filters).every(([col, val]) =>
        col === 'id' ? val === draft.id : draft[col] === val,
      )
      if (!matches) return { data: null, error: null }
      Object.assign(draft, pendingUpdate)
      return { data: { id: DRAFT_ID }, error: null }
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      update: vi.fn((patch: Record<string, unknown>) => {
        pendingUpdate = patch
        return chain
      }),
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val
        return chain
      }),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: settle,
      then: (resolve: (r: Row) => unknown) => settle().then(resolve),
    }
    return chain
  })

  return { db: { from } as unknown as Parameters<typeof runMailboxSend>[0], draft }
}

describe('runMailboxSend under Inngest step replay', () => {
  beforeEach(() => {
    vi.mocked(sendReply).mockReset()
    vi.mocked(sendReply).mockResolvedValue({
      messageId: 'gmail-msg-1',
      threadId: 'gmail-thread-1',
    })
    vi.mocked(buildMimeMessage).mockReturnValue('mime-message')
  })

  it('sends the reply even though the claim flips the row before the next invocation', async () => {
    const { db, draft } = buildStatefulDb()

    await runToCompletion(db, memoizingStep(), fakeLogger())

    expect(sendReply).toHaveBeenCalledTimes(1)
    expect(draft.status).toBe('sent')
  })

  it('does not send when a different run already claimed the row', async () => {
    const { db, draft } = buildStatefulDb()
    draft.status = 'sending' // claimed by another run; this run's memo is empty

    const result = (await runToCompletion(db, memoizingStep(), fakeLogger())) as {
      sent: boolean
    }

    expect(sendReply).not.toHaveBeenCalled()
    expect(result.sent).toBe(false)
  })
})
