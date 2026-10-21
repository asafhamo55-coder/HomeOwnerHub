/**
 * Migration 0067 (migrations/0067_m3_batch.sql, batch M3) against real
 * Postgres. CI only (no local database).
 *
 *   1. BL-136 assessments.source: 'opening_balance' or NULL, anything else
 *      23514; the board writes it through its own client, a resident
 *      cannot write charges at all; the late-fee job's `.or()` filter
 *      keeps NULL-source charges and drops opening balances.
 *   2. BL-134 inbox_threads reply clock (inbox_messages_reply_clock):
 *      first_inbound_at / first_response_at follow the messages in any
 *      ingest order; snoozed_until is board-writable only (RLS), and a
 *      new inbound message wakes a snoozed thread while a history import
 *      of old mail does not.
 *   3. BL-134 inbox_thread_links_validate: a link to a record that is not
 *      in the link's org (any type, incl. hoa_violations.org_id), or to
 *      another org's thread, is refused with 23503; a real one is not.
 *   4. BL-134 hoa_documents.source_inbox_attachment_id: same-org attachment
 *      only (23503 otherwise); deleting the attachment nulls it.
 *   5. BL-131 compliance_deadlines_done: board/admin of the org read and
 *      write; a resident and another org's board see nothing and write
 *      nothing; the association must be the row's org's; one row per
 *      (association, code); malformed codes refused.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only;
 * no PII. New columns are not in the generated Database types until
 * gen:types runs after prod has 0067 (CLAUDE.md footgun 3), hence the casts.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  adminDb,
  makeAccounting,
  makeOrg,
  makeUnit,
  mintUser,
  type AccountingRefs,
  type OrgFixture,
  type TestUser,
} from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let admin: TestUser
let resident: TestUser
let otherBoard: TestUser

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  resident = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
})

// ─── seed helpers (service role) ─────────────────────────────────────

async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb()
    .from(table as never)
    .insert(row as never)
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed ${table}: ${error?.code ?? 'no row'}`)
  return (data as { id: string }).id
}

async function makeThread(f: OrgFixture): Promise<string> {
  const mailbox = await insertOne('mailbox_accounts', {
    organization_id: f.orgId,
    email_address: `board-${randomUUID().slice(0, 8)}@example.test`,
  })
  const threadId = await insertOne('inbox_threads', {
    organization_id: f.orgId,
    mailbox_account_id: mailbox,
    gmail_thread_id: `t-${randomUUID()}`,
  })
  mailboxOf.set(threadId, mailbox)
  return threadId
}

/**
 * inbox_messages.mailbox_account_id is NOT NULL with no default (0030 sets
 * it after backfilling from the thread); ingest copies the thread's, so
 * the seed does too.
 */
const mailboxOf = new Map<string, string>()

async function addMessage(f: OrgFixture, threadId: string, direction: 'inbound' | 'outbound', sentAt: string): Promise<string> {
  return insertOne('inbox_messages', {
    organization_id: f.orgId,
    mailbox_account_id: mailboxOf.get(threadId) ?? (() => { throw new Error('seed inbox_messages: thread not made by makeThread') })(),
    thread_id: threadId,
    gmail_message_id: `m-${randomUUID()}`,
    direction,
    sent_at: sentAt,
  })
}

async function threadCols(threadId: string): Promise<Record<string, string | null>> {
  const { data, error } = await adminDb()
    .from('inbox_threads')
    .select('first_inbound_at, first_response_at, snoozed_until' as never)
    .eq('id', threadId)
    .single()
  if (error || !data) throw new Error(`read thread: ${error?.code ?? 'no row'}`)
  const row = data as unknown as Record<string, string | null>
  const iso = (v: string | null) => (v === null ? null : new Date(v).toISOString())
  return {
    first_inbound_at: iso(row.first_inbound_at),
    first_response_at: iso(row.first_response_at),
    snoozed_until: iso(row.snoozed_until),
  }
}

// ─── 1. BL-136 ───────────────────────────────────────────────────────

