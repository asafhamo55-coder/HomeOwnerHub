import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BL-101 A4 — "Create from this email" server actions, on a fake board
// RLS client. Synthetic ids, addresses and text only.

type R = { data: unknown; error: unknown }
interface TableFake {
  /** maybeSingle() result. */
  one?: R
  /** await (list) result. */
  list?: R
  /** insert(...).select().single() result. */
  insert?: R
  upsertError?: unknown
}

let tables: Record<string, TableFake> = {}
const inserts: Array<{ table: string; row: unknown }> = []
const upserts: Array<{ table: string; row: unknown }> = []

function fakeDb() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'board-user' } } }) },
    from(table: string) {
      const t = tables[table] ?? (table === 'org_members' ? membersTable() : {})
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) chain[m] = () => chain
      chain.maybeSingle = async () => t.one ?? { data: null, error: null }
      chain.then = (res: (r: R) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(t.list ?? { data: [], error: null }).then(res, rej)
      chain.insert = (row: unknown) => {
        inserts.push({ table, row })
        return { select: () => ({ single: async () => t.insert ?? { data: { id: 'new-1' }, error: null } }) }
      }
      chain.upsert = async (row: unknown) => {
        upserts.push({ table, row })
        return { data: null, error: t.upsertError ?? null }
      }
      return chain
    },
  }
}

let gate: { ok: true; role: 'board'; orgId: string } | { ok: false; error: string } = { ok: true, role: 'board', orgId: 'org-1' }
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeDb()) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// M-2: the BL-105 flag, flipped per test.
let authColumnLive = false
vi.mock('@homeowner-portal/mailbox', () => ({
  get SENDER_AUTH_COLUMN_LIVE() {
    return authColumnLive
  },
}))

let senderVerified = true
vi.mock('@/lib/inbox/account-context', () => ({
  latestInboundSender: (msgs: Array<{ direction: string; fromEmail: string | null }>) =>
    [...msgs].reverse().find((m) => m.direction === 'inbound')?.fromEmail?.toLowerCase() ?? null,
  checkSenderForUnit: vi.fn(async () => (senderVerified ? { verified: true } : { verified: false, reason: 'not_resident' })),
}))
vi.mock('@/lib/properties/resolve', () => ({
  asUnitId: (id: string) => id,
  resolvePropertyForUnit: vi.fn(async () => 'prop-1'),
  resolveUnitForProperty: vi.fn(async () => ({ unitIds: ['unit-1', 'unit-1b'] })),
}))
// The real trustContactTickets runs; its two reads are the fake's
// org_members table (roles) and this auth-email lookup (submitters).
let boardIds: Set<string> | null = new Set(['board-user', 'board-2'])
let authEmails: Map<string, string | null> | null = new Map()
vi.mock('@/lib/contact-updates/submitter-email', () => ({
  authSubmitterEmails: vi.fn(async (ids: string[]) => (authEmails === null ? null : new Map(ids.map((i) => [i, authEmails!.get(i) ?? null])))),
}))
const membersTable = (): TableFake =>
  boardIds === null
    ? { list: { data: null, error: { code: '57014' } } }
    : { list: { data: [...boardIds].map((user_id) => ({ user_id, role: 'board' })), error: null } }

import { createTicketFromThread, fileContactUpdateFromThread, linkExistingRecord, linkViolationToThread } from './actions'
import { CONTACT_SUBJECT, parseContactRequest } from '@/lib/contact-updates/model'

const THREAD = '11111111-1111-4111-8111-111111111111'
const TICKET = '22222222-2222-4222-8222-222222222222'
const VIOLATION = '33333333-3333-4333-8333-333333333333'

const filedThread = (): Record<string, TableFake> => ({
  inbox_threads: { one: { data: { id: THREAD, unit_id: 'unit-1' }, error: null } },
  units: { one: { data: { association_id: 'assoc-1' }, error: null } },
})

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  tables = filedThread()
  inserts.length = 0
  upserts.length = 0
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  senderVerified = true
  authColumnLive = false
  boardIds = new Set(['board-user', 'board-2'])
  authEmails = new Map([['resident-9', 'kim@example.com']])
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

