import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall } from '@/lib/test-utils/memory-supabase'
import { approveContactUpdate, loadContactEntries, rejectContactUpdate } from './apply'
import { AUDIT_APPLIED, AUDIT_REJECTED, CONTACT_SUBJECT, formatContactRequest } from './model'

// Synthetic ids and values only.
const ORG = 'org-1'
const BOARD = 'board-1'
const PAT = 'user-pat'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never
vi.spyOn(console, 'error').mockImplementation(() => {})

const body = formatContactRequest(
  [
    { field: 'phone', from: '(555) 123-4567', to: '(555) 222-3333' },
    { field: 'email', from: 'pat@example.test', to: 'notices@example.test' },
    { field: 'mailing', from: null, to: 'PO Box 9, Far, CA 90000' },
  ],
  'pat@example.test',
)

function seed(over: Record<string, unknown[]> = {}) {
  return {
    tickets: [
      { id: 'tk1', organization_id: ORG, unit_id: 'u1', submitted_by: PAT, subject: CONTACT_SUBJECT, category: 'general', description: body, status: 'open', created_at: '2026-10-17T10:00:00Z', deleted_at: null },
    ],
    units: [{ id: 'u1', organization_id: ORG, address_line1: '12 Oak Street', unit_number: null, legacy_hoa_property_id: 'p1' }],
    property_residents: [
      { id: 'r1', organization_id: ORG, property_id: 'p1', full_name: 'Pat Example', email: 'pat@example.test', phone: '(555) 123-4567', notes: null, role: 'owner', moved_out_at: null, deleted_at: null },
      { id: 'r2', organization_id: ORG, property_id: 'p1', full_name: 'Sam Example', email: 'sam@example.test', phone: '(555) 444-5555', notes: null, role: 'owner', moved_out_at: null, deleted_at: null },
    ],
    ownerships: [
      { id: 'o1', organization_id: ORG, unit_id: 'u1', owner_user_id: PAT, owner_email: 'pat@example.test', owner_phone: '(555) 123-4567', valid_to: null },
      { id: 'o2', organization_id: ORG, unit_id: 'u1', owner_user_id: null, owner_email: 'sam@example.test', owner_phone: null, valid_to: null },
    ],
    tenancies: [],
    hoa_properties: [{ id: 'p1', org_id: ORG, owner_email: 'pat@example.test', owner_phone: '(555) 123-4567', deleted_at: null }],
    ticket_messages: [],
    audit_log: [],
    ...over,
  }
}
const input = { orgId: ORG, ticketId: 'tk1', deciderId: BOARD, deciderRole: 'board' as const }

