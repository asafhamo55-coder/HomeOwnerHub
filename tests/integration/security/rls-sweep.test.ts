/**
 * RLS sweep (0063). Spec: docs/specs/2026-10-16-rls-sweep.md
 *
 * Before 0063 thirty-odd tables still carried an original FOR ALL policy
 * gated on org membership alone (`org_id = ANY (auth_org_ids())`), or a
 * resident "own row" FOR ALL policy that let the submitter rewrite the
 * board's side of the record. Any member, a plain resident included,
 * could therefore through the anon key and their own session:
 *
 *   - re-point the Zelle recipient in associations.compliance_settings;
 *   - forge an `ownerships` row (or re-point units.legacy_hoa_property_id)
 *     and so widen auth_resident_unit_ids() to a neighbour's unit, then
 *     read that unit's dues (BL-007);
 *   - mark their own violation resolved, approve their own ARC request,
 *     close their own ticket, post as "board" in their own thread;
 *   - read every neighbour's ownership, tenancy, contact details,
 *     violations, collection letters and delivery rows;
 *   - write or wipe the audit log, rename or delete the org.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds and observes; every
 * authorization assertion goes through a real user JWT client. An UPDATE
 * or DELETE that RLS filters out returns no error and touches zero rows,
 * so every write negative re-reads the row as service role.
 *
 * No truncateAll: the world lives in fresh orgs. DELETE negatives run
 * last and only ever target dedicated spare rows, so a pre-0063 run that
 * DOES delete cannot starve the other tests.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildRecipientIdentityFilters } from '../../../apps/hoa/src/lib/communications/resident-scope'
import {
  fetchResidentDocumentFile,
  fetchResidentDocuments,
} from '../../../apps/hoa/src/lib/resident-documents/query'
import {
  adminDb,
  makeOrg,
  makeUnit,
  mintUser,
  type Db,
  type OrgFixture,
  type TestUser,
} from '../fixtures/factory'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'

// ─── world ──────────────────────────────────────────────────────────

interface World {
  org: OrgFixture
  /** A second org the resident ALSO belongs to: the orgs DELETE target. */
  spareOrg: OrgFixture
  foreignOrg: OrgFixture
  /** Owns unitMine through `ownerships`. */
  resident: TestUser
  /** Linked to unitEmail only through property_residents (email). */
  emailResident: TestUser
  /** Owns unitNeighbor. */
  neighbor: TestUser
  board: TestUser
  admin: TestUser
  /** Board member of a DIFFERENT org. */
  foreignBoard: TestUser
  unitMine: string
  unitNeighbor: string
  unitEmail: string
  propMine: string
  propNeighbor: string
  propEmail: string
  ids: Record<string, string>
}

const rand = () => randomUUID().slice(0, 8)

async function one(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string,
): Promise<string> {
  const { data, error } = await p
  const id = (data as { id?: string } | null)?.id
  if (error || !id) throw new Error(`seed ${label}: ${error?.message}`)
  return id
}

function from(client: Db, table: string) {
  // The matrix is untyped by design: one loop covers many tables.
  return client.from(table as never)
}

async function readRow(table: string, id: string, col = 'id'): Promise<Record<string, unknown> | null> {
  const { data, error } = await from(adminDb(), table).select('*').eq(col as never, id as never).maybeSingle()
  if (error) throw new Error(`read ${table}: ${error.message}`)
  return data as Record<string, unknown> | null
}

async function insertAs(table: string, row: Record<string, unknown>, label: string): Promise<string> {
  return one(from(adminDb(), table).insert(row as never).select('id').single(), label)
}

/** Ids a user can see in `table`, restricted to the given candidate ids. */
async function visible(client: Db, table: string, ids: string[]): Promise<string[]> {
  const { data, error } = await from(client, table).select('id').in('id' as never, ids as never)
  if (error) throw new Error(`select ${table}: ${error.message}`)
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id).sort()
}

