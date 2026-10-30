/**
 * "Email this statement": the Supabase side (statement-store.ts) against
 * the real schema.
 *
 * statement-run.test.ts proves the runner's logic against a fake store; this
 * file proves the store's queries, column names and constraints against real
 * Postgres. Fixtures are seeded with adminDb(); the store itself runs with a
 * board member's RLS client, exactly as the server action does in production.
 *
 * Nothing is sent: the sender is a stub that answers the way the outbound
 * guard does outside production (OUTBOUND_BLOCKED_ERROR), so the recipient
 * lands as `suppressed`.
 *
 * Scope note: loadContext (ledger figures) is covered by statement.test.ts.
 * The runner test below substitutes a fixed context for it and reads the
 * owners itself, so owner selection is asserted through
 * loadStatementRecipientPreview, which uses the store's own owner query.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '../../../packages/observability/src/outbound-guard'
import {
  STATEMENT_AUDIT_ACTION,
  STATEMENT_RESOURCE_TYPE,
  runStatementEmail,
  statementCommunicationId,
  type StatementClaim,
  type StatementContext,
  type StatementEmailEvent,
} from '../../../apps/hoa/src/lib/resident-notify/statement-run'
import {
  loadStatementRecipientPreview,
  supabaseStatementEmailStore,
} from '../../../apps/hoa/src/lib/resident-notify/statement-store'
import { adminDb, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const HOUR = 3_600_000

interface Seed {
  org: OrgFixture
  board: TestUser
  propertyId: string
  unitId: string
}

/** An org, a board member, and a unit bridged to a hoa_properties row. */
async function seed(): Promise<Seed> {
  const db = adminDb()
  const org = await makeOrg()
  const board = await mintUser(org, 'board')
  const unitId = await makeUnit(org)
  const { data: prop, error } = await db
    .from('hoa_properties')
    .insert({ org_id: org.orgId, address: `${unitId.slice(0, 8)} Test Lane` })
    .select('id')
    .single()
  if (error || !prop) throw new Error(`seed: hoa_properties insert failed: ${error?.message}`)
  const { error: linkErr } = await db.from('units').update({ legacy_hoa_property_id: prop.id }).eq('id', unitId)
  if (linkErr) throw new Error(`seed: unit bridge failed: ${linkErr.message}`)
  return { org, board, propertyId: prop.id, unitId }
}

async function addOwner(
  s: Seed,
  o: { email: string | null; name?: string; validTo?: string | null; unitId?: string },
): Promise<TestUser> {
  const user = await mintUser(s.org, 'resident')
  const { error } = await adminDb()
    .from('ownerships')
    .insert({
      organization_id: s.org.orgId,
      unit_id: o.unitId ?? s.unitId,
      owner_user_id: user.id,
      owner_name: o.name ?? 'Test Owner',
      owner_email: o.email,
      valid_from: '2020-01-01',
      valid_to: o.validTo ?? null,
    })
  if (error) throw new Error(`addOwner: ownerships insert failed: ${error.message}`)
  return user
}

function claimInput(s: Seed, id: string, over: Partial<StatementClaim> = {}): StatementClaim {
  return {
    id,
    organizationId: s.org.orgId,
    associationId: s.org.associationId,
    subject: 'Your account statement',
    html: '<p>Statement</p>',
    text: 'Statement',
    propertyId: s.propertyId,
    unitId: s.unitId,
    from: '2026-01-01',
    to: '2026-10-30',
    recipientCount: 1,
    ...over,
  }
}

/** A communications row as the claim would write it, with a chosen age and status. */
async function seedStatementRow(
  s: Seed,
  o: { unitId: string; status: string; ageHours: number; type?: string },
): Promise<void> {
  const { error } = await adminDb()
    .from('communications')
    .insert({
      organization_id: s.org.orgId,
      association_id: s.org.associationId,
      category: 'dues',
      subject: 'Your account statement',
      body_html: '<p>x</p>',
      channels: ['email'],
      audience_definition: { kind: 'unit_owners', unit_id: o.unitId },
      status: o.status,
      source: 'workflow',
      related_resource: { type: o.type ?? STATEMENT_RESOURCE_TYPE, id: s.propertyId, unit_id: o.unitId },
      created_at: new Date(Date.now() - o.ageHours * HOUR).toISOString(),
    })
  if (error) throw new Error(`seedStatementRow failed: ${error.message}`)
}

const since24h = () => new Date(Date.now() - 24 * HOUR).toISOString()