const ticketInput = {
  threadId: THREAD,
  category: 'common_area',
  subject: 'Streetlight out by the mailboxes',
  description: 'The streetlight by the mailboxes has been out for a week.',
}

describe('createTicketFromThread', () => {
  it('files a board ticket on the thread’s home and links it back', async () => {
    tables.tickets = {
      insert: { data: { id: TICKET }, error: null },
      one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null },
    }
    const r = await createTicketFromThread(ticketInput)
    expect(r).toMatchObject({ ok: true, ticketId: TICKET })
    if (!r.ok) throw new Error('unreachable')
    expect(r.ack).toContain('common area request')
    expect(r.warning).toBeUndefined()

    expect(inserts).toEqual([
      {
        table: 'tickets',
        row: {
          organization_id: 'org-1',
          association_id: 'assoc-1',
          unit_id: 'unit-1',
          submitted_by: 'board-user',
          category: 'common_area',
          subject: ticketInput.subject,
          description: ticketInput.description,
          status: 'open',
        },
      },
    ])
    expect(upserts).toEqual([
      {
        table: 'inbox_thread_links',
        row: { organization_id: 'org-1', thread_id: THREAD, resource_type: 'ticket', resource_id: TICKET, created_by: 'board-user' },
      },
    ])
  })

  it('keeps the ticket and warns when the link fails', async () => {
    tables.tickets = { insert: { data: { id: TICKET }, error: null }, one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null } }
    tables.inbox_thread_links = { upsertError: { code: '42501' } }
    const r = await createTicketFromThread(ticketInput)
    expect(r).toMatchObject({ ok: true, ticketId: TICKET })
    expect(r.ok && r.warning).toMatch(/couldn’t be linked/)
  })

  it('validates fields before touching the database', async () => {
    const r = await createTicketFromThread({ ...ticketInput, category: 'pool', subject: 'Hi', description: 'short' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(['category', 'description', 'subject'])
    expect(inserts).toEqual([])
  })

  it('refuses the contact-update subject (Approvals would parse it as one)', async () => {
    const r = await createTicketFromThread({ ...ticketInput, subject: CONTACT_SUBJECT })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.fieldErrors?.subject).toMatch(/reserved/)
    expect(inserts).toEqual([])
  })

  it('refuses a bad thread id, an unfiled thread and a foreign thread', async () => {
    expect((await createTicketFromThread({ ...ticketInput, threadId: 'nope' })).ok).toBe(false)

    tables.inbox_threads = { one: { data: { id: THREAD, unit_id: null }, error: null } }
    expect(await createTicketFromThread(ticketInput)).toEqual({ ok: false, error: 'File this email under a home first.' })

    tables.inbox_threads = { one: { data: null, error: null } }
    expect(await createTicketFromThread(ticketInput)).toEqual({ ok: false, error: 'Thread not found.' })
    expect(inserts).toEqual([])
  })

  it('is board-only', async () => {
    gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await createTicketFromThread(ticketInput)).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(inserts).toEqual([])
  })

  it('logs ids and codes only, never the email text', async () => {
    tables.tickets = { insert: { data: null, error: { code: '23514', message: ticketInput.description } } }
    const r = await createTicketFromThread(ticketInput)
    expect(r.ok).toBe(false)
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).toContain('23514')
    expect(logged).not.toContain('streetlight')
    expect(logged).not.toContain('Streetlight')
  })
})

