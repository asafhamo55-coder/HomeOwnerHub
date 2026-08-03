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

import {
  runMailboxSend,
  storagePathBelongsToOrg,
  resolveStorageFetchPath,
  attachmentPathIsInOrg,
  type MailboxSendStep,
  type MailboxSendLogger,
} from './mailbox-send'
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
function buildDb(queues: Record<string, Row[]>, storage?: Record<string, Buffer>) {
  const from = vi.fn((table: string) => {
    const queue = queues[table]
    if (!queue || queue.length === 0) {
      throw new Error(`buildDb: no queued result left for table "${table}"`)
    }
    return makeChain(queue.shift()!)
  })
  const download = vi.fn(async (path: string) => {
    const bytes = storage?.[path]
    if (!bytes) return { data: null, error: { message: 'Object not found' } }
    return { data: { arrayBuffer: async () => bytes }, error: null }
  })
  return { from, storage: { from: vi.fn(() => ({ download })) } } as unknown as Parameters<
    typeof runMailboxSend
  >[0]
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
    kind: 'reply',
    to_emails: [],
    cc_emails: [],
    mailbox_account_id: null,
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
        inbox_draft_attachments: [{ data: [], error: null }],
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
      // No inbox_messages result scripted: the disconnected check must run
      // and fail BEFORE the last-inbound-message read, so buildDb's loud
      // underflow throw would surface here if the job ever reached that
      // read first — proving it doesn't.
    })
    const step = fakeStep()

    const result = await runMailboxSend(db, step, fakeLogger(), DRAFT_ID)

    expect(result).toEqual({ sent: false, reason: 'disconnected' })
    expect(sendReply).not.toHaveBeenCalled()
    expect(getAccessTokenFor).not.toHaveBeenCalled()
  })

  it('fails cleanly as "disconnected" even when the last-inbound-message read would also have errored — the disconnected check must run first', async () => {
    // Double-failure case: a disconnected mailbox AND a transient
    // inbox_messages error. The disconnected check must win — a board
    // member needs "reconnect your mailbox", not a raw Postgrest message
    // from a read that was never going to matter. No inbox_messages result
    // is scripted at all: if the job read it before the disconnected
    // check, buildDb would throw "no queued result left", not return the
    // scripted error below — so this also proves the read never happens.
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

  it('sends to the recipients on the draft row, not the last inbound sender', async () => {
    const db = buildDb({
      inbox_drafts: [
        {
          data: {
            id: 'd1',
            organization_id: 'org-1',
            thread_id: 't1',
            subject: 'S',
            body_text: 'B',
            send_after: null,
            status: 'queued',
            kind: 'reply',
            to_emails: ['vendor@example.com'],
            cc_emails: ['pm@example.com'],
            mailbox_account_id: null,
          },
          error: null,
        },
        { data: { id: 'd1' }, error: null }, // claim
        { data: null, error: null }, // recordSent
      ],
      inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
      mailbox_accounts: [
        { data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null },
      ],
      inbox_messages: [
        { data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null },
      ],
      inbox_draft_attachments: [{ data: [], error: null }],
    })
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

    await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

    const args = vi.mocked(buildMimeMessage).mock.calls[0][0]
    expect(args.to).toEqual(['vendor@example.com'])
    expect(args.cc).toEqual(['pm@example.com'])
    // Threading headers still come from the last inbound message.
    expect(args.inReplyTo).toBe('<x@y>')
  })

  it('falls back to the last inbound sender for a draft queued before the migration', async () => {
    const db = buildDb({
      inbox_drafts: [
        {
          data: {
            id: 'd1',
            organization_id: 'org-1',
            thread_id: 't1',
            subject: 'S',
            body_text: 'B',
            send_after: null,
            status: 'queued',
            kind: 'reply',
            to_emails: [],
            cc_emails: [],
            mailbox_account_id: null,
          },
          error: null,
        },
        { data: { id: 'd1' }, error: null },
        { data: null, error: null },
      ],
      inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
      mailbox_accounts: [
        { data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null },
      ],
      inbox_messages: [
        { data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null },
      ],
      inbox_draft_attachments: [{ data: [], error: null }],
    })
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

    await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

    expect(vi.mocked(buildMimeMessage).mock.calls[0][0].to).toEqual(['resident@example.com'])
  })

  it('refuses to send when neither the row nor the thread yields a recipient', async () => {
    const db = buildDb({
      inbox_drafts: [
        {
          data: {
            id: 'd1',
            organization_id: 'org-1',
            thread_id: 't1',
            subject: 'S',
            body_text: 'B',
            send_after: null,
            status: 'queued',
            kind: 'reply',
            to_emails: [],
            cc_emails: [],
            mailbox_account_id: null,
          },
          error: null,
        },
        { data: { id: 'd1' }, error: null },
        { data: null, error: null }, // fail()
      ],
      inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
      mailbox_accounts: [
        { data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null },
      ],
      inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: null }, error: null }],
    })

    const result = await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

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
      inbox_draft_attachments: [{ data: [], error: null }],
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
      if (table === 'inbox_draft_attachments') {
        return makeChain({ data: [], error: null })
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
      inbox_draft_attachments: [{ data: [], error: null }],
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

  // ─── Attachments ────────────────────────────────────────────────────────
  const draftRow = {
    id: 'd1', organization_id: 'org-1', thread_id: 't1', subject: 'S', body_text: 'B',
    send_after: null, status: 'queued', kind: 'reply',
    to_emails: ['resident@example.com'], cc_emails: [], mailbox_account_id: null,
  }

  it('passes downloaded attachment bytes to buildMimeMessage', async () => {
    const db = buildDb(
      {
        inbox_drafts: [
          { data: draftRow, error: null },
          { data: { id: 'd1' }, error: null },
          { data: null, error: null },
        ],
        inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
        mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
        inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
        inbox_draft_attachments: [
          { data: [{ storage_path: 'org-1/ccrs.pdf', file_name: 'ccrs.pdf', content_type: 'application/pdf', size_bytes: 4 }], error: null },
        ],
      },
      { 'org-1/ccrs.pdf': Buffer.from('abcd') },
    )
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

    await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

    const args = vi.mocked(buildMimeMessage).mock.calls[0][0]
    expect(args.attachments).toHaveLength(1)
    // Non-null assertion: `attachments` is optional on buildMimeMessage's
    // parameter type (mailbox-send always passes it, but the type doesn't
    // know that) — the toHaveLength assertion above doesn't narrow it for
    // tsc under strictNullChecks.
    expect(args.attachments![0].fileName).toBe('ccrs.pdf')
    expect(args.attachments![0].bytes.toString()).toBe('abcd')
  })

  it('fails the draft WITHOUT sending when an attachment cannot be downloaded', async () => {
    // Custom `from`, not buildDb: this test must prove `fail()` actually
    // wrote status:'failed' to inbox_drafts, not merely that the job
    // rejected. buildDb's queues only script return VALUES, so they can't
    // tell a rethrow-without-fail() apart from a rethrow-after-fail() — a
    // regression that dropped the `await fail(...)` call would still throw
    // and still leave sendReply uncalled, and the earlier version of this
    // test would still pass. Capturing the third write's payload closes
    // that gap.
    let failWritePayload: Record<string, unknown> | undefined
    let draftCall = 0
    const from = vi.fn((table: string) => {
      if (table === 'inbox_threads') {
        return makeChain({ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null })
      }
      if (table === 'mailbox_accounts') {
        return makeChain({
          data: { email_address: 'hoa@example.com', disconnected_at: null },
          error: null,
        })
      }
      if (table === 'inbox_messages') {
        return makeChain({
          data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' },
          error: null,
        })
      }
      if (table === 'inbox_draft_attachments') {
        return makeChain({
          data: [{ storage_path: 'org-1/gone.pdf', file_name: 'ccrs.pdf', content_type: null, size_bytes: 4 }],
          error: null,
        })
      }

      draftCall++
      if (draftCall === 1) return makeChain({ data: draftRow, error: null })
      if (draftCall === 2) return makeChain({ data: { id: 'd1' }, error: null }) // claim
      // The fail() write — capture what was written instead of a canned response.
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          failWritePayload = patch
          return { eq: vi.fn(() => Promise.resolve({ data: null, error: null })) }
        }),
      }
    })
    const download = vi.fn(async () => ({ data: null, error: { message: 'Object not found' } }))
    const db = { from, storage: { from: vi.fn(() => ({ download })) } } as unknown as Parameters<
      typeof runMailboxSend
    >[0]

    await expect(runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')).rejects.toThrow()
    expect(sendReply).not.toHaveBeenCalled()
    expect(failWritePayload).toMatchObject({ status: 'failed' })
  })

  it('sends with no attachments array entry when the draft has none', async () => {
    const db = buildDb({
      inbox_drafts: [
        { data: draftRow, error: null },
        { data: { id: 'd1' }, error: null },
        { data: null, error: null },
      ],
      inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
      mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
      inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
      inbox_draft_attachments: [{ data: [], error: null }],
    })
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

    await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

    expect(vi.mocked(buildMimeMessage).mock.calls[0][0].attachments).toEqual([])
  })

  it('sends a kind=new draft with no threadId and reads the account off the row', async () => {
    const db = buildDb({
      inbox_drafts: [
        { data: { id: 'd1', organization_id: 'org-1', thread_id: null, subject: 'Annual meeting',
                  body_text: 'Hello', send_after: null, status: 'queued', kind: 'new',
                  to_emails: ['vendor@example.com'], cc_emails: [], mailbox_account_id: 'a1' },
          error: null },
        { data: { id: 'd1' }, error: null },
        { data: null, error: null },
      ],
      mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
      inbox_draft_attachments: [{ data: [], error: null }],
    })
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt-new' })

    const result = await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

    expect(result).toEqual({ sent: true, messageId: 'm1' })
    // No inbox_threads or inbox_messages read was scripted — buildDb throws if
    // the job makes one, which is the assertion that it does not.
    expect(vi.mocked(sendReply).mock.calls[0][1]).toBeNull()
    const args = vi.mocked(buildMimeMessage).mock.calls[0][0]
    expect(args.inReplyTo).toBeNull()
    expect(args.references).toEqual([])
  })

  // ─── Tenant isolation on the storage path ──────────────────────────────
  //
  // `inbox_draft_attachments`'s RLS policy constrains `organization_id` and
  // nothing else, so a board member with an ordinary authenticated browser
  // client can insert a row for their own org naming ANOTHER org's
  // storage_path. The send job downloads with the service role, which
  // bypasses storage policies, so this check is the last thing standing
  // between that row and another tenant's document being mailed out.

  function attachmentDb(storagePath: string, storedAt = storagePath) {
    return buildDb(
      {
        inbox_drafts: [
          { data: draftRow, error: null },
          { data: { id: 'd1' }, error: null },
          { data: null, error: null },
        ],
        inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
        mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
        inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
        inbox_draft_attachments: [
          {
            data: [
              { storage_path: storagePath, file_name: 'f.pdf', content_type: null, size_bytes: 4 },
            ],
            error: null,
          },
        ],
      },
      { [storedAt]: Buffer.from('abcd') },
    )
  }

  it('refuses a cross-org storage_path and sends nothing', async () => {
    // The row is scoped to org-1 (RLS is satisfied) but points at org-2's
    // document library — exactly the forged insert described above.
    const db = attachmentDb('org-2/CCRs.pdf')
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

    await expect(runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')).rejects.toThrow()
    expect(sendReply).not.toHaveBeenCalled()
  })

  it('refuses a cross-org upload path under the inbox-drafts prefix', async () => {
    const db = attachmentDb('inbox-drafts/org-2/draft-9/some-object')
    await expect(runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')).rejects.toThrow()
    expect(sendReply).not.toHaveBeenCalled()
  })

  it('refuses a traversal path that starts inside this org', async () => {
    const db = attachmentDb('org-1/../org-2/CCRs.pdf')
    await expect(runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')).rejects.toThrow()
    expect(sendReply).not.toHaveBeenCalled()
  })

  it.each([
    ['percent-encoded dot segments', 'org-1/%2e%2e/org-2/CCRs.pdf'],
    ['an LF inside a dot segment', 'org-1/.\n./org-2/x'],
  ])(
    'refuses %s, which the URL parser would have resolved to the other org',
    async (_label, path) => {
      // The storage stub is keyed by the RAW path, so if this ever regressed
      // to a plain segment check the download would succeed and the send
      // would go through — the assertion below would then fail loudly.
      const db = attachmentDb(path)
      await expect(runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')).rejects.toThrow()
      expect(sendReply).not.toHaveBeenCalled()
    },
  )

  it('marks the draft failed with the generic storage message, never the path', async () => {
    // Same handling as an unreadable object: fail() writes the existing
    // user-facing wording and the job throws, so nothing is transmitted.
    let failWritePayload: Record<string, unknown> | undefined
    let draftCall = 0
    const from = vi.fn((table: string) => {
      if (table === 'inbox_threads') {
        return makeChain({ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null })
      }
      if (table === 'mailbox_accounts') {
        return makeChain({
          data: { email_address: 'hoa@example.com', disconnected_at: null },
          error: null,
        })
      }
      if (table === 'inbox_messages') {
        return makeChain({
          data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' },
          error: null,
        })
      }
      if (table === 'inbox_draft_attachments') {
        return makeChain({
          data: [
            {
              storage_path: 'org-2/CCRs.pdf',
              file_name: 'f.pdf',
              content_type: null,
              size_bytes: 4,
            },
          ],
          error: null,
        })
      }
      draftCall++
      if (draftCall === 1) return makeChain({ data: draftRow, error: null })
      if (draftCall === 2) return makeChain({ data: { id: 'd1' }, error: null })
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          failWritePayload = patch
          return { eq: vi.fn(() => Promise.resolve({ data: null, error: null })) }
        }),
      }
    })
    const download = vi.fn()
    const db = { from, storage: { from: vi.fn(() => ({ download })) } } as unknown as Parameters<
      typeof runMailboxSend
    >[0]

    await expect(runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')).rejects.toThrow()
    expect(sendReply).not.toHaveBeenCalled()
    // Never even attempted to read the other org's bytes.
    expect(download).not.toHaveBeenCalled()
    expect(failWritePayload).toMatchObject({
      status: 'failed',
      error: 'A file attached to this reply is no longer available.',
    })
    expect(String(failWritePayload?.error)).not.toContain('org-2')
  })

  it.each([
    ['a document-library file', 'org-1/CCRs.pdf'],
    ['an inbound attachment file', 'org-1/inbox/t1/m1/a1/photo.jpg'],
    ['a browser upload', 'inbox-drafts/org-1/d1/11111111-1111-1111-1111-111111111111'],
  ])('accepts %s belonging to this org', async (_label, path) => {
    const db = attachmentDb(path)
    vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

    const result = await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

    expect(result).toEqual({ sent: true, messageId: 'm1' })
    expect(vi.mocked(buildMimeMessage).mock.calls[0][0].attachments).toHaveLength(1)
  })
})