describe('1. assessments.source (BL-136)', () => {
  let acct: AccountingRefs
  let unitId: string

  beforeEach(async () => {
    acct = await makeAccounting(org)
    unitId = await makeUnit(org)
  })

  const charge = (extra: Record<string, unknown> = {}) => ({
    organization_id: org.orgId,
    association_id: org.associationId,
    unit_id: unitId,
    fiscal_period_id: acct.fiscalPeriodId,
    assessment_type: 'regular',
    amount: 100,
    due_date: '2026-01-01',
    status: 'open',
    ...extra,
  })

  it("the board's own client writes source = 'opening_balance' (the executor's column)", async () => {
    const { data, error } = await board.client
      .from('assessments')
      .insert(charge({ source: 'opening_balance' }) as never)
      .select('id, source' as never)
      .single()
    expect(error).toBeNull()
    expect((data as unknown as { source: string }).source).toBe('opening_balance')
  })

  it('NULL by default; any other value is refused with 23514', async () => {
    const { data } = await adminDb().from('assessments').insert(charge() as never).select('source' as never).single()
    expect((data as unknown as { source: string | null }).source).toBeNull()
    const { error } = await adminDb().from('assessments').insert(charge({ source: 'imported' }) as never)
    expect(error?.code).toBe('23514')
  })

  it('a resident cannot write a charge, source or not', async () => {
    const { error } = await resident.client.from('assessments').insert(charge({ source: 'opening_balance' }) as never)
    expect(error?.code).toBe('42501')
  })

  it("the late-fee job's filter keeps ordinary charges and drops opening balances (NULL-safe)", async () => {
    const dues = await insertOne('assessments', charge())
    await insertOne('assessments', charge({ source: 'opening_balance' }))
    // Same expression as packages/jobs/src/hoa-late-fees.ts findUnchargedDefaults.
    const { data, error } = await adminDb()
      .from('assessments')
      .select('id')
      .eq('association_id', org.associationId)
      .or('source.is.null,source.neq.opening_balance')
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.id)).toEqual([dues])
  })
})

// ─── 2. BL-134 reply clock + snooze ──────────────────────────────────

describe('2. inbox_threads reply clock and snooze (BL-134)', () => {
  let threadId: string
  beforeEach(async () => {
    threadId = await makeThread(org)
  })

  it('first_inbound_at / first_response_at follow the messages, whatever the ingest order', async () => {
    // An outbound before any inbound (the board started it) is not a reply.
    await addMessage(org, threadId, 'outbound', '2026-10-01T09:00:00Z')
    expect(await threadCols(threadId)).toMatchObject({ first_inbound_at: null, first_response_at: null })

    await addMessage(org, threadId, 'inbound', '2026-10-02T08:00:00Z')
    expect(await threadCols(threadId)).toMatchObject({ first_inbound_at: '2026-10-02T08:00:00.000Z', first_response_at: null })

    await addMessage(org, threadId, 'outbound', '2026-10-02T13:00:00Z')
    expect(await threadCols(threadId)).toMatchObject({
      first_inbound_at: '2026-10-02T08:00:00.000Z',
      first_response_at: '2026-10-02T13:00:00.000Z',
    })

    // A history import inserts an older inbound later: both move back.
    await addMessage(org, threadId, 'inbound', '2026-09-30T08:00:00Z')
    expect(await threadCols(threadId)).toMatchObject({
      first_inbound_at: '2026-09-30T08:00:00.000Z',
      first_response_at: '2026-10-01T09:00:00.000Z',
    })
  })

  it('the board snoozes through its own client; a resident and another org’s board cannot', async () => {
    const until = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    const asResident = await resident.client
      .from('inbox_threads')
      .update({ snoozed_until: until } as never)
      .eq('id', threadId)
      .select('id')
    expect(asResident.data ?? []).toHaveLength(0)
    const asOther = await otherBoard.client
      .from('inbox_threads')
      .update({ snoozed_until: until } as never)
      .eq('id', threadId)
      .select('id')
    expect(asOther.data ?? []).toHaveLength(0)
    expect((await threadCols(threadId)).snoozed_until).toBeNull()

    const asBoard = await board.client
      .from('inbox_threads')
      .update({ snoozed_until: until } as never)
      .eq('id', threadId)
      .eq('organization_id', org.orgId)
      .select('id')
    expect(asBoard.error).toBeNull()
    expect(asBoard.data).toHaveLength(1)
    expect((await threadCols(threadId)).snoozed_until).toBe(until)
  })

  it('a new inbound message wakes a snoozed thread; an imported old one does not', async () => {
    const until = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    await adminDb().from('inbox_threads').update({ snoozed_until: until } as never).eq('id', threadId)

    await addMessage(org, threadId, 'inbound', '2026-01-01T08:00:00Z')
    expect((await threadCols(threadId)).snoozed_until).toBe(until)
    await addMessage(org, threadId, 'outbound', new Date().toISOString())
    expect((await threadCols(threadId)).snoozed_until).toBe(until)

    await addMessage(org, threadId, 'inbound', new Date().toISOString())
    expect((await threadCols(threadId)).snoozed_until).toBeNull()
  })

  it('the snoozed / awake split the inbox queries use works through PostgREST', async () => {
    const asleep = await makeThread(org)
    const nowIso = new Date().toISOString()
    await adminDb()
      .from('inbox_threads')
      .update({ snoozed_until: new Date(Date.now() + 86_400_000).toISOString() } as never)
      .eq('id', asleep)
    const awake = await board.client
      .from('inbox_threads')
      .select('id')
      .eq('organization_id', org.orgId)
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
    expect((awake.data ?? []).map((r) => r.id)).toEqual([threadId])
    const snoozed = await board.client
      .from('inbox_threads')
      .select('id')
      .eq('organization_id', org.orgId)
      .gt('snoozed_until' as never, nowIso)
    expect((snoozed.data ?? []).map((r) => r.id)).toEqual([asleep])
  })
})