describe('statement email store against the real schema', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  describe('recentStatement', () => {
    it('finds a live statement from the last 24 hours for the same unit', async () => {
      const s = await seed()
      await seedStatementRow(s, { unitId: s.unitId, status: 'sent', ageHours: 2 })
      const store = supabaseStatementEmailStore(s.board.client)
      expect(await store.recentStatement(s.unitId, since24h())).toBe(true)
    })

    it('also counts one still being sent', async () => {
      const s = await seed()
      await seedStatementRow(s, { unitId: s.unitId, status: 'sending', ageHours: 0 })
      const store = supabaseStatementEmailStore(s.board.client)
      expect(await store.recentStatement(s.unitId, since24h())).toBe(true)
    })

    it('ignores failed and cancelled statements', async () => {
      const s = await seed()
      await seedStatementRow(s, { unitId: s.unitId, status: 'failed', ageHours: 1 })
      await seedStatementRow(s, { unitId: s.unitId, status: 'cancelled', ageHours: 1 })
      const store = supabaseStatementEmailStore(s.board.client)
      expect(await store.recentStatement(s.unitId, since24h())).toBe(false)
    })

    it('ignores another unit, an older statement and other kinds of communication', async () => {
      const s = await seed()
      const otherUnit = await makeUnit(s.org)
      await seedStatementRow(s, { unitId: otherUnit, status: 'sent', ageHours: 1 })
      await seedStatementRow(s, { unitId: s.unitId, status: 'sent', ageHours: 30 })
      await seedStatementRow(s, { unitId: s.unitId, status: 'sent', ageHours: 1, type: 'payment_receipt' })
      const store = supabaseStatementEmailStore(s.board.client)
      expect(await store.recentStatement(s.unitId, since24h())).toBe(false)
      expect(await store.recentStatement(otherUnit, since24h())).toBe(true)
    })
  })

  describe('claim', () => {
    it('inserts with the real columns and constraints, ids only in the audience', async () => {
      const s = await seed()
      const store = supabaseStatementEmailStore(s.board.client)
      const id = statementCommunicationId(s.unitId, new Date())

      expect(await store.claim(claimInput(s, id, { recipientCount: 2 }))).toEqual({ ok: true })

      const { data } = await adminDb().from('communications').select('*').eq('id', id).single()
      expect(data).toMatchObject({
        organization_id: s.org.orgId,
        association_id: s.org.associationId,
        category: 'dues',
        channels: ['email'],
        status: 'sending',
        source: 'workflow',
        audience_summary: 'Account statement: 2 owners',
        related_resource: { type: STATEMENT_RESOURCE_TYPE, id: s.propertyId, unit_id: s.unitId, from: '2026-01-01', to: '2026-10-30' },
      })
      expect(data?.audience_definition).toMatchObject({ kind: 'unit_owners', unit_id: s.unitId })
    })

    it('a second claim with the same deterministic id is reported as exists, not double-inserted', async () => {
      const s = await seed()
      const store = supabaseStatementEmailStore(s.board.client)
      const now = new Date()
      const id = statementCommunicationId(s.unitId, now)

      expect(await store.claim(claimInput(s, id))).toEqual({ ok: true })
      expect(await store.claim(claimInput(s, id))).toEqual({ ok: false, reason: 'exists' })

      const { data } = await adminDb().from('communications').select('id').eq('id', id)
      expect(data ?? []).toHaveLength(1)
    })

    it('a different unit gets its own claim', async () => {
      const s = await seed()
      const otherUnit = await makeUnit(s.org)
      const store = supabaseStatementEmailStore(s.board.client)
      const now = new Date()
      expect(await store.claim(claimInput(s, statementCommunicationId(s.unitId, now)))).toEqual({ ok: true })
      expect(
        await store.claim(claimInput(s, statementCommunicationId(otherUnit, now), { unitId: otherUnit })),
      ).toEqual({ ok: true })
    })
  })

  describe('audit', () => {
    it('writes statement.emailed with the real audit_log columns, ids and counts only', async () => {
      const s = await seed()
      const store = supabaseStatementEmailStore(s.board.client)
      const communicationId = statementCommunicationId(s.unitId, new Date())

      await store.audit({
        organizationId: s.org.orgId,
        actorUserId: s.board.id,
        actorRole: 'board',
        propertyId: s.propertyId,
        communicationId,
        outcome: 'suppressed',
        recipients: 2,
      })

      const { data } = await adminDb().from('audit_log').select('*').eq('action', STATEMENT_AUDIT_ACTION)
      expect(data ?? []).toHaveLength(1)
      expect(data?.[0]).toMatchObject({
        org_id: s.org.orgId,
        user_id: s.board.id,
        entity_type: 'property',
        entity_id: s.propertyId,
        metadata: { actor_role: 'board', communication_id: communicationId, outcome: 'suppressed', recipients: 2 },
      })
    })
  })

  describe('recipients', () => {
    it("come from the unit's current ownerships only", async () => {
      const s = await seed()
      const otherUnit = await makeUnit(s.org)
      await addOwner(s, { email: 'jane@example.test' })
      await addOwner(s, { email: 'former@example.test', validTo: '2023-06-30' })
      await addOwner(s, { email: 'elsewhere@example.test', unitId: otherUnit })
      await addOwner(s, { email: null })

      const masked = await loadStatementRecipientPreview(s.board.client, s.org.orgId, s.propertyId)
      expect(masked).toEqual(['j***@example.test'])
    })

    it('emailOptIn reads the real preferences table: false only when the owner opted out', async () => {
      const s = await seed()
      const optedOut = await addOwner(s, { email: 'out@example.test' })
      const optedIn = await addOwner(s, { email: 'in@example.test' })
      const noRow = await addOwner(s, { email: 'norow@example.test' })
      const { error } = await adminDb()
        .from('resident_communication_preferences')
        .insert([
          { organization_id: s.org.orgId, user_id: optedOut.id, email_opt_in: false },
          { organization_id: s.org.orgId, user_id: optedIn.id, email_opt_in: true },
        ])
      expect(error).toBeNull()

      const store = supabaseStatementEmailStore(s.board.client)
      expect(await store.emailOptIn(s.org.orgId, optedOut.id)).toBe(false)
      expect(await store.emailOptIn(s.org.orgId, optedIn.id)).toBe(true)
      // The table's default is email on, so no row means yes.
      expect(await store.emailOptIn(s.org.orgId, noRow.id)).toBe(true)
    })
  })

  describe('runStatementEmail end to end with a blocked sender', () => {
    it('suppresses the opted-in owner, skips the opted-out one, audits, and dedupes a second click', async () => {
      const s = await seed()
      const optedIn = await addOwner(s, { email: 'in@example.test', name: 'In Owner' })
      const optedOut = await addOwner(s, { email: 'out@example.test', name: 'Out Owner' })
      await adminDb()
        .from('resident_communication_preferences')
        .insert({ organization_id: s.org.orgId, user_id: optedOut.id, email_opt_in: false })

      // Owners as the store's own query sees them (current ownerships).
      const { data: ownerRows } = await adminDb()
        .from('ownerships')
        .select('owner_user_id, owner_name, owner_email')
        .eq('unit_id', s.unitId)
        .is('valid_to', null)
      const ctx: StatementContext = {
        association: { id: s.org.associationId, name: 'Test Association', type: 'hoa', organizationId: s.org.orgId },
        unitId: s.unitId,
        home: '1 · Test Lane',
        statementDate: '2026-10-30',
        period: 'Jan 1, 2026 – Oct 30, 2026',
        openingBalance: 0,
        charges: 300,
        paymentsAndCredits: 100,
        closingBalance: 200,
        lines: [],
        owners: (ownerRows ?? []).map((r) => ({ userId: r.owner_user_id, name: r.owner_name, email: r.owner_email })),
      }
      const store = { ...supabaseStatementEmailStore(s.board.client), loadContext: async () => ctx }
      const sendEmail = vi.fn(async (_input: { to: string }, _opts: unknown) => ({
        ok: false as const,
        error: OUTBOUND_BLOCKED_ERROR,
      }))
      const deps = { sendEmail, emailConfigured: () => true, portalUrl: (p: string) => `https://app.example.test${p}` }
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      const event: StatementEmailEvent = {
        propertyId: s.propertyId,
        from: '2026-01-01',
        to: '2026-10-30',
        actorUserId: s.board.id,
        actorRole: 'board',
        organizationId: s.org.orgId,
      }

      const first = await runStatementEmail(store, deps, event, logger)
      expect(logger.error).not.toHaveBeenCalled()
      expect(first).toMatchObject({ status: 'held', sent: 0, failed: 0, held: 1, optedOut: 1 })
      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'in@example.test' })

      const { data: recips } = await adminDb()
        .from('communication_recipients')
        .select('user_id, delivery_status, channel')
        .eq('communication_id', first.communicationId as string)
      expect(recips).toEqual([{ user_id: optedIn.id, delivery_status: 'suppressed', channel: 'email' }])

      const { data: audits } = await adminDb().from('audit_log').select('metadata').eq('action', STATEMENT_AUDIT_ACTION)
      expect(audits).toHaveLength(1)
      expect(audits?.[0]?.metadata).toMatchObject({ outcome: 'suppressed', recipients: 1 })
      expect(JSON.stringify(audits)).not.toContain('example.test')

      const second = await runStatementEmail(store, deps, event, logger)
      expect(second.status).toBe('duplicate')
      expect(sendEmail).toHaveBeenCalledTimes(1)
      const { data: comms } = await adminDb().from('communications').select('id').eq('organization_id', s.org.orgId)
      expect(comms ?? []).toHaveLength(1)
    })
  })
})