async function seedWorld(): Promise<World> {
  const db = adminDb()
  const org = await makeOrg()
  const spareOrg = await makeOrg()
  const foreignOrg = await makeOrg()

  const resident = await mintUser(org, 'resident')
  const emailResident = await mintUser(org, 'resident')
  const neighbor = await mintUser(org, 'resident')
  const board = await mintUser(org, 'board')
  const admin = await mintUser(org, 'admin')
  const foreignBoard = await mintUser(foreignOrg, 'board')

  {
    const { error } = await db
      .from('org_members')
      .insert({ org_id: spareOrg.orgId, user_id: resident.id, role: 'resident' })
    if (error) throw new Error(`seed spare membership: ${error.message}`)
  }

  // Owner contact and board notes on every property and unit (C-19): the
  // columns a resident must never read for anyone else's row. Fictional.
  const prop = (label: string) =>
    insertAs(
      'hoa_properties',
      {
        org_id: org.orgId,
        address: `${rand()} ${label} Way`,
        owner_name: `Owner ${label}`,
        owner_email: `owner-${label.toLowerCase()}-${rand()}@example.test`,
        owner_phone: '555-0100',
        notes: `board note ${label}`,
      },
      `prop ${label}`,
    )
  const propMine = await prop('Mine')
  const propNeighbor = await prop('Neighbor')
  const propEmail = await prop('Email')

  const unit = (legacy: string, label: string) =>
    insertAs(
      'units',
      {
        organization_id: org.orgId,
        association_id: org.associationId,
        address_line1: `${rand()} ${label} Way`,
        legacy_hoa_property_id: legacy,
        notes: `board note ${label}`,
      },
      `unit ${label}`,
    )
  const unitMine = await unit(propMine, 'Mine')
  const unitNeighbor = await unit(propNeighbor, 'Neighbor')
  const unitEmail = await unit(propEmail, 'Email')

  const ids: Record<string, string> = {}
  const base = { organization_id: org.orgId }

  ids.ownMine = await insertAs(
    'ownerships',
    { ...base, unit_id: unitMine, owner_user_id: resident.id, valid_from: '2024-01-01' },
    'own mine',
  )
  ids.ownNeighbor = await insertAs(
    'ownerships',
    { ...base, unit_id: unitNeighbor, owner_user_id: neighbor.id, valid_from: '2024-01-01' },
    'own neighbor',
  )
  ids.prEmail = await insertAs(
    'property_residents',
    {
      ...base,
      property_id: propEmail,
      full_name: 'Email Resident',
      // Different case on purpose: the app matches with ilike.
      email: emailResident.email.toUpperCase(),
      role: 'owner',
    },
    'pr email',
  )
  ids.tenMine = await insertAs(
    'tenancies',
    { ...base, unit_id: unitMine, tenant_user_id: resident.id, lease_start: '2024-01-01', status: 'active' },
    'tenancy mine',
  )
  ids.vioMine = await insertAs(
    'hoa_violations',
    { org_id: org.orgId, property_id: propMine, violation_type: 'trash', description: 'bins out', status: 'open' },
    'violation mine',
  )
  ids.vioNeighbor = await insertAs(
    'hoa_violations',
    { org_id: org.orgId, property_id: propNeighbor, violation_type: 'parking', description: 'boat', status: 'open' },
    'violation neighbor',
  )

  // Communications: one addressed to the resident, one to the neighbour
  // only (a collection letter, say), one to emailResident by address only.
  const comm = (label: string) =>
    insertAs(
      'communications',
      {
        ...base,
        association_id: org.associationId,
        category: 'announcement',
        subject: `Comm ${label}`,
        body_html: '<p>hi</p>',
        audience_definition: {},
        status: 'sent',
        sent_at: new Date().toISOString(),
      },
      `comm ${label}`,
    )
  ids.commMine = await comm('mine')
  ids.commNeighbor = await comm('neighbor')
  ids.commEmail = await comm('email')
  ids.commUnitEmail = await comm('unit email')
  ids.recMine = await insertAs(
    'communication_recipients',
    { ...base, communication_id: ids.commMine, unit_id: unitMine, user_id: resident.id, email: resident.email, channel: 'email', delivery_status: 'sent', sent_at: new Date().toISOString() },
    'rec mine',
  )
  ids.recNeighbor = await insertAs(
    'communication_recipients',
    { ...base, communication_id: ids.commNeighbor, unit_id: unitNeighbor, user_id: neighbor.id, email: neighbor.email, channel: 'email', delivery_status: 'sent', sent_at: new Date().toISOString() },
    'rec neighbor',
  )
  ids.recEmail = await insertAs(
    'communication_recipients',
    { ...base, communication_id: ids.commEmail, email: emailResident.email, channel: 'email', delivery_status: 'sent', sent_at: new Date().toISOString() },
    'rec email',
  )
  ids.recUnitEmail = await insertAs(
    'communication_recipients',
    { ...base, communication_id: ids.commUnitEmail, unit_id: unitEmail, channel: 'portal', delivery_status: 'sent', sent_at: new Date().toISOString() },
    'rec unit email',
  )

  ids.doc = await insertAs(
    'hoa_documents',
    { org_id: org.orgId, name: 'CC&Rs', type: 'ccr', storage_path: `${org.orgId}/ccr.pdf` },
    'hoa doc',
  )
  ids.meeting = await insertAs('hoa_meeting_minutes', { org_id: org.orgId, meeting_date: '2026-01-10' }, 'meeting')
  ids.govDoc = await insertAs(
    'governing_documents',
    { ...base, association_id: org.associationId, type: 'rules', title: 'Rules' },
    'gov doc',
  )

  // Board-only material in member-readable tables (C-19): a collection
  // letter filed as "other", draft minutes, unreviewed / superseded
  // governing documents and the chunks of one.
  ids.docOther = await insertAs(
    'hoa_documents',
    { org_id: org.orgId, name: 'Collection letter', type: 'other', storage_path: `${org.orgId}/letter.pdf` },
    'hoa doc other',
  )
  ids.docMinutes = await insertAs(
    'hoa_documents',
    { org_id: org.orgId, name: 'Draft minutes', type: 'minutes', storage_path: `${org.orgId}/minutes.pdf` },
    'hoa doc minutes',
  )
  ids.meetingApproved = await insertAs(
    'hoa_meeting_minutes',
    { org_id: org.orgId, meeting_date: '2026-02-10', status: 'approved', raw_transcript: 'executive session' },
    'meeting approved',
  )
  ids.govMinutes = await insertAs(
    'governing_documents',
    { ...base, association_id: org.associationId, type: 'minutes', title: 'Board minutes' },
    'gov minutes',
  )
  ids.govSuperseded = await insertAs(
    'governing_documents',
    { ...base, association_id: org.associationId, type: 'rules', title: 'Old rules', superseded_at: new Date().toISOString() },
    'gov superseded',
  )
  ids.govAi = await insertAs(
    'governing_documents',
    { ...base, association_id: org.associationId, type: 'policy', title: 'AI draft policy', ai_generated: true },
    'gov ai',
  )
  ids.chunkVisible = await insertAs(
    'governing_document_chunks',
    { ...base, document_id: ids.govDoc, ordinal: 1, text: 'Quiet hours are 10pm.' },
    'chunk visible',
  )
  ids.chunkHidden = await insertAs(
    'governing_document_chunks',
    { ...base, document_id: ids.govMinutes, ordinal: 1, text: 'The board discussed a delinquent owner.' },
    'chunk hidden',
  )

  // Submission threads.
  ids.ticketMine = await insertAs(
    'tickets',
    { ...base, association_id: org.associationId, unit_id: unitMine, submitted_by: resident.id, subject: 'Leak', category: 'maintenance', description: 'drip' },
    'ticket mine',
  )
  ids.ticketNeighbor = await insertAs(
    'tickets',
    { ...base, association_id: org.associationId, unit_id: unitNeighbor, submitted_by: neighbor.id, subject: 'Noise', category: 'noise', description: 'loud' },
    'ticket neighbor',
  )
  ids.ticketMineDel = await insertAs(
    'tickets',
    { ...base, submitted_by: resident.id, subject: 'Spare', category: 'general', description: 'spare' },
    'ticket mine spare',
  )
  ids.arcMine = await insertAs(
    'arc_requests',
    { ...base, association_id: org.associationId, unit_id: unitMine, submitted_by: resident.id, category: 'paint', summary: 'Paint', scope_description: 'blue' },
    'arc mine',
  )
  ids.arcNeighbor = await insertAs(
    'arc_requests',
    { ...base, unit_id: unitNeighbor, submitted_by: neighbor.id, category: 'fence', summary: 'Fence', scope_description: 'tall' },
    'arc neighbor',
  )
  ids.arcMineDecided = await insertAs(
    'arc_requests',
    { ...base, unit_id: unitMine, submitted_by: resident.id, category: 'roof', summary: 'Roof', scope_description: 'tiles', status: 'denied', board_response: 'No.' },
    'arc mine decided',
  )
  ids.arcMineDel = await insertAs(
    'arc_requests',
    { ...base, submitted_by: resident.id, category: 'other', summary: 'Spare', scope_description: 'spare' },
    'arc mine spare',
  )
  ids.reportMine = await insertAs(
    'resident_violation_reports',
    { ...base, reported_by: resident.id, category: 'noise', description: 'party' },
    'report mine',
  )
  ids.reportNeighbor = await insertAs(
    'resident_violation_reports',
    { ...base, reported_by: neighbor.id, category: 'pet', description: 'dog' },
    'report neighbor',
  )
  ids.reportMineDel = await insertAs(
    'resident_violation_reports',
    { ...base, reported_by: resident.id, category: 'other', description: 'spare' },
    'report mine spare',
  )
  for (const [table, parentCol, parent, key] of [
    ['ticket_messages', 'ticket_id', ids.ticketMine, 'tm'],
    ['arc_request_messages', 'arc_request_id', ids.arcMine, 'am'],
    ['resident_violation_report_messages', 'report_id', ids.reportMine, 'rm'],
  ] as const) {
    ids[`${key}Board`] = await insertAs(
      table,
      { [parentCol]: parent, author_id: board.id, author_role: 'board', body: 'board reply', internal: false },
      `${table} board`,
    )
    ids[`${key}Internal`] = await insertAs(
      table,
      { [parentCol]: parent, author_id: board.id, author_role: 'board', body: 'internal note', internal: true },
      `${table} internal`,
    )
    ids[`${key}BoardDel`] = await insertAs(
      table,
      { [parentCol]: parent, author_id: board.id, author_role: 'board', body: 'board spare', internal: false },
      `${table} board spare`,
    )
  }

  // Per-user rows.
  ids.notifBoard = await insertAs(
    'notifications',
    { ...base, user_id: board.id, kind: 'ticket_created', title: 'New ticket' },
    'notification board',
  )
  ids.notifBoardDel = await insertAs(
    'notifications',
    { ...base, user_id: board.id, kind: 'ticket_created', title: 'Spare' },
    'notification board spare',
  )
  ids.notifResident = await insertAs(
    'notifications',
    { ...base, user_id: resident.id, kind: 'ticket_created', title: 'For resident' },
    'notification resident',
  )
  ids.pushBoard = await insertAs(
    'push_subscriptions',
    { ...base, user_id: board.id, endpoint: `https://push.example.test/${rand()}`, p256dh: 'k', auth: 'a' },
    'push board',
  )
  ids.pushBoardDel = await insertAs(
    'push_subscriptions',
    { ...base, user_id: board.id, endpoint: `https://push.example.test/${rand()}`, p256dh: 'k', auth: 'a' },
    'push board spare',
  )
  ids.prefNeighbor = await insertAs(
    'resident_communication_preferences',
    { ...base, user_id: neighbor.id, email_opt_in: true },
    'pref neighbor',
  )
  ids.audit = await insertAs('audit_log', { org_id: org.orgId, user_id: board.id, action: 'test.seed' }, 'audit')
  ids.auditDel = await insertAs('audit_log', { org_id: org.orgId, user_id: board.id, action: 'test.spare' }, 'audit spare')
  {
    const { error } = await db.from('hoa_digests').insert({ org_id: org.orgId, content: 'seed digest' })
    if (error) throw new Error(`seed digest: ${error.message}`)
  }

  return {
    org,
    spareOrg,
    foreignOrg,
    resident,
    emailResident,
    neighbor,
    board,
    admin,
    foreignBoard,
    unitMine,
    unitNeighbor,
    unitEmail,
    propMine,
    propNeighbor,
    propEmail,
    ids,
  }
}

// ─── the board-write matrix ─────────────────────────────────────────
//
// Tables no resident writes in the app. Each entry is a row a board member
// would legitimately write, a column patch, and which role writes it.

interface Entry {
  table: string
  row: (w: World) => Record<string, unknown>
  patch: Record<string, unknown>
  col: string
  /** Who performs the positive-control writes. Default board. */
  writer?: 'board' | 'admin'
  /** What a resident can still read org-wide after 0063 (else: nothing they don't own). */
  residentReadsOrgWide?: boolean
}