// ─── 3. BL-134 thread link validation ────────────────────────────────

describe('3. inbox_thread_links validation trigger (BL-134 B3)', () => {
  let threadId: string
  let ticketId: string
  let violationId: string

  beforeEach(async () => {
    threadId = await makeThread(org)
    ticketId = await insertOne('tickets', {
      organization_id: org.orgId,
      association_id: org.associationId,
      submitted_by: resident.id,
      category: 'general',
      subject: 'Gate',
      description: 'The gate sticks',
      status: 'open',
    })
    violationId = await insertOne('hoa_violations', {
      org_id: org.orgId,
      violation_type: 'lawn',
      description: 'tall grass',
      status: 'open',
    })
  })

  const link = (resourceType: string, resourceId: string, extra: Record<string, unknown> = {}) => ({
    organization_id: org.orgId,
    thread_id: threadId,
    resource_type: resourceType,
    resource_id: resourceId,
    created_by: board.id,
    ...extra,
  })

  it('a real ticket or violation in the org links (board client)', async () => {
    for (const [type, id] of [['ticket', ticketId], ['violation', violationId]] as const) {
      const { error } = await board.client.from('inbox_thread_links').insert(link(type, id) as never)
      expect(error?.code ?? null, type).toBeNull()
    }
  })

  it('any random UUID is refused with 23503, for every type', async () => {
    for (const type of ['ticket', 'arc_request', 'violation', 'communication_thread']) {
      const { error } = await board.client.from('inbox_thread_links').insert(link(type, randomUUID()) as never)
      expect(error?.code, type).toBe('23503')
    }
  })

  it('a record of the wrong type, or of another org, is refused (even for the service role)', async () => {
    const wrongType = await board.client.from('inbox_thread_links').insert(link('ticket', violationId) as never)
    expect(wrongType.error?.code).toBe('23503')

    const otherTicket = await insertOne('tickets', {
      organization_id: other.orgId,
      association_id: other.associationId,
      submitted_by: otherBoard.id,
      category: 'general',
      subject: 'x',
      description: 'y',
      status: 'open',
    })
    const crossOrg = await adminDb().from('inbox_thread_links').insert(link('ticket', otherTicket) as never)
    expect(crossOrg.error?.code).toBe('23503')
  })

  it("another org's thread is refused", async () => {
    const foreignThread = await makeThread(other)
    const { error } = await adminDb()
      .from('inbox_thread_links')
      .insert(link('ticket', ticketId, { thread_id: foreignThread }) as never)
    expect(error?.code).toBe('23503')
  })

  it('re-pointing an existing link at a bogus id is refused too', async () => {
    const { data } = await board.client.from('inbox_thread_links').insert(link('ticket', ticketId) as never).select('id').single()
    const { error } = await board.client
      .from('inbox_thread_links')
      .update({ resource_id: randomUUID() } as never)
      .eq('id', (data as { id: string }).id)
    expect(error?.code).toBe('23503')
  })
})

// ─── 4. BL-134 document provenance ───────────────────────────────────

