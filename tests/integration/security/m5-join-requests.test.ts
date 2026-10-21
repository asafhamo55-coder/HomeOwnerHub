/**
 * Migration 0069 part 3 (migrations/0069_m5_batch.sql, batch M5, BL-143
 * accept-to-join and self-claim) against real Postgres. CI only (no local
 * database).
 *
 *   - owner_join_claim answers 'sent' for an address whether or not it
 *     matched a home, and the asker can never read a request row, so a
 *     non-member learns nothing about which addresses exist;
 *   - address matching ignores case, punctuation and "Street"/"St", needs
 *     the ZIP, and files nothing when two homes share the address and no
 *     unit is given;
 *   - 5 claims a rolling day, then 'rate_limited' (not recorded);
 *   - a board code works once, and not when expired or revoked; codes are
 *     board-only, store only a hash, and created_by is the caller;
 *   - requests are board-readable only and written by nobody through
 *     PostgREST; attempts are readable by nobody;
 *   - owner_join_decide: only the request org's board/admin (42501);
 *     approve makes the asker a resident and links the home (the on-file
 *     ownership under their email, else a new one), audited; reject needs
 *     a reason (22023); a second decision is 'already_decided';
 *   - anon can call none of the functions.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only;
 * no PII. The tables are not in the generated Database types until
 * gen:types runs after prod has 0069 (CLAUDE.md footgun 3), hence the casts.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'
import { decideJoinRequest, loadPendingJoins, type JoinDb } from '../../../apps/hoa/src/lib/owner-join/board'
import { normaliseCode } from '../../../apps/hoa/src/lib/owner-join/model'

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let resident: TestUser
let otherBoard: TestUser
/** Signed in, member of no HOA (SEC-N4). */
let stranger: TestUser
let home: string

const requests = 'owner_join_requests' as never
const codes = 'owner_join_codes' as never
const attempts = 'owner_join_attempts' as never

type RpcResult = { data: unknown; error: { code?: string } | null }
const rpc = (u: TestUser, fn: string, args: Record<string, unknown> = {}) =>
  u.client.rpc(fn as never, args as never) as unknown as Promise<RpcResult>

const claimAddress = (u: TestUser, address: string, zip: string, unit?: string) =>
  rpc(u, 'owner_join_claim', { p_address: address, p_postal_code: zip, p_unit: unit ?? null })
const claimCode = (u: TestUser, code: string) => rpc(u, 'owner_join_claim', { p_code: code })