const MATRIX: Entry[] = [
  {
    table: 'associations',
    row: (w) => ({ organization_id: w.org.orgId, name: 'Spare Assoc', state: 'FL', slug: `S${rand().toUpperCase()}` }),
    // The Zelle recipient lives here (BL-006): a resident re-pointing it
    // redirects every neighbour's dues.
    patch: { compliance_settings: { pay_by_zelle: { recipient: 'attacker@example.test' } } },
    col: 'compliance_settings',
    writer: 'admin',
    residentReadsOrgWide: true,
  },
  {
    table: 'units',
    row: (w) => ({ organization_id: w.org.orgId, association_id: w.org.associationId, address_line1: `${rand()} Matrix Way` }),
    patch: { address_line1: 'tampered' },
    col: 'address_line1',
    // C-19: residents read only their own / resident-visible rows.
    residentReadsOrgWide: false,
  },
  {
    table: 'hoa_properties',
    row: (w) => ({ org_id: w.org.orgId, address: `${rand()} Matrix Way` }),
    patch: { owner_email: 'tampered@example.test' },
    col: 'owner_email',
    // C-19: residents read only their own / resident-visible rows.
    residentReadsOrgWide: false,
  },
  {
    table: 'hoa_documents',
    row: (w) => ({ org_id: w.org.orgId, name: 'Doc', type: 'other', storage_path: `${w.org.orgId}/${rand()}.pdf` }),
    patch: { name: 'tampered' },
    col: 'name',
    // C-19: residents read only their own / resident-visible rows.
    residentReadsOrgWide: false,
  },
  {
    table: 'hoa_document_versions',
    row: (w) => ({
      document_id: w.ids.doc,
      org_id: w.org.orgId,
      version_number: Math.floor(Math.random() * 1_000_000) + 2,
      name: 'v',
      storage_path: `${w.org.orgId}/${rand()}.pdf`,
    }),
    patch: { name: 'tampered' },
    col: 'name',
    residentReadsOrgWide: true,
  },
  {
    table: 'hoa_meeting_minutes',
    row: (w) => ({ org_id: w.org.orgId, meeting_date: '2026-01-15', status: 'draft' }),
    patch: { status: 'approved' },
    col: 'status',
    // C-19: residents read only their own / resident-visible rows.
    residentReadsOrgWide: false,
  },
  {
    table: 'hoa_recurring_events',
    row: (w) => ({ organization_id: w.org.orgId, title: 'Pool opens', event_date: '2026-05-01' }),
    patch: { title: 'tampered' },
    col: 'title',
    residentReadsOrgWide: true,
  },
  {
    table: 'governing_documents',
    row: (w) => ({ organization_id: w.org.orgId, association_id: w.org.associationId, type: 'rules', title: 'Rules' }),
    patch: { title: 'tampered' },
    col: 'title',
    residentReadsOrgWide: true,
  },
  {
    table: 'governing_document_chunks',
    // Ask-the-Docs answers residents from these. A resident inserting one
    // poisons every neighbour's answers.
    row: (w) => ({ organization_id: w.org.orgId, document_id: w.ids.govDoc, ordinal: Math.floor(Math.random() * 1_000_000), text: 'Pets are allowed.' }),
    patch: { text: 'tampered' },
    col: 'text',
    residentReadsOrgWide: true,
  },
  {
    table: 'communication_templates',
    row: (w) => ({ organization_id: w.org.orgId, category: 'custom', name: 'T', subject: 'S', body_html: '<p>b</p>' }),
    patch: { subject: 'tampered' },
    col: 'subject',
    residentReadsOrgWide: true,
  },
  {
    table: 'communication_threads',
    row: (w) => ({ organization_id: w.org.orgId, association_id: w.org.associationId, topic_category: 'general' }),
    patch: { status: 'closed' },
    col: 'status',
  },
  {
    table: 'communication_replies',
    row: (w) => ({ organization_id: w.org.orgId, communication_id: w.ids.commNeighbor, channel: 'email', body: 'reply' }),
    patch: { body: 'tampered' },
    col: 'body',
  },
  {
    table: 'lease_waiting_list',
    row: (w) => ({ organization_id: w.org.orgId, association_id: w.org.associationId, property_id: w.propNeighbor, status: 'withdrawn' }),
    patch: { status: 'denied' },
    col: 'status',
  },
  {
    table: 'meeting_action_items',
    row: (w) => ({ org_id: w.org.orgId, meeting_id: w.ids.meeting, title: 'Fix gate' }),
    patch: { title: 'tampered' },
    col: 'title',
  },
  {
    table: 'property_events',
    row: (w) => ({ organization_id: w.org.orgId, property_id: w.propNeighbor, kind: 'note' }),
    patch: { notes: 'tampered' },
    col: 'notes',
  },
  {
    table: 'ownerships',
    // The BL-007 forge: name the resident owner of the neighbour's unit.
    row: (w) => ({ organization_id: w.org.orgId, unit_id: w.unitNeighbor, owner_user_id: w.neighbor.id, valid_from: '2024-01-01' }),
    patch: { owner_email: 'tampered@example.test' },
    col: 'owner_email',
  },
  {
    table: 'tenancies',
    row: (w) => ({ organization_id: w.org.orgId, unit_id: w.unitNeighbor, tenant_user_id: w.neighbor.id, lease_start: '2024-01-01', status: 'active' }),
    patch: { monthly_rent: 1 },
    col: 'monthly_rent',
  },
  {
    table: 'property_residents',
    row: (w) => ({ organization_id: w.org.orgId, property_id: w.propNeighbor, full_name: 'Neighbor', email: w.neighbor.email, phone: '555-0100', role: 'owner' }),
    patch: { phone: '555-0199' },
    col: 'phone',
  },
  {
    table: 'hoa_violations',
    row: (w) => ({ org_id: w.org.orgId, property_id: w.propNeighbor, violation_type: 'lawn', description: 'tall grass', status: 'open' }),
    patch: { status: 'resolved' },
    col: 'status',
  },
  {
    table: 'communications',
    row: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      category: 'dues',
      subject: 'Past due notice',
      body_html: '<p>owe</p>',
      audience_definition: {},
      status: 'sent',
    }),
    patch: { subject: 'tampered' },
    col: 'subject',
  },
  {
    table: 'communication_recipients',
    row: (w) => ({ organization_id: w.org.orgId, communication_id: w.ids.commNeighbor, unit_id: w.unitNeighbor, channel: 'email', email: w.neighbor.email }),
    patch: { delivery_status: 'failed' },
    col: 'delivery_status',
  },
]

let w: World

beforeAll(async () => {
  w = await seedWorld()
  // One main row (UPDATE target) and one spare row (DELETE target) per table.
  for (const e of MATRIX) {
    w.ids[`m:${e.table}`] = await insertAs(e.table, e.row(w), `${e.table} main`)
    w.ids[`d:${e.table}`] = await insertAs(e.table, e.row(w), `${e.table} spare`)
  }
}, 120_000)

// ─── resident writes on board-written tables ────────────────────────