describe('linkExistingRecord', () => {
  it('links a record on the thread’s home (any unit on the same lot)', async () => {
    tables.tickets = { one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1b' }, error: null } }
    expect(await linkExistingRecord({ threadId: THREAD, type: 'ticket', id: TICKET })).toEqual({ ok: true, message: 'Linked.' })
    expect(upserts).toHaveLength(1)
  })

  it('refuses a record on a different home — the picker’s scope is enforced', async () => {
    tables.tickets = { one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-9' }, error: null } }
    expect(await linkExistingRecord({ threadId: THREAD, type: 'ticket', id: TICKET })).toEqual({ ok: false, error: 'That record is for a different home.' })
    tables.hoa_violations = { one: { data: { id: VIOLATION, org_id: 'org-1', property_id: 'prop-2' }, error: null } }
    expect((await linkExistingRecord({ threadId: THREAD, type: 'violation', id: VIOLATION })).ok).toBe(false)
    expect(upserts).toEqual([])
  })

  it('refuses a type outside tickets, ARC and violations', async () => {
    expect(await linkExistingRecord({ threadId: THREAD, type: 'communication_thread', id: TICKET })).toEqual({ ok: false, error: 'Invalid link target.' })
  })
})

describe('linkViolationToThread', () => {
  it('links the violation the wizard just recorded', async () => {
    tables.hoa_violations = { one: { data: { id: VIOLATION, org_id: 'org-1', property_id: 'prop-1' }, error: null } }
    expect(await linkViolationToThread({ threadId: THREAD, violationId: VIOLATION })).toEqual({ ok: true, message: 'Linked to the email.' })
    expect(upserts[0]!.row).toMatchObject({ resource_type: 'violation', resource_id: VIOLATION })
  })

  it('refuses non-uuids without a session read', async () => {
    expect(await linkViolationToThread({ threadId: THREAD, violationId: 'x' })).toEqual({ ok: false, error: 'Invalid link target.' })
  })
})

describe('fileContactUpdateFromThread', () => {
  beforeEach(() => {
    tables.inbox_messages = {
      list: { data: [{ direction: 'inbound', from_email: 'Pat@Example.com' }], error: null },
    }
  })

  it('files a PR-10 request naming the sender by the address they wrote from', async () => {
    tables.tickets = {
      list: { data: [], error: null },
      insert: { data: { id: TICKET }, error: null },
      one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r).toMatchObject({ ok: true })
    const row = inserts[0]!.row as { subject: string; description: string; submitted_by: string }
    expect(row.subject).toBe(CONTACT_SUBJECT)
    expect(row.submitted_by).toBe('board-user')
    const parsed = parseContactRequest(row.subject, row.description)
    expect(parsed).toMatchObject({ signInEmail: 'pat@example.com', channel: 'inbox' })
    expect(parsed!.changes.phone).toBeTruthy()
  })

  it('refuses an unverified sender (anyone could ask for a resident’s details to change)', async () => {
    senderVerified = false
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r.ok).toBe(false)
    expect(inserts).toEqual([])
  })

  it('BL-105: refuses a sender whose email failed authentication, saying why, and checks this thread', async () => {
    const { checkSenderForUnit } = await import('@/lib/inbox/account-context')
    vi.mocked(checkSenderForUnit).mockResolvedValueOnce({ verified: false, reason: 'sender_unauthenticated' })
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.error).toMatch(/failed the sender authentication check/)
    expect(vi.mocked(checkSenderForUnit).mock.calls.at(-1)![4]).toEqual({ threadId: THREAD })
    expect(inserts).toEqual([])
  })

  it('refuses a second waiting request for the same sender', async () => {
    tables.tickets = {
      list: {
        data: [{ id: 'old', subject: CONTACT_SUBJECT, description: 'Phone: (555) 201-0000\nEmailed in by: pat@example.com', submitted_by: 'board-2' }],
        error: null,
      },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.error).toMatch(/already waiting/)
    expect(inserts).toEqual([])
  })

  it('a resident’s hand-typed "Emailed in by" ticket does not block the filing', async () => {
    tables.tickets = {
      list: {
        data: [{ id: 'forged', subject: CONTACT_SUBJECT, description: 'Phone: (555) 201-0000\nEmailed in by: pat@example.com', submitted_by: 'resident-9' }],
        error: null,
      },
      insert: { data: { id: TICKET }, error: null },
      one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r).toMatchObject({ ok: true })
    expect(inserts.filter((i) => i.table === 'tickets')).toHaveLength(1)
  })

  it('a resident’s own portal request for the sender blocks it; one with a typed sender address does not', async () => {
    const own = 'Phone: (555) 201-0000\nSigned in as: pat@example.com'
    tables.tickets = { list: { data: [{ id: 'own', subject: CONTACT_SUBJECT, description: own, submitted_by: 'resident-pat' }], error: null } }
    authEmails = new Map([['resident-pat', 'pat@example.com']])
    const blocked = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(!blocked.ok && blocked.error).toMatch(/already waiting/)

    // Kim types Pat's address: not Kim's sign-in, so not a request at all.
    tables.tickets = {
      list: { data: [{ id: 'typed', subject: CONTACT_SUBJECT, description: own, submitted_by: 'resident-9' }], error: null },
      insert: { data: { id: TICKET }, error: null },
      one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r).toMatchObject({ ok: true })
  })

  it('fails closed when a waiting request’s submitter email can’t be read', async () => {
    authEmails = null
    tables.tickets = {
      list: { data: [{ id: 'own', subject: CONTACT_SUBJECT, description: 'Phone: (555) 201-0000\nSigned in as: pat@example.com', submitted_by: 'resident-pat' }], error: null },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r.ok).toBe(false)
    expect(inserts).toEqual([])
  })

  it('fails closed when the submitters’ roles can’t be read', async () => {
    boardIds = null
    tables.tickets = {
      list: {
        data: [{ id: 'old', subject: CONTACT_SUBJECT, description: 'Phone: (555) 201-0000\nEmailed in by: pat@example.com', submitted_by: 'board-2' }],
        error: null,
      },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '', mailing: '' })
    expect(r.ok).toBe(false)
    expect(inserts).toEqual([])
  })

  it('M-2: refuses any email change while BL-105 is off, pointing the resident to the portal', async () => {
    tables.tickets = {
      list: { data: [], error: null },
      insert: { data: { id: TICKET }, error: null },
      one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: 'attacker@evil.example', mailing: '' })
    expect(r).toMatchObject({ ok: false, error: 'Ask the resident to change their email in the portal.' })
    expect(!r.ok && r.fieldErrors?.email).toBeTruthy()
    expect(inserts).toEqual([])
  })

  it('M-2: phone and mailing changes still go through board approval while BL-105 is off', async () => {
    tables.tickets = {
      list: { data: [], error: null },
      insert: { data: { id: TICKET }, error: null },
      one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '555-201-3344', email: '  ', mailing: '12 Oak Lane, Springfield, IL 62701' })
    expect(r).toMatchObject({ ok: true })
    const row = inserts[0]!.row as { subject: string; description: string }
    const parsed = parseContactRequest(row.subject, row.description)
    expect(parsed!.changes.phone).toBeTruthy()
    expect(parsed!.changes.mailing).toBeTruthy()
    expect(parsed!.changes.email).toBeFalsy()
  })

  it('M-2: once BL-105 is live, an email change from a verified sender is filed for approval', async () => {
    authColumnLive = true
    tables.tickets = {
      list: { data: [], error: null },
      insert: { data: { id: TICKET }, error: null },
      one: { data: { id: TICKET, organization_id: 'org-1', unit_id: 'unit-1' }, error: null },
    }
    const r = await fileContactUpdateFromThread({ threadId: THREAD, phone: '', email: 'pat.new@example.com', mailing: '' })
    expect(r).toMatchObject({ ok: true })
    const row = inserts[0]!.row as { subject: string; description: string }
    expect(parseContactRequest(row.subject, row.description)!.changes.email).toBeTruthy()
  })

  it('needs at least one field, and not the address they wrote from', async () => {
    authColumnLive = true
    tables.tickets = { list: { data: [], error: null } }
    expect((await fileContactUpdateFromThread({ threadId: THREAD, phone: '', email: '', mailing: '' })).ok).toBe(false)
    expect((await fileContactUpdateFromThread({ threadId: THREAD, phone: '', email: 'pat@example.com', mailing: '' })).ok).toBe(false)
    expect(inserts).toEqual([])
  })
})