describe('approveContactUpdate', () => {
  it('applies the change to the submitter’s rows only, closes the ticket, tells them, audits ids only', async () => {
    const m = memorySupabase(seed())
    const r = await approveContactUpdate(db(m), input)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.message).toMatch(/phone, email for notices and mailing address/)

    const [pat, sam] = m.rows('property_residents')
    expect(pat).toMatchObject({ phone: '(555) 222-3333', email: 'notices@example.test', notes: 'Mailing address: PO Box 9, Far, CA 90000' })
    expect(sam).toMatchObject({ phone: '(555) 444-5555', email: 'sam@example.test' })
    expect(m.rows('ownerships')[0]).toMatchObject({ owner_email: 'notices@example.test', owner_phone: '(555) 222-3333', owner_user_id: PAT })
    expect(m.rows('ownerships')[1]).toMatchObject({ owner_email: 'sam@example.test' })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ owner_email: 'notices@example.test', owner_phone: '(555) 222-3333' })

    expect(m.rows('tickets')[0]).toMatchObject({ status: 'closed', closed_by: BOARD })
    const [msg] = m.rows('ticket_messages')
    expect(msg).toMatchObject({ ticket_id: 'tk1', author_role: 'board', internal: false })
    const [a] = m.rows('audit_log')
    expect(a).toMatchObject({ action: AUDIT_APPLIED, entity_type: 'ticket', entity_id: 'tk1', user_id: BOARD, org_id: ORG })
    expect(a!.metadata).toMatchObject({ propertyId: 'p1', residentIds: ['r1'], ownershipIds: ['o1'], fields: ['phone', 'email', 'mailing'] })
    // Ids and field names only — never the values.
    const audited = JSON.stringify(a)
    for (const v of ['222-3333', 'notices@', 'PO Box', 'pat@example']) expect(audited).not.toContain(v)
  })

  it('holds the email when sign-in rests on it, and says so to both sides', async () => {
    const m = memorySupabase(
      seed({ ownerships: [{ id: 'o1', organization_id: ORG, unit_id: 'u1', owner_user_id: null, owner_email: 'pat@example.test', owner_phone: null, valid_to: null }] }),
    )
    const r = await approveContactUpdate(db(m), input)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.message).toMatch(/email isn’t changed/)
    expect(m.rows('property_residents')[0]).toMatchObject({ email: 'pat@example.test', phone: '(555) 222-3333' })
    expect(String(m.rows('ticket_messages')[0]!.body)).toMatch(/didn’t change your email/)
  })

  it('a second approval is refused — the first one won', async () => {
    const m = memorySupabase(seed())
    await approveContactUpdate(db(m), input)
    const again = await approveContactUpdate(db(m), input)
    expect(again).toEqual({ ok: false, error: 'That request was already handled.' })
    expect(m.rows('audit_log')).toHaveLength(1)
  })

  it('a write failure re-opens the ticket and changes nothing', async () => {
    const m = memorySupabase(seed(), {
      failOn: (c: MemCall) => (c.table === 'hoa_properties' && c.op === 'update' ? { code: 'XX000', message: 'boom' } : null),
    })
    const r = await approveContactUpdate(db(m), input)
    expect(r.ok).toBe(false)
    expect(m.rows('tickets')[0]).toMatchObject({ status: 'open', closed_by: null })
    expect(m.rows('property_residents')[0]).toMatchObject({ phone: '(555) 123-4567', email: 'pat@example.test' })
    expect(m.rows('audit_log')).toHaveLength(0)
  })

  it('refuses an ordinary ticket and another org’s ticket', async () => {
    const m = memorySupabase(seed({ tickets: [{ ...seed().tickets[0]!, subject: 'Broken gate' }] }))
    expect((await approveContactUpdate(db(m), input)).ok).toBe(false)
    const other = memorySupabase(seed())
    expect(await approveContactUpdate(db(other), { ...input, orgId: 'org-2' })).toEqual({ ok: false, error: 'That request wasn’t found.' })
  })

  it('refuses when nothing on the home is the submitter’s', async () => {
    const m = memorySupabase(seed({ property_residents: [], ownerships: [], hoa_properties: [] }))
    const r = await approveContactUpdate(db(m), input)
    expect(r.ok).toBe(false)
    expect(m.rows('tickets')[0]).toMatchObject({ status: 'open' })
  })
})

describe('rejectContactUpdate', () => {
  it('needs a reason, closes the ticket with it, changes nothing on file', async () => {
    const m = memorySupabase(seed())
    expect((await rejectContactUpdate(db(m), { ...input, reason: '  ' })).ok).toBe(false)
    const r = await rejectContactUpdate(db(m), { ...input, reason: 'Please call the office to confirm.' })
    expect(r.ok).toBe(true)
    expect(m.rows('tickets')[0]).toMatchObject({ status: 'closed' })
    expect(String(m.rows('ticket_messages')[0]!.body)).toContain('Please call the office to confirm.')
    expect(m.rows('audit_log')[0]).toMatchObject({ action: AUDIT_REJECTED, entity_id: 'tk1' })
    expect(m.rows('property_residents')[0]).toMatchObject({ phone: '(555) 123-4567' })
  })
})

describe('loadContactEntries', () => {
  it('finds the home and the submitter’s current details', async () => {
    const m = memorySupabase(seed())
    const r = await loadContactEntries(db(m), ORG, seed().tickets as never)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.entries[0]).toMatchObject({
      home: '12 Oak Street',
      propertyId: 'p1',
      current: { phone: '(555) 123-4567', email: 'pat@example.test', mailing: null },
    })
  })

  it('a failed read is a failure, never an empty list', async () => {
    const m = memorySupabase(seed(), { failOn: (c: MemCall) => (c.table === 'ownerships' ? { code: '57014', message: 'timeout' } : null) })
    expect(await loadContactEntries(db(m), ORG, seed().tickets as never)).toEqual({ ok: false })
  })
})