describe('a resident cannot write board-maintained tables', () => {
  for (const e of MATRIX) {
    it(`INSERT ${e.table}`, async () => {
      const { error } = await from(w.resident.client, e.table).insert(e.row(w) as never)
      expect(error, `a resident inserted into ${e.table}`).not.toBeNull()
    })

    it(`UPDATE ${e.table}`, async () => {
      const id = w.ids[`m:${e.table}`]
      const before = await readRow(e.table, id)
      await from(w.resident.client, e.table).update(e.patch as never).eq('id' as never, id as never)
      const after = await readRow(e.table, id)
      expect(after?.[e.col], `a resident changed ${e.table}.${e.col}`).toEqual(before?.[e.col])
    })
  }

  it('cannot change the org it belongs to (rename, plan, suspension)', async () => {
    const before = await readRow('orgs', w.org.orgId)
    await w.resident.client.from('orgs').update({ name: 'Pwned HOA', plan: 'enterprise' } as never).eq('id', w.org.orgId)
    const after = await readRow('orgs', w.org.orgId)
    expect(after?.name).toEqual(before?.name)
    expect(after?.plan).toEqual(before?.plan)
  })

  it('cannot create an org (no user-scoped path creates one; onboarding uses the service role)', async () => {
    const { error } = await w.resident.client.from('orgs').insert({ name: `Rogue ${rand()}`, hub_type: 'hoa' } as never)
    expect(error).not.toBeNull()
  })

  it('cannot overwrite the daily digest', async () => {
    await w.resident.client
      .from('hoa_digests')
      .upsert({ org_id: w.org.orgId, content: 'resident wrote this' } as never)
    const row = await readRow('hoa_digests', w.org.orgId, 'org_id')
    expect(row?.content).toBe('seed digest')
  })

  it('cannot write the audit log', async () => {
    const { error } = await w.resident.client
      .from('audit_log')
      .insert({ org_id: w.org.orgId, user_id: w.resident.id, action: 'resident.forged' } as never)
    expect(error).not.toBeNull()
    const before = await readRow('audit_log', w.ids.audit)
    await w.resident.client.from('audit_log').update({ action: 'tampered' } as never).eq('id', w.ids.audit)
    expect((await readRow('audit_log', w.ids.audit))?.action).toBe(before?.action)
  })

  it('cannot create notifications, or mark someone else\'s read', async () => {
    const { error } = await w.resident.client.from('notifications' as never).insert({
      organization_id: w.org.orgId,
      user_id: w.resident.id,
      kind: 'ticket_created',
      title: 'self-made',
    } as never)
    expect(error).not.toBeNull()
    await w.resident.client
      .from('notifications' as never)
      .update({ read_at: new Date().toISOString() } as never)
      .eq('id' as never, w.ids.notifBoard as never)
    expect((await readRow('notifications', w.ids.notifBoard))?.read_at).toBeNull()
  })

  it("cannot register or rewrite a push subscription for someone else", async () => {
    const { error } = await w.resident.client.from('push_subscriptions' as never).insert({
      organization_id: w.org.orgId,
      user_id: w.board.id,
      endpoint: `https://push.example.test/${rand()}`,
      p256dh: 'k',
      auth: 'a',
    } as never)
    expect(error).not.toBeNull()
    const before = await readRow('push_subscriptions', w.ids.pushBoard)
    await w.resident.client
      .from('push_subscriptions' as never)
      .update({ endpoint: 'https://attacker.example.test/x' } as never)
      .eq('id' as never, w.ids.pushBoard as never)
    expect((await readRow('push_subscriptions', w.ids.pushBoard))?.endpoint).toBe(before?.endpoint)
  })

  it("cannot write someone else's communication preferences", async () => {
    const { error: e1 } = await w.resident.client
      .from('resident_communication_preferences')
      .insert({ organization_id: w.org.orgId, unit_id: w.unitNeighbor, email_opt_in: false } as never)
    expect(e1, 'unit-level preference for a neighbour').not.toBeNull()
    await w.resident.client
      .from('resident_communication_preferences')
      .update({ email_opt_in: false } as never)
      .eq('id', w.ids.prefNeighbor)
    expect((await readRow('resident_communication_preferences', w.ids.prefNeighbor))?.email_opt_in).toBe(true)
  })
})

// ─── BL-007: auth_resident_unit_ids cannot be widened ───────────────

describe('a resident cannot widen auth_resident_unit_ids()', () => {
  async function myUnits(u: TestUser): Promise<string[]> {
    const { data, error } = await u.client.rpc('auth_resident_unit_ids' as never)
    if (error) throw new Error(error.message)
    return (data as string[] | null) ?? []
  }

  it('forging an ownership row for the neighbour unit is refused', async () => {
    const { error } = await w.resident.client.from('ownerships').insert({
      organization_id: w.org.orgId,
      unit_id: w.unitNeighbor,
      owner_user_id: w.resident.id,
      valid_from: '2024-01-01',
    })
    expect(error, 'resident forged an ownership').not.toBeNull()
    expect(await myUnits(w.resident)).not.toContain(w.unitNeighbor)
  })

  it("re-pointing the neighbour unit's legacy property link at the resident's own property is refused", async () => {
    // emailResident is linked to propEmail by email. Pointing unitNeighbor
    // at propEmail would hand them unitNeighbor through the email branch.
    await w.emailResident.client
      .from('units')
      .update({ legacy_hoa_property_id: w.propEmail } as never)
      .eq('id', w.unitNeighbor)
    expect((await readRow('units', w.unitNeighbor))?.legacy_hoa_property_id).toBe(w.propNeighbor)
    expect(await myUnits(w.emailResident)).not.toContain(w.unitNeighbor)
  })

  it('adding themselves to the neighbour property roster is refused', async () => {
    const { error } = await w.emailResident.client.from('property_residents').insert({
      organization_id: w.org.orgId,
      property_id: w.propNeighbor,
      full_name: 'Me',
      email: w.emailResident.email,
      role: 'owner',
    } as never)
    expect(error).not.toBeNull()
    expect(await myUnits(w.emailResident)).not.toContain(w.unitNeighbor)
  })

  it('both legitimate link paths still resolve (ownership, property_residents email)', async () => {
    expect(await myUnits(w.resident)).toEqual([w.unitMine])
    expect(await myUnits(w.emailResident)).toEqual([w.unitEmail])
  })
})

// ─── resident reads ─────────────────────────────────────────────────

describe('resident reads are scoped to what is theirs', () => {
  it('ownerships: their own (getOwnedUnits shape, with the unit join), not the neighbour', async () => {
    const { data, error } = await w.resident.client
      .from('ownerships')
      .select('unit_id, ownership_pct, valid_from, unit:units(unit_number, address_line1, association_id)')
      .eq('owner_user_id', w.resident.id)
      .is('valid_to', null)
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.unit_id)).toEqual([w.unitMine])
    expect((data ?? [])[0]?.unit, 'the units join came back empty').not.toBeNull()
    expect(await visible(w.resident.client, 'ownerships', [w.ids.ownMine, w.ids.ownNeighbor])).toEqual([w.ids.ownMine])
  })

  it('property_residents: the email fallback still finds their row (ilike, different case), nothing else', async () => {
    const { data, error } = await w.emailResident.client
      .from('property_residents' as never)
      .select('property_id, role, moved_in_at, property:hoa_properties(id, address, unit_number, org_id)')
      .ilike('email' as never, w.emailResident.email)
      .is('moved_out_at' as never, null)
    expect(error).toBeNull()
    const rows = (data ?? []) as unknown as Array<{ property_id: string; property: unknown }>
    expect(rows.map((r) => r.property_id)).toEqual([w.propEmail])
    expect(rows[0]?.property).not.toBeNull()
    // ...and the follow-up units lookup by legacy id.
    const { data: units } = await w.emailResident.client
      .from('units')
      .select('id')
      .in('legacy_hoa_property_id', [w.propEmail])
    expect((units ?? []).map((u) => u.id)).toEqual([w.unitEmail])

    const neighbourRow = w.ids['m:property_residents']
    expect(await visible(w.resident.client, 'property_residents', [neighbourRow, w.ids.prEmail])).toEqual([])
  })

  it('tenancies: their own only', async () => {
    expect(await visible(w.resident.client, 'tenancies', [w.ids.tenMine, w.ids['m:tenancies']])).toEqual([w.ids.tenMine])
  })

  it('hoa_violations: their own property (resident dashboard shape), not the neighbour', async () => {
    const { data, error } = await w.resident.client
      .from('hoa_violations')
      .select('id, violation_type, status')
      .in('property_id', [w.propMine, w.propNeighbor])
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.id)).toEqual([w.ids.vioMine])
  })

  it('announcements: the page query finds exactly what was addressed to them (unit, user, email)', async () => {
    for (const [user, units, expected] of [
      [w.resident, [w.unitMine], [w.ids.commMine]],
      [w.emailResident, [w.unitEmail], [w.ids.commEmail, w.ids.commUnitEmail]],
    ] as const) {
      const filters = buildRecipientIdentityFilters({ unitIds: [...units], userId: user.id, email: user.email })
      const { data: recs, error } = await user.client
        .from('communication_recipients' as never)
        .select('communication_id, rendered_subject, unit_id, sent_at')
        .eq('organization_id' as never, w.org.orgId as never)
        .or(filters.join(','))
      expect(error).toBeNull()
      const commIds = ((recs ?? []) as Array<{ communication_id: string }>).map((r) => r.communication_id)
      expect([...new Set(commIds)].sort()).toEqual([...expected].sort())

      const { data: comms, error: cErr } = await user.client
        .from('communications' as never)
        .select('id, subject')
        .eq('organization_id' as never, w.org.orgId as never)
        .eq('status' as never, 'sent' as never)
        .is('deleted_at' as never, null)
        .in('id' as never, commIds as never)
      expect(cErr).toBeNull()
      expect(((comms ?? []) as Array<{ id: string }>).map((c) => c.id).sort()).toEqual([...expected].sort())
    }
  })

  it("communications: a letter addressed only to the neighbour is invisible", async () => {
    expect(await visible(w.resident.client, 'communications', [w.ids.commNeighbor, w.ids['m:communications']])).toEqual([])
    expect(await visible(w.resident.client, 'communication_recipients', [w.ids.recNeighbor])).toEqual([])
  })

  it('associations: still reads name and compliance_settings (the resident Pay screen needs the Zelle block)', async () => {
    const { data, error } = await w.resident.client
      .from('associations')
      .select('id, name, slug, compliance_settings')
      .eq('id', w.org.associationId)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(w.org.associationId)
  })

  it('org-wide reference tables stay readable', async () => {
    for (const e of MATRIX.filter((m) => m.residentReadsOrgWide)) {
      const id = w.ids[`m:${e.table}`]
      expect(await visible(w.resident.client, e.table, [id]), `resident lost read of ${e.table}`).toEqual([id])
    }
    // Global community templates (organization_id IS NULL) too.
    const { count } = await w.resident.client
      .from('communication_templates')
      .select('id', { count: 'exact', head: true })
      .is('organization_id', null)
    expect(count ?? 0).toBeGreaterThan(0)
  })

  it('board-internal tables read as empty', async () => {
    for (const t of ['communication_threads', 'communication_replies', 'lease_waiting_list', 'meeting_action_items', 'property_events']) {
      expect(await visible(w.resident.client, t, [w.ids[`m:${t}`]]), `resident read ${t}`).toEqual([])
    }
    expect(await visible(w.resident.client, 'audit_log', [w.ids.audit])).toEqual([])
    const { data: digest } = await w.resident.client.from('hoa_digests').select('org_id').eq('org_id', w.org.orgId)
    expect(digest ?? []).toEqual([])
  })

  it("notifications and push subscriptions: never someone else's", async () => {
    expect(await visible(w.resident.client, 'notifications', [w.ids.notifBoard, w.ids.notifResident])).toEqual([w.ids.notifResident])
    expect(await visible(w.resident.client, 'push_subscriptions', [w.ids.pushBoard])).toEqual([])
    expect(await visible(w.resident.client, 'resident_communication_preferences', [w.ids.prefNeighbor])).toEqual([])
  })
})

