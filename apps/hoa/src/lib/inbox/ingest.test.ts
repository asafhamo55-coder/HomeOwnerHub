import { describe, expect, it } from 'vitest'
import { computeDirection, ingestMessages } from './ingest'
import type { ParsedMessage } from '@homeowner-portal/mailbox'

/**
 * `computeDirection` is the fix for the Phase B bug where every ingested
 * message (including the HOA's own sent replies, now in scope per
 * `buildScopeQuery`'s `from:<mailbox address>` clause) was hardcoded
 * 'inbound'. See the doc comment on `computeDirection` in ./ingest.ts for
 * the full story.
 */
describe('computeDirection', () => {
  it('is outbound when the From address equals the mailbox address', () => {
    expect(computeDirection('board@oakwoodhoa.org', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('is inbound when the From address differs from the mailbox address', () => {
    expect(computeDirection('resident@gmail.com', 'board@oakwoodhoa.org')).toBe('inbound')
  })

  it('matches case-insensitively', () => {
    expect(computeDirection('Board@OakwoodHOA.org', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('matches after trimming surrounding whitespace', () => {
    expect(computeDirection('  board@oakwoodhoa.org  ', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('matches case-insensitively AND after trimming, combined', () => {
    expect(computeDirection('  Board@OakwoodHOA.org  ', 'board@oakwoodhoa.org')).toBe('outbound')
  })

  it('is inbound (not a crash, not a match) when fromEmail is null', () => {
    expect(computeDirection(null, 'board@oakwoodhoa.org')).toBe('inbound')
  })

  it('does not coerce null to the string "null" and match a literal "null" address', () => {
    // Guards against `String(null) === 'null'` sneaking a match through.
    expect(computeDirection(null, 'null')).toBe('inbound')
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * ingestMessages — identity is ORGANIZATION-scoped (migration 0048)
 *
 * The bug these tests pin down: Gmail message/thread identity used to be
 * keyed on mailbox_account_id, the row in `mailbox_accounts`. Disconnecting
 * and reconnecting a mailbox mints a NEW account row for the SAME Google
 * mailbox, so every already-stored message stopped being findable and the
 * reconnect's backfill re-imported the entire history — 437 duplicate
 * messages and 229 duplicate threads at Madison Park, from one reconnect.
 *
 * The fake below is deliberately strict about two things a looser mock
 * would let slide, because both are exactly how this regression would come
 * back:
 *
 *   1. It enforces the REAL unique indexes from 0048 —
 *      (organization_id, gmail_message_id) and
 *      (organization_id, gmail_thread_id) — independently of whatever the
 *      code passes as `onConflict`. So "no duplicate row" is a property of
 *      the database as migrated, not of the assertion agreeing with the
 *      code under test.
 *   2. It rejects an `onConflict` target that is not one of those indexes
 *      with Postgres' real 42P10, the way PostgREST does. A stale
 *      `mailbox_account_id,gmail_message_id` target therefore FAILS here
 *      rather than quietly appearing to work.
 * ──────────────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>

/** The unique indexes that actually exist on these tables after 0048. */
const UNIQUE_INDEXES: Record<string, string[][]> = {
  inbox_threads: [['organization_id', 'gmail_thread_id']],
  inbox_messages: [['organization_id', 'gmail_message_id']],
  inbox_attachments: [['message_id', 'file_name', 'gmail_attachment_key']],
}

type IngestDb = Parameters<typeof ingestMessages>[0]

function fakeDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    inbox_threads: [...(seed.inbox_threads ?? [])],
    inbox_messages: [...(seed.inbox_messages ?? [])],
    inbox_attachments: [...(seed.inbox_attachments ?? [])],
  }
  let seq = 0

  function from(table: string) {
    const filters: Array<[string, unknown]> = []
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: Row = {}
    let conflict: string[] = []
    let ignoreDuplicates = false

    const rows = () => tables[table] ?? (tables[table] = [])
    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value)

    function run(): { data: Row[] | null; error: Row | null } {
      const indexes = UNIQUE_INDEXES[table] ?? []

      if (mode === 'select') {
        return { data: rows().filter(matches).map((row) => ({ ...row })), error: null }
      }

      if (mode === 'update') {
        const hits = rows().filter(matches)
        for (const row of hits) Object.assign(row, payload)
        return { data: hits.map((row) => ({ ...row })), error: null }
      }

      // inbox_attachments.gmail_attachment_key is a generated column
      // (COALESCE(gmail_attachment_id, '')); materialize it so the unique
      // index below behaves the way the real one does.
      if (table === 'inbox_attachments') {
        payload = { ...payload, gmail_attachment_key: payload.gmail_attachment_id ?? '' }
      }

      if (mode === 'upsert') {
        const targetsARealIndex = indexes.some(
          (cols) => cols.length === conflict.length && cols.every((c) => conflict.includes(c)),
        )
        if (!targetsARealIndex) {
          // Postgres' undefined_object for ON CONFLICT, as PostgREST surfaces it.
          return {
            data: null,
            error: {
              code: '42P10',
              message:
                `there is no unique or exclusion constraint on "${table}" matching the ` +
                `ON CONFLICT specification (${conflict.join(', ')})`,
            },
          }
        }
      }

      for (const cols of indexes) {
        const duplicate = rows().find((row) => cols.every((c) => row[c] === payload[c]))
        if (!duplicate) continue
        if (mode === 'insert') {
          return {
            data: null,
            error: { code: '23505', message: `duplicate key value violates unique constraint` },
          }
        }
        if (ignoreDuplicates) return { data: [], error: null }
        Object.assign(duplicate, payload)
        return { data: [{ ...duplicate }], error: null }
      }

      const row: Row = { id: `${table}-${++seq}`, ...payload }
      rows().push(row)
      return { data: [{ ...row }], error: null }
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (values: Row) => {
        mode = 'insert'
        payload = values
        return builder
      },
      upsert: (values: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        mode = 'upsert'
        payload = values
        conflict = opts?.onConflict ? opts.onConflict.split(',').map((c) => c.trim()) : []
        ignoreDuplicates = opts?.ignoreDuplicates ?? false
        return builder
      },
      update: (values: Row) => {
        mode = 'update'
        payload = values
        return builder
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return builder
      },
      maybeSingle: () => {
        const { data, error } = run()
        return Promise.resolve({ data: error ? null : (data?.[0] ?? null), error })
      },
      single: () => {
        const { data, error } = run()
        if (error) return Promise.resolve({ data: null, error })
        if (!data?.length) {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST116', message: 'no rows returned' },
          })
        }
        return Promise.resolve({ data: data[0], error: null })
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(onFulfilled, onRejected),
    }

    return builder
  }

  return { db: { from } as unknown as IngestDb, tables }
}

const ORG = 'org-madison-park'
const MAILBOX = 'board@madisonpark.org'
/** The account row before the disconnect, and the new one minted after it. */
const ACCOUNT_BEFORE = 'acct-before-reconnect'
const ACCOUNT_AFTER = 'acct-after-reconnect'

function parsed(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    gmailMessageId: 'gmail-msg-1',
    gmailThreadId: 'gmail-thread-1',
    rfc822MessageId: '<abc@mail.gmail.com>',
    inReplyTo: null,
    references: [],
    fromEmail: 'resident@gmail.com',
    fromName: 'Jenna Rivera',
    toEmails: [MAILBOX],
    ccEmails: [],
    deliveredTo: [MAILBOX],
    subject: 'Gate remote not working',
    bodyText: 'The gate remote stopped working.',
    bodyHtml: null,
    strippedText: 'The gate remote stopped working.',
    attachments: [],
    sentAt: '2026-07-01T10:00:00.000Z',
    labelIds: ['INBOX'],
    ...over,
  }
}

describe('ingestMessages — a mailbox reconnect is a no-op, not a re-import', () => {
  it('re-ingesting the same gmail_message_id under a DIFFERENT mailbox_account_id inserts nothing', async () => {
    const { db, tables } = fakeDb()

    const first = await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [parsed()])
    expect(first.messagesInserted).toBe(1)
    expect(first.threadsCreated).toBe(1)

    // The disconnect/reconnect: same org, same Google mailbox, brand-new
    // mailbox_accounts row, and the backfill hands us the same mail again.
    const second = await ingestMessages(db, ORG, ACCOUNT_AFTER, MAILBOX, [parsed()])
    expect(second.messagesInserted).toBe(0)
    expect(second.messagesSkipped).toBe(1)
    expect(second.threadsCreated).toBe(0)

    expect(tables.inbox_messages).toHaveLength(1)
    expect(tables.inbox_threads).toHaveLength(1)
  })

  it('re-ingesting a whole thread under a new account creates no duplicate thread or messages', async () => {
    const { db, tables } = fakeDb()
    const batch = [
      parsed({ gmailMessageId: 'm1', sentAt: '2026-07-01T10:00:00.000Z' }),
      parsed({ gmailMessageId: 'm2', sentAt: '2026-07-02T10:00:00.000Z' }),
      parsed({ gmailMessageId: 'm3', sentAt: '2026-07-03T10:00:00.000Z' }),
    ]

    await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, batch)
    await ingestMessages(db, ORG, ACCOUNT_AFTER, MAILBOX, batch)

    expect(tables.inbox_messages).toHaveLength(3)
    expect(tables.inbox_threads).toHaveLength(1)
  })

  it('re-stamps provenance so mailbox_account_id follows the live connection', async () => {
    const { db, tables } = fakeDb()

    await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [parsed()])
    expect(tables.inbox_threads[0].mailbox_account_id).toBe(ACCOUNT_BEFORE)
    expect(tables.inbox_messages[0].mailbox_account_id).toBe(ACCOUNT_BEFORE)

    await ingestMessages(db, ORG, ACCOUNT_AFTER, MAILBOX, [parsed()])
    expect(tables.inbox_threads[0].mailbox_account_id).toBe(ACCOUNT_AFTER)
    expect(tables.inbox_messages[0].mailbox_account_id).toBe(ACCOUNT_AFTER)
  })

  it('still inserts a genuinely new message', async () => {
    const { db, tables } = fakeDb()

    await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [parsed()])
    const result = await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [
      parsed({ gmailMessageId: 'gmail-msg-2', sentAt: '2026-07-04T10:00:00.000Z' }),
    ])

    expect(result.messagesInserted).toBe(1)
    expect(result.messagesSkipped).toBe(0)
    expect(tables.inbox_messages).toHaveLength(2)
    // Same Gmail thread — one thread row carrying both messages.
    expect(tables.inbox_threads).toHaveLength(1)
  })

  it('still inserts a genuinely new message that arrives on a new thread', async () => {
    const { db, tables } = fakeDb()

    await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [parsed()])
    const result = await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [
      parsed({ gmailMessageId: 'gmail-msg-9', gmailThreadId: 'gmail-thread-9' }),
    ])

    expect(result.messagesInserted).toBe(1)
    expect(result.threadsCreated).toBe(1)
    expect(tables.inbox_threads).toHaveLength(2)
  })

  it('does NOT dedupe across organizations — the cross-tenant guard from 0030 survives', async () => {
    // This is the reason identity is org-scoped rather than global. Gmail
    // guarantees message-id uniqueness only within a mailbox, so two
    // tenants can legitimately collide. If someone ever "simplifies" the
    // conflict target to gmail_message_id alone, the second HOA's real
    // email vanishes with no error and no log line — and this test fails.
    const { db, tables } = fakeDb()

    await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [parsed()])
    const other = await ingestMessages(db, 'org-oakwood', 'acct-oakwood', 'board@oakwood.org', [
      parsed(),
    ])

    expect(other.messagesInserted).toBe(1)
    expect(other.threadsCreated).toBe(1)
    expect(tables.inbox_messages).toHaveLength(2)
    expect(tables.inbox_threads).toHaveLength(2)
  })
})

describe('ingestMessages — a re-import never resets board-owned triage state', () => {
  /**
   * status, assigned_to, unit_id, resident_id, vendor_id, match_confidence,
   * match_reason and match_source are the board's work, not Gmail's. A
   * reconnect re-delivering old mail must leave every one of them alone —
   * a silent revert to 'needs_review' / 'none' would un-file a manager's
   * triage with no error anywhere to explain it.
   */
  const TRIAGE = {
    status: 'open',
    assigned_to: 'user-manager-1',
    unit_id: 'unit-214',
    resident_id: 'res-jenna',
    vendor_id: 'vendor-abc-landscaping',
    match_confidence: 'high',
    match_reason: { rule: 'manual', matched_on: 'manager' },
    match_source: 'manual',
  } as const

  it('leaves every triage field untouched when the same mail is re-imported', async () => {
    const { db, tables } = fakeDb()

    await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [parsed()])

    // A manager triages the thread.
    Object.assign(tables.inbox_threads[0], TRIAGE)

    await ingestMessages(db, ORG, ACCOUNT_AFTER, MAILBOX, [parsed()])

    expect(tables.inbox_threads[0]).toMatchObject(TRIAGE)
  })

  it('advances the activity fields while still leaving triage alone', async () => {
    // The thread row must not become read-only either — new mail on a
    // triaged thread still has to move subject/last_message_at.
    const { db, tables } = fakeDb()

    await ingestMessages(db, ORG, ACCOUNT_BEFORE, MAILBOX, [parsed()])
    Object.assign(tables.inbox_threads[0], TRIAGE)

    await ingestMessages(db, ORG, ACCOUNT_AFTER, MAILBOX, [
      parsed({
        gmailMessageId: 'gmail-msg-later',
        subject: 'Re: Gate remote not working',
        sentAt: '2026-07-09T10:00:00.000Z',
      }),
    ])

    expect(tables.inbox_threads[0]).toMatchObject(TRIAGE)
    expect(tables.inbox_threads[0].subject).toBe('Re: Gate remote not working')
    expect(tables.inbox_threads[0].last_message_at).toBe('2026-07-09T10:00:00.000Z')
  })
})