describe('the Inbox channel is honoured only from a board/admin submitter (BL-101 A4 hardening)', () => {
  // What a board member files from the Inbox (formatInboxContactRequest):
  // no "Signed in as" line, an "Emailed in by" one.
  const inboxBody = 'Please update the contact details on file, as asked by email.\n\nPhone: (555) 999-0000\n\nEmailed in by: sam@example.test'
  // A resident hand-typing the same lines under their own "Signed in as".
  const forgedWithOwn = `${inboxBody}\nSigned in as: pat@example.test`
  const ticket = (submitted_by: string, description: string) => ({ ...seed().tickets[0]!, submitted_by, description })
  const members = [
    { org_id: ORG, user_id: BOARD, role: 'board' },
    { org_id: ORG, user_id: PAT, role: 'resident' },
  ]

  it('a board member’s Inbox filing keeps the channel (and so the label)', async () => {
    const m = memorySupabase(seed({ tickets: [ticket(BOARD, inboxBody)], org_members: members }))
    const r = await loadContactEntries(db(m), ORG, m.rows('tickets') as never)
    expect(r.ok && r.entries[0]!.request).toMatchObject({ signInEmail: 'sam@example.test', channel: 'inbox' })
  })

  it('a resident’s hand-typed "Emailed in by" is read as their own request: no channel, their own key', async () => {
    const m = memorySupabase(seed({ tickets: [ticket(PAT, forgedWithOwn)], org_members: members }))
    const r = await loadContactEntries(db(m), ORG, m.rows('tickets') as never)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.entries[0]!.request.channel).toBeUndefined()
    expect(r.entries[0]!.request.signInEmail).toBe('pat@example.test')

    // Approving changes Pat's rows, never those on the address Pat typed.
    const res = await approveContactUpdate(db(m), input)
    expect(res.ok).toBe(true)
    const [pat, sam] = m.rows('property_residents')
    expect(pat).toMatchObject({ phone: '(555) 999-0000' })
    expect(sam).toMatchObject({ phone: '(555) 444-5555' })
  })

  it('a resident’s "Emailed in by" with no "Signed in as" of their own is not a readable request', async () => {
    const m = memorySupabase(seed({ tickets: [ticket(PAT, inboxBody)], org_members: members }))
    const r = await loadContactEntries(db(m), ORG, m.rows('tickets') as never)
    expect(r).toEqual({ ok: true, entries: [] })
    const res = await approveContactUpdate(db(m), input)
    expect(res).toEqual({ ok: false, error: 'That request isn’t a contact update.' })
    expect(m.rows('property_residents')[1]).toMatchObject({ phone: '(555) 444-5555' })
    expect(m.rows('tickets')[0]).toMatchObject({ status: 'open' })
  })

  it('a board member of another org does not count', async () => {
    const m = memorySupabase(
      seed({ tickets: [ticket('board-elsewhere', inboxBody)], org_members: [{ org_id: 'org-2', user_id: 'board-elsewhere', role: 'board' }] }),
    )
    const r = await loadContactEntries(db(m), ORG, m.rows('tickets') as never)
    expect(r).toEqual({ ok: true, entries: [] })
  })

  it('reads roles only when a body claims the Inbox channel, and fails closed if that read fails', async () => {
    const plain = memorySupabase(seed())
    await loadContactEntries(db(plain), ORG, seed().tickets as never)
    expect(plain.calls.some((c) => c.table === 'org_members')).toBe(false)

    const m = memorySupabase(seed({ tickets: [ticket(BOARD, inboxBody)], org_members: members }), {
      failOn: (c: MemCall) => (c.table === 'org_members' ? { code: '57014', message: 'timeout' } : null),
    })
    expect(await loadContactEntries(db(m), ORG, m.rows('tickets') as never)).toEqual({ ok: false })
  })
})