// ─── C-19: owner contact list and board notes ───────────────────────
//
// hoa_properties holds owner_name / owner_email / owner_phone and the
// board's notes; units holds board notes. Before the C-19 amendment 0063
// left both readable by every org member, so one resident login plus the
// anon key pulled the whole HOA's owner contact list over REST.

const OWNER_PII = ['owner_name', 'owner_email', 'owner_phone', 'notes'] as const

describe("owner privacy (C-19): a resident never reads another unit's owner contact or notes", () => {
  it('hoa_properties: a bulk REST pull of the whole org returns only their own property', async () => {
    for (const [user, expected] of [
      [w.resident, [w.propMine]],
      [w.emailResident, [w.propEmail]],
      [w.neighbor, [w.propNeighbor]],
    ] as const) {
      const { data, error } = await user.client
        .from('hoa_properties')
        .select(`id, ${OWNER_PII.join(', ')}`)
        .eq('org_id', w.org.orgId)
      expect(error).toBeNull()
      expect(((data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id)).toEqual([...expected])
    }
  })

  it("hoa_properties: the neighbour's row is invisible by id, column by column, and as a filter oracle", async () => {
    for (const col of OWNER_PII) {
      const { data, error } = await w.resident.client.from('hoa_properties').select(col).eq('id', w.propNeighbor)
      expect(error).toBeNull()
      expect(data ?? [], `resident read neighbour ${col}`).toEqual([])
    }
    // Filtering on a value must not confirm it either.
    const neighbour = await readRow('hoa_properties', w.propNeighbor)
    const { data: probe } = await w.resident.client
      .from('hoa_properties')
      .select('id')
      .eq('owner_email', String(neighbour?.owner_email))
    expect(probe ?? []).toEqual([])
  })

  it('units: only their own unit (board notes on anyone else stay hidden)', async () => {
    for (const [user, expected] of [
      [w.resident, [w.unitMine]],
      [w.emailResident, [w.unitEmail]],
    ] as const) {
      const { data, error } = await user.client.from('units').select('id, notes').eq('organization_id', w.org.orgId)
      expect(error).toBeNull()
      expect((data ?? []).map((r) => r.id)).toEqual([...expected])
    }
  })

  it("auth_resident_property_ids(): the caller's own ids only; anon cannot call it", async () => {
    for (const [user, expected] of [
      [w.resident, [w.propMine]],
      [w.emailResident, [w.propEmail]],
    ] as const) {
      const { data, error } = await user.client.rpc('auth_resident_property_ids' as never)
      expect(error).toBeNull()
      expect([...((data ?? []) as string[])].sort()).toEqual([...expected])
    }
    // 0063 revokes EXECUTE from anon, but local-db-reset re-grants every
    // routine to anon after replay (stock Supabase), so assert the part
    // that holds either way: no login, no ids.
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    const { data: anonIds, error: anonErr } = await anon.rpc('auth_resident_property_ids' as never)
    expect(anonErr !== null || ((anonIds ?? []) as string[]).length === 0).toBe(true)
  })

  it('board-only documents, minutes and governing drafts are invisible; the allowlisted ones are not', async () => {
    expect(await visible(w.resident.client, 'hoa_documents', [w.ids.doc, w.ids.docOther, w.ids.docMinutes])).toEqual([w.ids.doc])
    expect(await visible(w.resident.client, 'hoa_meeting_minutes', [w.ids.meeting, w.ids.meetingApproved])).toEqual([])
    expect(
      await visible(w.resident.client, 'governing_documents', [w.ids.govDoc, w.ids.govMinutes, w.ids.govSuperseded, w.ids.govAi]),
    ).toEqual([w.ids.govDoc])
    expect(await visible(w.resident.client, 'governing_document_chunks', [w.ids.chunkVisible, w.ids.chunkHidden])).toEqual([
      w.ids.chunkVisible,
    ])
  })

  it('every resident page still loads its data (exact app query shapes)', async () => {
    // lib/resident.ts getOwnedUnits, ownership path: the units join.
    const { data: owned } = await w.resident.client
      .from('ownerships')
      .select('unit_id, ownership_pct, valid_from, unit:units(unit_number, address_line1, association_id)')
      .eq('owner_user_id', w.resident.id)
      .is('valid_to', null)
    const ownedRows = (owned ?? []) as unknown as Array<{ unit: { address_line1: string | null } | null }>
    expect(ownedRows).toHaveLength(1)
    expect(ownedRows[0]?.unit?.address_line1, 'ownership units join empty').toBeTruthy()

    // getOwnedUnits email fallback: property_residents -> hoa_properties, then units.
    const { data: pr } = await w.emailResident.client
      .from('property_residents' as never)
      .select('property_id, role, moved_in_at, property:hoa_properties(id, address, unit_number, org_id)')
      .ilike('email' as never, w.emailResident.email)
      .is('moved_out_at' as never, null)
    const prRows = (pr ?? []) as unknown as Array<{ property: { id: string; address: string | null } | null }>
    expect(prRows.map((r) => r.property?.id)).toEqual([w.propEmail])
    expect(prRows[0]?.property?.address, 'email-fallback hoa_properties join empty').toBeTruthy()
    const { data: links } = await w.emailResident.client
      .from('units')
      .select('id, legacy_hoa_property_id, association_id')
      .in('legacy_hoa_property_id', [w.propEmail])
    expect((links ?? []).map((u) => u.id)).toEqual([w.unitEmail])

    // lib/resident-dashboard.ts getOpenViolations: unit -> legacy property -> violations.
    const { data: unitRows, error: uErr } = await w.resident.client
      .from('units')
      .select('legacy_hoa_property_id')
      .in('id', [w.unitMine])
    expect(uErr).toBeNull()
    expect((unitRows ?? []).map((u) => u.legacy_hoa_property_id)).toEqual([w.propMine])
    const { data: vio } = await w.resident.client.from('hoa_violations').select('id').in('property_id', [w.propMine])
    expect((vio ?? []).map((v) => v.id)).toEqual([w.ids.vioMine])

    // /resident/documents (BL-049): the real query module, own client.
    const docs = await fetchResidentDocuments(w.resident.client, w.org.orgId)
    const docIds = docs.map((d) => d.id)
    expect(docIds).toEqual(expect.arrayContaining([w.ids.doc, w.ids.govDoc]))
    for (const hidden of [w.ids.docOther, w.ids.docMinutes, w.ids.govMinutes, w.ids.govSuperseded, w.ids.govAi]) {
      expect(docIds).not.toContain(hidden)
    }
    expect(await fetchResidentDocumentFile(w.resident.client, w.org.orgId, 'hoa', w.ids.doc)).not.toBeNull()

    // Pay screen: associations (name + Zelle block) is unchanged.
    const { data: assoc } = await w.resident.client
      .from('associations')
      .select('id, name, slug, compliance_settings')
      .eq('id', w.org.associationId)
      .maybeSingle()
    expect(assoc?.id).toBe(w.org.associationId)
  })

  it('board and admin still read every property, unit, document and minutes row in full', async () => {
    for (const actor of [w.board, w.admin]) {
      const { data: props, error } = await actor.client
        .from('hoa_properties')
        .select(`id, ${OWNER_PII.join(', ')}`)
        .in('id', [w.propMine, w.propNeighbor, w.propEmail])
      expect(error).toBeNull()
      const rows = (props ?? []) as unknown as Array<Record<string, string | null>>
      expect(rows).toHaveLength(3)
      for (const r of rows) for (const col of OWNER_PII) expect(r[col], `board lost ${col}`).toBeTruthy()

      const { data: units } = await actor.client
        .from('units')
        .select('id, notes')
        .in('id', [w.unitMine, w.unitNeighbor, w.unitEmail])
      expect((units ?? []).filter((u) => u.notes)).toHaveLength(3)

      expect(await visible(actor.client, 'hoa_documents', [w.ids.doc, w.ids.docOther, w.ids.docMinutes])).toHaveLength(3)
      expect(await visible(actor.client, 'hoa_meeting_minutes', [w.ids.meeting, w.ids.meetingApproved])).toHaveLength(2)
      expect(
        await visible(actor.client, 'governing_documents', [w.ids.govDoc, w.ids.govMinutes, w.ids.govSuperseded, w.ids.govAi]),
      ).toHaveLength(4)
      expect(await visible(actor.client, 'governing_document_chunks', [w.ids.chunkVisible, w.ids.chunkHidden])).toHaveLength(2)
    }
  })

  it('a board member of another org reads none of it', async () => {
    expect(await visible(w.foreignBoard.client, 'hoa_properties', [w.propMine, w.propNeighbor])).toEqual([])
    expect(await visible(w.foreignBoard.client, 'units', [w.unitMine, w.unitNeighbor])).toEqual([])
  })
})

// ─── resident submission flows (legitimate writes keep working) ─────

describe('tickets: resident flow works, the board side is not theirs to write', () => {
  it('createTicket shape: insert own ticket for own unit, read it back', async () => {
    const { data, error } = await w.resident.client
      .from('tickets' as never)
      .insert({
        organization_id: w.org.orgId,
        association_id: w.org.associationId,
        unit_id: w.unitMine,
        submitted_by: w.resident.id,
        category: 'maintenance',
        subject: 'Gate stuck',
        description: 'It will not open.',
        status: 'open',
      } as never)
      .select('id')
      .single<{ id: string }>()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('addTicketMessage shape: resident reply on own ticket', async () => {
    const { error } = await w.resident.client.from('ticket_messages' as never).insert({
      ticket_id: w.ids.ticketMine,
      author_id: w.resident.id,
      author_role: 'resident',
      body: 'Any update?',
      internal: false,
    } as never)
    expect(error).toBeNull()
  })

  it('reads own ticket and the non-internal thread only', async () => {
    expect(await visible(w.resident.client, 'tickets', [w.ids.ticketMine, w.ids.ticketNeighbor])).toEqual([w.ids.ticketMine])
    expect(await visible(w.resident.client, 'ticket_messages', [w.ids.tmBoard, w.ids.tmInternal])).toEqual([w.ids.tmBoard])
  })

  it('forgeries are refused', async () => {
    const forged = [
      ['ticket filed as already closed', 'tickets', { organization_id: w.org.orgId, submitted_by: w.resident.id, subject: 's', category: 'general', description: 'd', status: 'closed' }],
      ['ticket filed as urgent', 'tickets', { organization_id: w.org.orgId, submitted_by: w.resident.id, subject: 's', category: 'general', description: 'd', priority: 'urgent' }],
      ['ticket for the neighbour unit', 'tickets', { organization_id: w.org.orgId, unit_id: w.unitNeighbor, submitted_by: w.resident.id, subject: 's', category: 'general', description: 'd' }],
      ['ticket in the neighbour name', 'tickets', { organization_id: w.org.orgId, submitted_by: w.neighbor.id, subject: 's', category: 'general', description: 'd' }],
      ['message posing as the board', 'ticket_messages', { ticket_id: w.ids.ticketMine, author_id: w.resident.id, author_role: 'board', body: 'Approved!', internal: false }],
      ['internal note', 'ticket_messages', { ticket_id: w.ids.ticketMine, author_id: w.resident.id, author_role: 'resident', body: 'x', internal: true }],
      ['message under another author', 'ticket_messages', { ticket_id: w.ids.ticketMine, author_id: w.board.id, author_role: 'resident', body: 'x', internal: false }],
      ["message on the neighbour's ticket", 'ticket_messages', { ticket_id: w.ids.ticketNeighbor, author_id: w.resident.id, author_role: 'resident', body: 'x', internal: false }],
    ] as const
    for (const [label, table, row] of forged) {
      const { error } = await from(w.resident.client, table).insert(row as never)
      expect(error, label).not.toBeNull()
    }
  })

  it('cannot close or re-prioritise their own ticket, or edit the board reply', async () => {
    await w.resident.client.from('tickets' as never).update({ status: 'closed', priority: 'urgent' } as never).eq('id' as never, w.ids.ticketMine as never)
    const t = await readRow('tickets', w.ids.ticketMine)
    expect(t?.status).toBe('open')
    expect(t?.priority).toBe('normal')
    await w.resident.client.from('ticket_messages' as never).update({ body: 'tampered' } as never).eq('id' as never, w.ids.tmBoard as never)
    expect((await readRow('ticket_messages', w.ids.tmBoard))?.body).toBe('board reply')
  })
})

describe('ARC requests: resident submits, replies and withdraws; cannot decide', () => {
  it('createArcRequest shape for their own unit', async () => {
    const { data, error } = await w.resident.client
      .from('arc_requests' as never)
      .insert({
        organization_id: w.org.orgId,
        association_id: w.org.associationId,
        unit_id: w.unitMine,
        submitted_by: w.resident.id,
        category: 'solar',
        summary: 'Panels',
        scope_description: '12 panels',
        proposed_start: null,
        proposed_completion: null,
        contractor_name: null,
        contractor_license: null,
        status: 'submitted',
      } as never)
      .select('id')
      .single<{ id: string }>()
    expect(error).toBeNull()
    w.ids.arcCreated = data!.id
  })

  it('a resident linked only by email can file for their email-linked unit', async () => {
    const { error } = await w.emailResident.client.from('arc_requests' as never).insert({
      organization_id: w.org.orgId,
      unit_id: w.unitEmail,
      submitted_by: w.emailResident.id,
      category: 'paint',
      summary: 'Door',
      scope_description: 'red',
      status: 'submitted',
    } as never)
    expect(error).toBeNull()
  })

  it('addArcMessage shape', async () => {
    const { error } = await w.resident.client.from('arc_request_messages' as never).insert({
      arc_request_id: w.ids.arcMine,
      author_id: w.resident.id,
      author_role: 'resident',
      body: 'Photos attached.',
      internal: false,
    } as never)
    expect(error).toBeNull()
  })

  it('withdrawMyArcRequest shape returns the row', async () => {
    const { data, error } = await w.resident.client
      .from('arc_requests' as never)
      .update({ status: 'withdrawn' } as never)
      .eq('id' as never, w.ids.arcCreated as never)
      .eq('submitted_by' as never, w.resident.id as never)
      .in('status' as never, ['submitted', 'in_review'] as never)
      .is('deleted_at' as never, null)
      .select('id')
      .maybeSingle<{ id: string }>()
    expect(error).toBeNull()
    expect(data?.id).toBe(w.ids.arcCreated)
  })

  it('cannot approve their own request, un-decide a decided one, or revive a withdrawn one', async () => {
    await w.resident.client.from('arc_requests' as never).update({ status: 'approved', board_response: 'Yes' } as never).eq('id' as never, w.ids.arcMine as never)
    const a = await readRow('arc_requests', w.ids.arcMine)
    expect(a?.status).toBe('submitted')
    expect(a?.board_response).toBeNull()

    await w.resident.client.from('arc_requests' as never).update({ status: 'withdrawn' } as never).eq('id' as never, w.ids.arcMineDecided as never)
    expect((await readRow('arc_requests', w.ids.arcMineDecided))?.status).toBe('denied')

    await w.resident.client.from('arc_requests' as never).update({ status: 'submitted' } as never).eq('id' as never, w.ids.arcCreated as never)
    expect((await readRow('arc_requests', w.ids.arcCreated))?.status).toBe('withdrawn')
  })

  it('forgeries are refused', async () => {
    const forged = [
      ['filed as approved', 'arc_requests', { organization_id: w.org.orgId, submitted_by: w.resident.id, category: 'pool', summary: 's', scope_description: 'd', status: 'approved' }],
      ['filed with a board response', 'arc_requests', { organization_id: w.org.orgId, submitted_by: w.resident.id, category: 'pool', summary: 's', scope_description: 'd', board_response: 'Approved by board' }],
      ['filed for the neighbour unit', 'arc_requests', { organization_id: w.org.orgId, unit_id: w.unitNeighbor, submitted_by: w.resident.id, category: 'pool', summary: 's', scope_description: 'd' }],
      ['message posing as the board', 'arc_request_messages', { arc_request_id: w.ids.arcMine, author_id: w.resident.id, author_role: 'board', body: 'Approved', internal: false }],
      ["message on the neighbour's request", 'arc_request_messages', { arc_request_id: w.ids.arcNeighbor, author_id: w.resident.id, author_role: 'resident', body: 'x', internal: false }],
    ] as const
    for (const [label, table, row] of forged) {
      const { error } = await from(w.resident.client, table).insert(row as never)
      expect(error, label).not.toBeNull()
    }
  })

  it('reads own requests and the non-internal thread only', async () => {
    expect(await visible(w.resident.client, 'arc_requests', [w.ids.arcMine, w.ids.arcNeighbor])).toEqual([w.ids.arcMine])
    expect(await visible(w.resident.client, 'arc_request_messages', [w.ids.amBoard, w.ids.amInternal])).toEqual([w.ids.amBoard])
  })
})

describe('violation reports: resident files and replies; cannot rule on them', () => {
  it('createViolationReport + addViolationReportMessage shapes', async () => {
    const { data, error } = await w.resident.client
      .from('resident_violation_reports' as never)
      .insert({
        organization_id: w.org.orgId,
        association_id: w.org.associationId,
        reported_by: w.resident.id,
        about_address: '12 Elm',
        category: 'parking',
        description: 'RV on lawn',
        occurred_at: null,
        status: 'submitted',
      } as never)
      .select('id')
      .single<{ id: string }>()
    expect(error).toBeNull()
    const { error: mErr } = await w.resident.client.from('resident_violation_report_messages' as never).insert({
      report_id: data!.id,
      author_id: w.resident.id,
      author_role: 'resident',
      body: 'Still there.',
      internal: false,
    } as never)
    expect(mErr).toBeNull()
  })

  it('cannot file as already actioned, or change the board outcome', async () => {
    const { error } = await w.resident.client.from('resident_violation_reports' as never).insert({
      organization_id: w.org.orgId,
      reported_by: w.resident.id,
      category: 'other',
      description: 'x',
      status: 'opened_as_violation',
    } as never)
    expect(error).not.toBeNull()
    await w.resident.client
      .from('resident_violation_reports' as never)
      .update({ status: 'dismissed', board_note: 'resident wrote this' } as never)
      .eq('id' as never, w.ids.reportMine as never)
    const r = await readRow('resident_violation_reports', w.ids.reportMine)
    expect(r?.status).toBe('submitted')
    expect(r?.board_note).toBeNull()
  })

  it('reads own reports and the non-internal thread only', async () => {
    expect(await visible(w.resident.client, 'resident_violation_reports', [w.ids.reportMine, w.ids.reportNeighbor])).toEqual([w.ids.reportMine])
    expect(await visible(w.resident.client, 'resident_violation_report_messages', [w.ids.rmBoard, w.ids.rmInternal])).toEqual([w.ids.rmBoard])
  })
})

describe('own-row tables', () => {
  it('a resident sets their own communication preferences (BL-020 groundwork)', async () => {
    const { data, error } = await w.resident.client
      .from('resident_communication_preferences')
      .insert({ organization_id: w.org.orgId, user_id: w.resident.id, email_opt_in: false } as never)
      .select('id')
      .single()
    expect(error).toBeNull()
    const { error: uErr } = await w.resident.client
      .from('resident_communication_preferences')
      .update({ email_opt_in: true } as never)
      .eq('id', (data as { id: string }).id)
    expect(uErr).toBeNull()
    expect((await readRow('resident_communication_preferences', (data as { id: string }).id))?.email_opt_in).toBe(true)
  })

  it('board member saves and removes their own push subscription (savePushSubscription upsert shape)', async () => {
    const endpoint = `https://push.example.test/${rand()}`
    const row = { organization_id: w.org.orgId, user_id: w.board.id, endpoint, p256dh: 'k', auth: 'a', user_agent: 'test' }
    const { error } = await w.board.client.from('push_subscriptions' as never).upsert(row as never, { onConflict: 'endpoint' })
    expect(error).toBeNull()
    // Re-subscribing the same endpoint updates in place.
    const { error: again } = await w.board.client
      .from('push_subscriptions' as never)
      .upsert({ ...row, p256dh: 'k2' } as never, { onConflict: 'endpoint' })
    expect(again).toBeNull()
    const { error: dErr } = await w.board.client
      .from('push_subscriptions' as never)
      .delete()
      .eq('endpoint' as never, endpoint as never)
      .eq('user_id' as never, w.board.id as never)
    expect(dErr).toBeNull()
    const { count } = await adminDb()
      .from('push_subscriptions' as never)
      .select('id', { count: 'exact', head: true })
      .eq('endpoint' as never, endpoint as never)
    expect(count).toBe(0)
  })

  it('board member reads and marks their own notifications read, never a resident\'s', async () => {
    const { data, error } = await w.board.client
      .from('notifications' as never)
      .select('id')
      .eq('organization_id' as never, w.org.orgId as never)
      .eq('user_id' as never, w.board.id as never)
    expect(error).toBeNull()
    expect(((data ?? []) as Array<{ id: string }>).map((r) => r.id)).toContain(w.ids.notifBoard)
    await w.board.client
      .from('notifications' as never)
      .update({ read_at: new Date().toISOString() } as never)
      .eq('id' as never, w.ids.notifBoard as never)
      .eq('user_id' as never, w.board.id as never)
      .is('read_at' as never, null)
    expect((await readRow('notifications', w.ids.notifBoard))?.read_at).not.toBeNull()
    expect(await visible(w.board.client, 'notifications', [w.ids.notifResident])).toEqual([])
  })
})

// ─── board / admin positive controls ────────────────────────────────

describe('board and admin keep their write paths', () => {
  for (const e of MATRIX) {
    it(`${e.writer ?? 'board'} inserts, updates and deletes ${e.table}`, async () => {
      const actor = e.writer === 'admin' ? w.admin : w.board
      const { data, error } = await from(actor.client, e.table).insert(e.row(w) as never).select('id').single()
      expect(error, `${e.table} insert`).toBeNull()
      const id = (data as unknown as { id: string }).id
      const { error: uErr } = await from(actor.client, e.table).update(e.patch as never).eq('id' as never, id as never)
      expect(uErr, `${e.table} update`).toBeNull()
      expect((await readRow(e.table, id))?.[e.col]).toEqual(e.patch[e.col])
      const { error: dErr } = await from(actor.client, e.table).delete().eq('id' as never, id as never)
      expect(dErr, `${e.table} delete`).toBeNull()
      expect(await readRow(e.table, id), `${e.table} row survived delete`).toBeNull()
    })
  }

  it('board reads every row in the matrix, neighbours included', async () => {
    for (const e of MATRIX) {
      const id = w.ids[`m:${e.table}`]
      expect(await visible(w.board.client, e.table, [id]), `board lost read of ${e.table}`).toEqual([id])
    }
    expect(await visible(w.board.client, 'ownerships', [w.ids.ownMine, w.ids.ownNeighbor])).toHaveLength(2)
    expect(await visible(w.board.client, 'hoa_violations', [w.ids.vioMine, w.ids.vioNeighbor])).toHaveLength(2)
  })

  it('board updates association compliance_settings (saveZelleSettings) but cannot create or delete an association', async () => {
    const { error } = await w.board.client
      .from('associations')
      .update({ compliance_settings: { board_wrote: true } } as never)
      .eq('id', w.org.associationId)
    expect(error).toBeNull()
    expect((await readRow('associations', w.org.associationId))?.compliance_settings).toEqual({ board_wrote: true })

    const { error: iErr } = await w.board.client
      .from('associations')
      .insert({ organization_id: w.org.orgId, name: 'x', state: 'FL', slug: `B${rand()}` } as never)
    expect(iErr).not.toBeNull()
    await w.board.client.from('associations').delete().eq('id', w.ids['d:associations'])
    expect(await readRow('associations', w.ids['d:associations'])).not.toBeNull()
  })

  it('board works the submission queues (respond, decide, internal note)', async () => {
    const { error: t } = await w.board.client.from('tickets' as never).update({ status: 'in_progress', priority: 'high' } as never).eq('id' as never, w.ids.ticketNeighbor as never)
    expect(t).toBeNull()
    expect((await readRow('tickets', w.ids.ticketNeighbor))?.status).toBe('in_progress')
    const { error: a } = await w.board.client
      .from('arc_requests' as never)
      .update({ status: 'approved', board_response: 'OK', board_response_at: new Date().toISOString(), board_response_by: w.board.id } as never)
      .eq('id' as never, w.ids.arcNeighbor as never)
    expect(a).toBeNull()
    expect((await readRow('arc_requests', w.ids.arcNeighbor))?.status).toBe('approved')
    const { error: r } = await w.board.client.from('resident_violation_reports' as never).update({ status: 'under_review' } as never).eq('id' as never, w.ids.reportNeighbor as never)
    expect(r).toBeNull()
    for (const [table, col, parent] of [
      ['ticket_messages', 'ticket_id', w.ids.ticketNeighbor],
      ['arc_request_messages', 'arc_request_id', w.ids.arcNeighbor],
      ['resident_violation_report_messages', 'report_id', w.ids.reportNeighbor],
    ] as const) {
      const { error } = await from(w.board.client, table).insert({ [col]: parent, author_id: w.board.id, author_role: 'board', body: 'note', internal: true } as never)
      expect(error, table).toBeNull()
    }
    expect(await visible(w.board.client, 'ticket_messages', [w.ids.tmInternal])).toEqual([w.ids.tmInternal])
  })

  it('board writes the audit log as itself (vendor compliance override), and it is append-only', async () => {
    const { error } = await w.board.client
      .from('audit_log')
      .insert({ org_id: w.org.orgId, user_id: w.board.id, action: 'vendor.compliance.manual_override' } as never)
    expect(error).toBeNull()
    const { error: spoof } = await w.board.client
      .from('audit_log')
      .insert({ org_id: w.org.orgId, user_id: w.admin.id, action: 'spoofed' } as never)
    expect(spoof, 'board wrote an audit row in someone else\'s name').not.toBeNull()
    await w.board.client.from('audit_log').update({ action: 'tampered' } as never).eq('id', w.ids.audit)
    expect((await readRow('audit_log', w.ids.audit))?.action).toBe('test.seed')
    expect(await visible(w.board.client, 'audit_log', [w.ids.audit])).toEqual([w.ids.audit])
  })

  it('board refreshes the daily digest (upsert)', async () => {
    const { error } = await w.board.client
      .from('hoa_digests')
      .upsert({ org_id: w.org.orgId, content: 'board digest', generated_at: new Date().toISOString() } as never)
    expect(error).toBeNull()
    expect((await readRow('hoa_digests', w.org.orgId, 'org_id'))?.content).toBe('board digest')
  })

  it('admin may rename the org; board may not', async () => {
    await w.board.client.from('orgs').update({ name: 'Board rename' } as never).eq('id', w.org.orgId)
    expect((await readRow('orgs', w.org.orgId))?.name).not.toBe('Board rename')
    const { error } = await w.admin.client.from('orgs').update({ name: 'Admin rename' } as never).eq('id', w.org.orgId)
    expect(error).toBeNull()
    expect((await readRow('orgs', w.org.orgId))?.name).toBe('Admin rename')
  })

  it('a board member of another org can neither read nor write this org', async () => {
    for (const e of MATRIX) {
      expect(await visible(w.foreignBoard.client, e.table, [w.ids[`m:${e.table}`]]), `foreign read ${e.table}`).toEqual([])
    }
    const { error } = await w.foreignBoard.client.from('ownerships').insert({
      organization_id: w.org.orgId,
      unit_id: w.unitMine,
      owner_user_id: w.foreignBoard.id,
      valid_from: '2024-01-01',
    })
    expect(error).not.toBeNull()
    await w.foreignBoard.client.from('tickets' as never).update({ status: 'closed' } as never).eq('id' as never, w.ids.ticketMine as never)
    expect((await readRow('tickets', w.ids.ticketMine))?.status).toBe('open')
  })

  it('the service role (import / invite paths) is unaffected', async () => {
    const unit = await makeUnit(w.org)
    const id = await insertAs(
      'ownerships',
      { organization_id: w.org.orgId, unit_id: unit, owner_user_id: w.neighbor.id, valid_from: '2024-01-01', source: 'member_invite' },
      'service-role ownership',
    )
    expect(await readRow('ownerships', id)).not.toBeNull()
  })
})

describe('property_bridge_gaps (0028 view)', () => {
  it('is not readable without a login, and does not bypass RLS for a member of another org', async () => {
    // The org has an unbridged unit (makeUnit sets no legacy link).
    await makeUnit(w.org)
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    const { data: anonRows } = await anon.from('property_bridge_gaps' as never).select('organization_id')
    expect(anonRows ?? [], 'anon read the view').toEqual([])
    const { data: foreignRows } = await w.foreignBoard.client
      .from('property_bridge_gaps' as never)
      .select('organization_id')
      .eq('organization_id' as never, w.org.orgId as never)
    expect(foreignRows ?? [], 'another org read the view').toEqual([])
  })
})

// ─── DELETE negatives: last, and only against spare rows ────────────

describe('a resident cannot delete', () => {
  for (const e of MATRIX) {
    it(`DELETE ${e.table}`, async () => {
      const id = w.ids[`d:${e.table}`]
      expect(await readRow(e.table, id), `spare ${e.table} row missing`).not.toBeNull()
      await from(w.resident.client, e.table).delete().eq('id' as never, id as never)
      expect(await readRow(e.table, id), `a resident deleted a ${e.table} row`).not.toBeNull()
    })
  }

  const own: Array<[string, string]> = [
    ['tickets', 'ticketMineDel'],
    ['arc_requests', 'arcMineDel'],
    ['resident_violation_reports', 'reportMineDel'],
    ['ticket_messages', 'tmBoardDel'],
    ['arc_request_messages', 'amBoardDel'],
    ['resident_violation_report_messages', 'rmBoardDel'],
    ['notifications', 'notifBoardDel'],
    ['push_subscriptions', 'pushBoardDel'],
    ['audit_log', 'auditDel'],
  ]
  for (const [table, key] of own) {
    it(`DELETE ${table} (${key})`, async () => {
      const id = w.ids[key]
      await from(w.resident.client, table).delete().eq('id' as never, id as never)
      expect(await readRow(table, id), `a resident deleted ${table} ${key}`).not.toBeNull()
    })
  }

  it('DELETE hoa_digests', async () => {
    await w.resident.client.from('hoa_digests').delete().eq('org_id', w.org.orgId)
    expect(await readRow('hoa_digests', w.org.orgId, 'org_id')).not.toBeNull()
  })

  it('DELETE orgs (an org the resident belongs to)', async () => {
    await w.resident.client.from('orgs').delete().eq('id', w.spareOrg.orgId)
    expect(await readRow('orgs', w.spareOrg.orgId)).not.toBeNull()
  })
})