async function makeHome(f: OrgFixture, address: string, zip: string, unit: string | null = null): Promise<string> {
  const { data, error } = await adminDb()
    .from('units')
    .insert({ organization_id: f.orgId, association_id: f.associationId, address_line1: address, postal_code: zip, unit_number: unit })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed unit: ${error?.code ?? 'no row'}`)
  return data.id
}

async function pendingFor(userId: string) {
  const { data } = await adminDb().from(requests).select('id, unit_id, status, method').eq('requester_id' as never, userId)
  return (data ?? []) as unknown as Array<{ id: string; unit_id: string; status: string; method: string }>
}

const hash = (code: string) => createHash('sha256').update(normaliseCode(code)).digest('hex')
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

/** A fresh 10-character code (no look-alike symbols needed for the database). */
const newCode = () => randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
  stranger = await mintUser(other, 'resident')
  await adminDb().from('org_members').delete().eq('org_id', other.orgId).eq('user_id', stranger.id)
  home = await makeHome(org, '12 Oak Street', '30301')
})

describe('0069 part 3: claims (BL-143)', () => {
  it('answers "sent" for an address whether or not it matched; only the match is filed, and the asker cannot see it', async () => {
    const hit = await claimAddress(stranger, '12 oak st.', '30301-4455')
    const miss = await claimAddress(stranger, '99 Nowhere Road', '30301')
    expect(hit).toEqual({ data: 'sent', error: null })
    expect(miss).toEqual(hit)

    const filed = await pendingFor(stranger.id)
    expect(filed).toEqual([{ id: expect.any(String), unit_id: home, status: 'pending', method: 'address' }])

    const seen = await stranger.client.from(requests).select('id')
    expect(seen.data ?? []).toHaveLength(0)
    const tries = await stranger.client.from(attempts).select('id')
    expect(tries.data ?? []).toHaveLength(0)

    // The asker's own status is counts only.
    const { data: status } = await rpc(stranger, 'owner_join_my_status')
    expect((status as Array<Record<string, unknown>>)[0]).toMatchObject({ attempts_today: 2, daily_limit: 5 })
  })

  it('needs the right ZIP, and files nothing when two homes share an address and no unit is given', async () => {
    await claimAddress(stranger, '12 Oak Street', '30302')
    expect(await pendingFor(stranger.id)).toHaveLength(0)

    const a = await makeHome(org, '400 Peachtree Avenue', '30308', '4B')
    await makeHome(org, '400 Peachtree Avenue', '30308', '5C')
    expect((await claimAddress(stranger, '400 Peachtree Ave', '30308')).data).toBe('sent')
    expect(await pendingFor(stranger.id)).toHaveLength(0)
    expect((await claimAddress(stranger, '400 Peachtree Ave', '30308', 'Apt #4b')).data).toBe('sent')
    expect((await pendingFor(stranger.id)).map((r) => r.unit_id)).toEqual([a])
  })

  it('a repeat claim for the same home keeps one pending request', async () => {
    await claimAddress(resident, '12 Oak Street', '30301')
    await claimAddress(resident, '12 OAK STREET', '30301')
    expect(await pendingFor(resident.id)).toHaveLength(1)
  })

  it('allows 5 claims a rolling day, then refuses without recording', async () => {
    for (let i = 0; i < 5; i++) expect((await claimAddress(stranger, `${i} Elm Street`, '30301')).data).toBe('sent')
    expect((await claimAddress(stranger, '12 Oak Street', '30301')).data).toBe('rate_limited')
    expect(await pendingFor(stranger.id)).toHaveLength(0)
    const { count } = await adminDb().from(attempts).select('id', { count: 'exact', head: true }).eq('requester_id' as never, stranger.id)
    expect(count).toBe(5)
  })

  it('refuses input that is not a claim, without recording it', async () => {
    expect((await claimAddress(stranger, '', '30301')).data).toBe('invalid')
    expect((await claimAddress(stranger, '12 Oak Street', '303')).data).toBe('invalid')
    expect((await claimCode(stranger, 'SHORT')).data).toBe('invalid')
    const { count } = await adminDb().from(attempts).select('id', { count: 'exact', head: true })
    expect(count).toBe(0)
  })
})

describe('0069 part 3: board codes (BL-143)', () => {
  it('a code works once; expired and revoked codes do not; the board sets nothing but revoke/expiry', async () => {
    const code = newCode()
    const ins = await board.client
      .from(codes)
      .insert({ organization_id: org.orgId, unit_id: home, code_hash: hash(code), expires_at: inDays(30), created_by: resident.id, used_at: new Date().toISOString() } as never)
      .select('id, created_by, used_at')
      .single()
    expect(ins.error).toBeNull()
    expect(ins.data).toMatchObject({ created_by: board.id, used_at: null })

    expect((await claimCode(stranger, code.toLowerCase())).data).toBe('sent')
    expect(await pendingFor(stranger.id)).toEqual([{ id: expect.any(String), unit_id: home, status: 'pending', method: 'code' }])
    const again = await mintUser(org, 'resident')
    expect((await claimCode(again, code)).data).toBe('invalid_code')

    // Revoked.
    const revoked = newCode()
    const r = await board.client
      .from(codes)
      .insert({ organization_id: org.orgId, unit_id: home, code_hash: hash(revoked), expires_at: inDays(30) } as never)
      .select('id')
      .single()
    const rid = (r.data as unknown as { id: string }).id
    // The board may revoke, but not re-point the code or forge its use.
    const otherHome = await makeHome(org, '14 Oak Street', '30301')
    await board.client.from(codes).update({ revoked_at: new Date().toISOString(), unit_id: otherHome, used_by: resident.id } as never).eq('id' as never, rid)
    const { data: after } = await adminDb().from(codes).select('unit_id, used_by, revoked_at').eq('id' as never, rid).single()
    expect(after).toMatchObject({ unit_id: home, used_by: null })
    expect((after as unknown as { revoked_at: string | null }).revoked_at).not.toBeNull()
    expect((await claimCode(stranger, revoked)).data).toBe('invalid_code')

    // Expired (seeded by the service role with a past expiry).
    const expired = newCode()
    const old = new Date(Date.now() - 40 * 86_400_000)
    await adminDb()
      .from(codes)
      .insert({ organization_id: org.orgId, unit_id: home, code_hash: hash(expired), created_at: old.toISOString(), expires_at: new Date(old.getTime() + 30 * 86_400_000).toISOString() } as never)
    expect((await claimCode(stranger, expired)).data).toBe('invalid_code')
  })

  it('codes are board-only, and only for the board’s own homes (42501 / 23503)', async () => {
    const row = { organization_id: org.orgId, unit_id: home, code_hash: hash(newCode()), expires_at: inDays(30) }
    expect((await resident.client.from(codes).insert(row as never)).error?.code).toBe('42501')
    expect((await otherBoard.client.from(codes).insert(row as never)).error?.code).toBe('42501')
    const theirHome = await makeHome(other, '1 Pine Lane', '31201')
    const foreign = await adminDb().from(codes).insert({ ...row, unit_id: theirHome, code_hash: hash(newCode()) } as never)
    expect(foreign.error?.code).toBe('23503')
    await board.client.from(codes).insert(row as never)
    expect((await resident.client.from(codes).select('id')).data ?? []).toHaveLength(0)
    expect((await otherBoard.client.from(codes).select('id')).data ?? []).toHaveLength(0)
    expect((await board.client.from(codes).select('id')).data ?? []).toHaveLength(1)
    // CHECKs: a hash is 64 hex characters; at most 90 days.
    expect((await adminDb().from(codes).insert({ ...row, code_hash: 'plain' } as never)).error?.code).toBe('23514')
    expect((await adminDb().from(codes).insert({ ...row, code_hash: hash(newCode()), expires_at: inDays(91) } as never)).error?.code).toBe('23514')
  })
})

describe('0069 part 3: requests and decisions (BL-143)', () => {
  it('requests are board-readable only, and nobody writes them through PostgREST', async () => {
    await claimAddress(stranger, '12 Oak Street', '30301')
    const [req] = await pendingFor(stranger.id)
    expect((await board.client.from(requests).select('id')).data).toEqual([{ id: req!.id }])
    expect((await resident.client.from(requests).select('id')).data ?? []).toHaveLength(0)
    expect((await otherBoard.client.from(requests).select('id')).data ?? []).toHaveLength(0)

    const forged = { organization_id: org.orgId, unit_id: home, requester_id: resident.id, method: 'address' }
    expect((await resident.client.from(requests).insert(forged as never)).error?.code).toBe('42501')
    expect((await board.client.from(requests).insert(forged as never)).error?.code).toBe('42501')
    const upd = await board.client.from(requests).update({ status: 'approved', decided_at: new Date().toISOString() } as never).eq('id' as never, req!.id).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const del = await board.client.from(requests).delete().eq('id' as never, req!.id).select('id')
    expect(del.data ?? []).toHaveLength(0)
    expect((await pendingFor(stranger.id))[0]!.status).toBe('pending')
  })

  it('only the request org’s board/admin decides (42501, also for a request id that does not exist)', async () => {
    await claimAddress(stranger, '12 Oak Street', '30301')
    const [req] = await pendingFor(stranger.id)
    for (const u of [resident, otherBoard, stranger]) {
      const r = await rpc(u, 'owner_join_decide', { p_request_id: req!.id, p_approve: true })
      expect(r.error?.code).toBe('42501')
    }
    expect((await rpc(board, 'owner_join_decide', { p_request_id: randomUUID(), p_approve: true })).error?.code).toBe('42501')
    expect((await pendingFor(stranger.id))[0]!.status).toBe('pending')
  })

  it('approve makes the asker a resident and links the on-file ownership under their email; audited; then already decided', async () => {
    const { data: own } = await adminDb()
      .from('ownerships')
      .insert({ organization_id: org.orgId, unit_id: home, owner_email: stranger.email.toUpperCase(), valid_from: '2024-01-01' })
      .select('id')
      .single()
    await claimAddress(stranger, '12 Oak Street', '30301')
    const [req] = await pendingFor(stranger.id)

    // Through the app's own decision code, on the board's client.
    const r = await decideJoinRequest(board.client as unknown as JoinDb, { requestId: req!.id, approve: true }, true)
    expect(r.ok).toBe(true)

    const { data: member } = await adminDb().from('org_members').select('role').eq('org_id', org.orgId).eq('user_id', stranger.id).single()
    expect(member).toEqual({ role: 'resident' })
    const { data: linked } = await adminDb().from('ownerships').select('id, owner_user_id').eq('unit_id', home)
    expect(linked).toEqual([{ id: own!.id, owner_user_id: stranger.id }])
    expect((await pendingFor(stranger.id))[0]!.status).toBe('approved')

    // The home is now theirs: units RLS (id in auth_resident_unit_ids()).
    const mine = await stranger.client.from('units').select('id')
    expect((mine.data ?? []).map((u) => u.id)).toEqual([home])

    const { data: audit } = await adminDb().from('audit_log').select('action, entity_id, metadata').eq('action', 'members.join_approved')
    expect(audit).toEqual([{ action: 'members.join_approved', entity_id: req!.id, metadata: { unit_id: home, method: 'address', link: 'linked' } }])

    expect((await rpc(board, 'owner_join_decide', { p_request_id: req!.id, p_approve: false, p_note: 'x' })).data).toBe('already_decided')
  })

  it('approve opens an ownership when none is on file, and keeps an existing board role', async () => {
    const code = newCode()
    await adminDb().from(codes).insert({ organization_id: org.orgId, unit_id: home, code_hash: hash(code), expires_at: inDays(30) } as never)
    expect((await claimCode(board, code)).data).toBe('sent')
    const [req] = await pendingFor(board.id)
    expect((await rpc(board, 'owner_join_decide', { p_request_id: req!.id, p_approve: true })).data).toBe('approved')
    const { data: member } = await adminDb().from('org_members').select('role').eq('org_id', org.orgId).eq('user_id', board.id).single()
    expect(member).toEqual({ role: 'board' })
    const { data: opened } = await adminDb().from('ownerships').select('owner_user_id, source, valid_to').eq('unit_id', home)
    expect(opened).toEqual([{ owner_user_id: board.id, source: 'join_request', valid_to: null }])
  })

  it('reject needs a reason (22023), links nothing, and is audited', async () => {
    await claimAddress(stranger, '12 Oak Street', '30301')
    const [req] = await pendingFor(stranger.id)
    expect((await rpc(board, 'owner_join_decide', { p_request_id: req!.id, p_approve: false, p_note: '  ' })).error?.code).toBe('22023')
    expect((await rpc(board, 'owner_join_decide', { p_request_id: req!.id, p_approve: false, p_note: 'Not on file' })).data).toBe('rejected')
    expect((await pendingFor(stranger.id))[0]!.status).toBe('rejected')
    const { data: member } = await adminDb().from('org_members').select('role').eq('org_id', org.orgId).eq('user_id', stranger.id)
    expect(member ?? []).toHaveLength(0)
    const { count } = await adminDb().from('ownerships').select('id', { count: 'exact', head: true }).eq('unit_id', home)
    expect(count).toBe(0)
    const { count: audits } = await adminDb().from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'members.join_rejected')
    expect(audits).toBe(1)
  })

  it('the /approvals loader reads the section through the board’s own client', async () => {
    await adminDb().from('ownerships').insert({ organization_id: org.orgId, unit_id: home, owner_email: stranger.email, valid_from: '2024-01-01' })
    await claimAddress(stranger, '12 Oak Street', '30301')
    const loaded = await loadPendingJoins(board.client as unknown as JoinDb, org.orgId, 50, true)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.total).toBe(1)
    expect(loaded.items[0]!.card).toMatchObject({ home: '12 Oak Street', method: 'address', emailCheck: 'match' })
    const asResident = await loadPendingJoins(resident.client as unknown as JoinDb, org.orgId, 50, true)
    expect(asResident).toEqual({ ok: true, items: [], total: 0 })
  })

  it('anon can call none of the functions', async () => {
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    for (const [fn, args] of [
      ['owner_join_claim', { p_address: '12 Oak Street', p_postal_code: '30301' }],
      ['owner_join_my_status', {}],
      ['owner_join_decide', { p_request_id: randomUUID(), p_approve: true }],
    ] as const) {
      const { error } = await anon.rpc(fn as never, args as never)
      expect(error, fn).not.toBeNull()
    }
    const { count } = await adminDb().from(attempts).select('id', { count: 'exact', head: true })
    expect(count).toBe(0)
  })
})