describe('storagePathBelongsToOrg', () => {
  it.each([
    'org-1/CCRs.pdf',
    'org-1/inbox/t1/m1/a1/photo.jpg',
    'inbox-drafts/org-1/draft-1/11111111-1111-1111-1111-111111111111',
  ])('accepts %s', (path) => {
    expect(storagePathBelongsToOrg(path, 'org-1')).toBe(true)
  })

  // Segment-level only. The URL-normalization class is `attachmentPathIsInOrg`'s
  // job and is covered in its own describe below — these strings deliberately
  // still pass here, which is exactly why the second check exists.
  it.each([
    ['another org, document library', 'org-2/CCRs.pdf'],
    ['another org, inbound file', 'org-2/inbox/t1/m1/a1/photo.jpg'],
    ['another org, upload prefix', 'inbox-drafts/org-2/draft-1/object'],
    ['traversal out of this org', 'org-1/../org-2/CCRs.pdf'],
    ['traversal out of an upload prefix', 'inbox-drafts/org-1/draft-1/../../org-2/x'],
    ['a leading empty segment', '/org-1/CCRs.pdf'],
    ['a doubled separator', 'org-1//CCRs.pdf'],
    ['a trailing separator', 'org-1/'],
    ['a bare org id with no object', 'org-1'],
    ['a bare upload prefix', 'inbox-drafts/org-1'],
    ['an org id that is only a prefix of this one', 'org-11/CCRs.pdf'],
    ['an empty path', ''],
  ])('refuses %s', (_label, path) => {
    expect(storagePathBelongsToOrg(path, 'org-1')).toBe(false)
  })
})

