/**
 * BL-175b H5 (0070): platform-wide tables cannot be written by the board or
 * admin of any org. CI only (no local database).
 *
 * 0012:222-257 let the board/admin of ANY org (including a self-made one)
 * insert, update and delete state_law_updates, which every org reads.
 * 0070 drops those policies: only the service role or a platform admin
 * writes. state_statutes (+ chunks, changes) have no write policy, and the
 * global communication_templates rows (organization_id IS NULL) are
 * read-only to every org.
 *
 * Nothing is asserted by absence of an error alone: each denial is checked by
 * reading the row back as the service role.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { psqlExec } from '../fixtures/psql'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let admin: TestUser
let updateId: string
let statuteId: string
let templateId: string

async function seed(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(table as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${table}: ${error?.code ?? 'no row'} ${error?.message ?? ''}`)
  return (data as { id: string }).id
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  updateId = await seed('state_law_updates', { state: 'GA', headline: 'Original headline', summary: 'Original summary text for the update.' })
  statuteId = await seed('state_statutes', {
    state: 'GA',
    code_citation: `TEST-${randomUUID().slice(0, 6)}`,
    title: 'Original',
    body: 'Original body.',
    category: 'general',
  })
  templateId = await seed('communication_templates', {
    organization_id: null,
    name: `Global ${randomUUID().slice(0, 6)}`,
    category: 'announcement',
    subject: 'Global',
    body_html: '<p>global</p>',
  })
})

describe('0070 H5: state_law_updates', () => {
  for (const role of ['board', 'admin'] as const) {
    it(`${role} of an org cannot insert, update or delete`, async () => {
      const user = role === 'board' ? board : admin
      const ins = await user.client
        .from('state_law_updates' as never)
        .insert({ state: 'GA', headline: 'Planted headline', summary: 'Planted summary text for the update.', posted_by: user.id } as never)
      expect(ins.error, 'insert by a non-platform-admin succeeded').not.toBeNull()

      const upd = await user.client.from('state_law_updates' as never).update({ headline: 'Tampered' } as never).eq('id', updateId).select('id')
      expect(upd.data ?? []).toHaveLength(0)

      const del = await user.client.from('state_law_updates' as never).delete().eq('id', updateId).select('id')
      expect(del.data ?? []).toHaveLength(0)

      const { data } = await adminDb().from('state_law_updates' as never).select('headline').eq('id', updateId).single()
      expect((data as unknown as { headline: string }).headline).toBe('Original headline')
      const { data: planted } = await adminDb().from('state_law_updates' as never).select('id').eq('headline', 'Planted headline')
      expect(planted ?? []).toHaveLength(0)
    })
  }

  it('the board can still READ the feed', async () => {
    const { data, error } = await board.client.from('state_law_updates' as never).select('id').eq('id', updateId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
  })

  it('a platform admin can write; revoking them stops it', async () => {
    const { error: grantErr } = await adminDb().from('platform_admins' as never).insert({ user_id: board.id } as never)
    if (grantErr) throw new Error(`grant platform admin: ${grantErr.code}`)
    const ok = await board.client.from('state_law_updates' as never).update({ headline: 'Editorial fix' } as never).eq('id', updateId).select('id')
    expect(ok.error).toBeNull()
    expect(ok.data ?? []).toHaveLength(1)

    psqlExec(`update public.platform_admins set revoked_at = now() where user_id = '${board.id}'`)
    const after = await board.client.from('state_law_updates' as never).update({ headline: 'Again' } as never).eq('id', updateId).select('id')
    expect(after.data ?? []).toHaveLength(0)
    const { data } = await adminDb().from('state_law_updates' as never).select('headline').eq('id', updateId).single()
    expect((data as unknown as { headline: string }).headline).toBe('Editorial fix')
  })

  it('no non-SELECT policy remains on the global tables except the platform-admin one', async () => {
    const { rows } = await catalogPolicies()
    expect(rows).toEqual([{ tablename: 'state_law_updates', policyname: 'state_law_updates_platform_admin_write' }])
  })
})

describe('0070 H5: state_statutes and global templates', () => {
  it('board/admin cannot write state_statutes', async () => {
    for (const user of [board, admin]) {
      const ins = await user.client
        .from('state_statutes' as never)
        .insert({ state: 'GA', code_citation: `X-${randomUUID().slice(0, 6)}`, title: 'Planted', body: 'Planted', category: 'general' } as never)
      expect(ins.error).not.toBeNull()
      const upd = await user.client.from('state_statutes' as never).update({ body: 'Tampered' } as never).eq('id', statuteId).select('id')
      expect(upd.data ?? []).toHaveLength(0)
      const del = await user.client.from('state_statutes' as never).delete().eq('id', statuteId).select('id')
      expect(del.data ?? []).toHaveLength(0)
    }
    const { data } = await adminDb().from('state_statutes' as never).select('body').eq('id', statuteId).single()
    expect((data as unknown as { body: string }).body).toBe('Original body.')
  })

  it('board/admin cannot write a global (organization_id IS NULL) communication template', async () => {
    for (const user of [board, admin]) {
      const ins = await user.client
        .from('communication_templates' as never)
        .insert({ organization_id: null, name: 'Planted', category: 'announcement', subject: 's', body_html: '<p>x</p>' } as never)
      expect(ins.error).not.toBeNull()
      const upd = await user.client.from('communication_templates' as never).update({ subject: 'Tampered' } as never).eq('id', templateId).select('id')
      expect(upd.data ?? []).toHaveLength(0)
      const del = await user.client.from('communication_templates' as never).delete().eq('id', templateId).select('id')
      expect(del.data ?? []).toHaveLength(0)
    }
    const { data } = await adminDb().from('communication_templates' as never).select('subject').eq('id', templateId).single()
    expect((data as unknown as { subject: string }).subject).toBe('Global')
  })
})

async function catalogPolicies() {
  const { psqlRows } = await import('../fixtures/psql')
  const rows = psqlRows<{ tablename: string; policyname: string }>(
    `select tablename, policyname from pg_policies
      where schemaname = 'public'
        and tablename in ('state_law_updates','state_statutes','state_statute_chunks','state_statute_changes')
        and cmd in ('INSERT','UPDATE','DELETE','ALL')
      order by 1, 2`,
  )
  return { rows }
}