describe('4. hoa_documents.source_inbox_attachment_id (BL-134 B5)', () => {
  async function makeAttachment(f: OrgFixture): Promise<string> {
    const threadId = await makeThread(f)
    const messageId = await addMessage(f, threadId, 'inbound', '2026-10-19T10:00:00Z')
    return insertOne('inbox_attachments', {
      organization_id: f.orgId,
      thread_id: threadId,
      message_id: messageId,
      file_name: 'coi.pdf',
      fetch_status: 'stored',
    })
  }

  const doc = (attachmentId: string | null) => ({
    org_id: org.orgId,
    name: 'Vendor COI (from email, 2026-10-19)',
    type: 'other',
    storage_path: `${org.orgId}/from-inbox/${randomUUID()}/coi.pdf`,
    source_inbox_attachment_id: attachmentId,
  })

  it("the board files a document from its own org's attachment; deleting the attachment nulls the link", async () => {
    const attachmentId = await makeAttachment(org)
    const { data, error } = await board.client.from('hoa_documents').insert(doc(attachmentId) as never).select('id').single()
    expect(error).toBeNull()
    const docId = (data as { id: string }).id

    await adminDb().from('inbox_attachments').delete().eq('id', attachmentId)
    const { data: after } = await adminDb()
      .from('hoa_documents')
      .select('source_inbox_attachment_id' as never)
      .eq('id', docId)
      .single()
    expect((after as unknown as { source_inbox_attachment_id: string | null }).source_inbox_attachment_id).toBeNull()
  })

  it("another org's attachment is refused with 23503 (even for the service role)", async () => {
    const foreign = await makeAttachment(other)
    const asBoard = await board.client.from('hoa_documents').insert(doc(foreign) as never)
    expect(asBoard.error?.code).toBe('23503')
    const asService = await adminDb().from('hoa_documents').insert(doc(foreign) as never)
    expect(asService.error?.code).toBe('23503')
  })

  it('an upload (NULL) is unaffected', async () => {
    const { error } = await board.client.from('hoa_documents').insert(doc(null) as never)
    expect(error).toBeNull()
  })
})

// ─── 5. BL-131 compliance_deadlines_done ─────────────────────────────

describe('5. compliance_deadlines_done (BL-131)', () => {
  const table = 'compliance_deadlines_done' as never
  const row = (extra: Record<string, unknown> = {}) => ({
    organization_id: org.orgId,
    association_id: org.associationId,
    code: 'ga-sos-registration-2027',
    done_at: '2026-10-20T12:00:00Z',
    ...extra,
  })

  it('board and admin write and read their org’s rows; done_by defaults to the caller', async () => {
    const { error } = await board.client.from(table).insert(row() as never)
    expect(error).toBeNull()
    const { data } = await admin.client.from(table).select('code, done_by').eq('organization_id' as never, org.orgId)
    expect(data).toEqual([{ code: 'ga-sos-registration-2027', done_by: board.id }])
    const asAdmin = await admin.client.from(table).insert(row({ code: 'tx-management-certificate' }) as never)
    expect(asAdmin.error).toBeNull()
  })

  it('SEC-N6: done_by is the caller whatever the insert or update says', async () => {
    const ins = await board.client.from(table).insert(row({ done_by: admin.id }) as never)
    expect(ins.error).toBeNull()
    const upd = await admin.client.from(table).update({ done_by: admin.id } as never).eq('organization_id' as never, org.orgId).select('id')
    expect(upd.error).toBeNull()
    const { data } = await adminDb().from(table).select('done_by').eq('organization_id' as never, org.orgId)
    expect(data).toEqual([{ done_by: board.id }])
  })

  it('a resident and another org’s board see nothing and write nothing', async () => {
    await adminDb().from(table).insert(row() as never)
    for (const user of [resident, otherBoard]) {
      const { data } = await user.client.from(table).select('id')
      expect(data ?? []).toHaveLength(0)
    }
    const asResident = await resident.client.from(table).insert(row({ code: 'tx-management-certificate' }) as never)
    expect(asResident.error?.code).toBe('42501')
    const asOther = await otherBoard.client.from(table).insert(row({ code: 'tx-management-certificate' }) as never)
    expect(asOther.error?.code).toBe('42501')
    const del = await otherBoard.client.from(table).delete().eq('organization_id' as never, org.orgId).select('id')
    expect(del.data ?? []).toHaveLength(0)
  })

  it("the association must belong to the row's org (a board of two orgs cannot cross-file)", async () => {
    // The board member also joins the other org: RLS alone would pass on
    // organization_id, the association check is what refuses.
    await adminDb().from('org_members').insert({ org_id: other.orgId, user_id: board.id, role: 'board' })
    const { error } = await board.client.from(table).insert(row({ association_id: other.associationId }) as never)
    expect(error?.code).toBe('42501')
  })

  it('one row per (association, code): a second insert is 23505, ON CONFLICT DO NOTHING is a no-op', async () => {
    await board.client.from(table).insert(row() as never)
    const dup = await board.client.from(table).insert(row() as never)
    expect(dup.error?.code).toBe('23505')
    const upsert = await board.client
      .from(table)
      .upsert(row() as never, { onConflict: 'association_id,code', ignoreDuplicates: true })
    expect(upsert.error).toBeNull()
    const { count } = await adminDb().from(table).select('id', { count: 'exact', head: true })
    expect(count).toBe(1)
  })

  it('a malformed code is refused with 23514', async () => {
    const { error } = await adminDb().from(table).insert(row({ code: 'GA SOS!' }) as never)
    expect(error?.code).toBe('23514')
  })
})