/**
 * The storage client concatenates the key into a URL STRING and hands it to
 * `fetch`, without percent-encoding anything. The WHATWG parser then rewrites
 * that string — stripping CR/LF/TAB, decoding `%2e`, reading `\` as `/`, and
 * removing dot segments — so a key can pass a `/`-split check and still
 * request a different organization's object.
 */
describe('attachmentPathIsInOrg — the key fetch will actually request', () => {
  const CROSS_ORG_VIA_NORMALIZATION: Array<[string, string]> = [
    ['percent-encoded dot segments', 'org-1/%2e%2e/org-2/CCRs.pdf'],
    ['percent-encoded dot segments, upper case', 'org-1/%2E%2E/org-2/CCRs.pdf'],
    ['an LF inside a dot segment', 'org-1/.\n./org-2/x'],
    ['a CR inside a dot segment', 'org-1/.\r./org-2/x'],
    ['a TAB inside a dot segment', 'org-1/.\t./org-2/x'],
    ['a backslash read as a separator', 'org-1/..\\org-2/x'],
    ['the same trick under the upload prefix', 'inbox-drafts/org-1/d1/%2e%2e/%2e%2e/org-2/x'],
  ]

  it.each(CROSS_ORG_VIA_NORMALIZATION)('refuses %s', (_label, path) => {
    expect(attachmentPathIsInOrg(path, 'org-1')).toBe(false)
  })

  // These are the whole reason `attachmentPathIsInOrg` exists: every one of
  // them satisfies the segment check, so without the resolution step they
  // would have been downloaded.
  it.each(CROSS_ORG_VIA_NORMALIZATION)(
    'the segment check alone would have ACCEPTED %s — pinning why the second check exists',
    (_label, path) => {
      const segmentsAlone = storagePathBelongsToOrg(path, 'org-1')
      const resolved = resolveStorageFetchPath(path)
      // Either the raw string passed the segment check (so only resolution
      // saves us), or resolution itself refused it outright.
      expect(segmentsAlone || resolved === null).toBe(true)
    },
  )

  it('resolves the documented attack to the victim org, proving the mechanism', () => {
    expect(resolveStorageFetchPath('org-1/%2e%2e/org-2/CCRs.pdf')).toBe('org-2/CCRs.pdf')
    expect(resolveStorageFetchPath('org-1/.\n./org-2/x')).toBe('org-2/x')
  })

  it.each([
    ['a fragment marker truncating the key', 'org-1/a#b.pdf'],
    ['a query marker truncating the key', 'org-1/a?b.pdf'],
  ])('refuses %s — it would fetch a different file even inside this org', (_label, path) => {
    // Not a tenant breach, but the job would silently mail an object other
    // than the one the row names and the approver reviewed.
    expect(attachmentPathIsInOrg(path, 'org-1')).toBe(false)
  })

  it.each([
    ['a document-library file', 'org-1/CCRs.pdf'],
    ['an inbound attachment file', 'org-1/inbox/t1/m1/a1/photo.jpg'],
    ['a browser upload', 'inbox-drafts/org-1/d1/11111111-1111-1111-1111-111111111111'],
    // `sanitizeStorageName` sanitizes only the BASE of a filename and passes
    // the extension tail through untouched, so all of these are real stored
    // keys. A blanket '%' rejection would make them unattachable.
    ['a name containing a percent sign', 'org-1/1770000000-sale.pdf 50% off'],
    ['a name containing spaces and parentheses', 'org-1/1770000000-budget.pdf (final) copy'],
    ['a non-ASCII name', 'org-1/1770000000-plan.pdf Grünanlage'],
    ['a name whose percent escape is not a dot', 'org-1/a%2fb.pdf'],
  ])('accepts %s', (_label, path) => {
    expect(attachmentPathIsInOrg(path, 'org-1')).toBe(true)
  })

  it('does not throw on a lone percent sign', () => {
    expect(() => resolveStorageFetchPath('org-1/100%.pdf')).not.toThrow()
    expect(resolveStorageFetchPath('org-1/100%.pdf')).toBe('org-1/100%.pdf')
  })

  it('still refuses a plain cross-org key that needs no normalization at all', () => {
    expect(attachmentPathIsInOrg('org-2/CCRs.pdf', 'org-1')).toBe(false)
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
    kind: 'reply',
    to_emails: [],
    cc_emails: [],
    mailbox_account_id: null,
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
      if (table === 'inbox_draft_attachments') {
        return []
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
