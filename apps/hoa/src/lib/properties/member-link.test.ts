import { describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'
import { exactIlike } from '@/lib/impersonation-target'
import { linkOwnershipForMember } from './lot'

// "Invite to portal" for a recorded sale's buyer links the buyer's sale
// ownership (keeping its settlement-date valid_from) instead of opening a
// second row dated the invite day. Synthetic ids and addresses.

vi.spyOn(console, 'error').mockImplementation(() => {})
const ORG = 'org-1'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never
const link = (m: ReturnType<typeof memorySupabase>, email = 'Buyer1@Example.test') =>
  linkOwnershipForMember(db(m), {
    orgId: ORG,
    unitId: 'u1',
    userId: 'buyer-user',
    email,
    escapedEmail: exactIlike(email),
    fullName: 'Buyer One',
    today: '2026-10-20',
  })

const saleRow = (over: Record<string, unknown> = {}) => ({
  id: 'o-sale',
  organization_id: ORG,
  unit_id: 'u1',
  owner_user_id: null,
  owner_email: 'buyer1@example.test',
  valid_from: '2026-10-15',
  valid_to: null,
  source: 'sale',
  ...over,
})

describe('linkOwnershipForMember', () => {
  it('links the buyer’s sale ownership; no second row, valid_from kept', async () => {
    const m = memorySupabase({ ownerships: [saleRow()] })
    expect(await link(m)).toEqual({ ok: true, data: { outcome: 'linked' } })
    const rows = m.rows('ownerships')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ owner_user_id: 'buyer-user', valid_from: '2026-10-15', source: 'sale' })
  })

  it('already linked → nothing written', async () => {
    const m = memorySupabase({ ownerships: [saleRow({ owner_user_id: 'buyer-user' })] })
    expect(await link(m)).toEqual({ ok: true, data: { outcome: 'existing' } })
    expect(m.calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('never takes over a closed ownership, another account’s, or another org’s', async () => {
    const m = memorySupabase({
      ownerships: [
        saleRow({ id: 'closed', valid_to: '2026-10-15' }),
        saleRow({ id: 'theirs', owner_user_id: 'someone-else' }),
        saleRow({ id: 'foreign', organization_id: 'org-2' }),
      ],
    })
    expect(await link(m)).toEqual({ ok: true, data: { outcome: 'opened' } })
    const rows = m.rows('ownerships')
    expect(rows.find((r) => r.id === 'closed')).toMatchObject({ owner_user_id: null })
    expect(rows.find((r) => r.id === 'theirs')).toMatchObject({ owner_user_id: 'someone-else' })
    expect(rows.find((r) => r.id === 'foreign')).toMatchObject({ owner_user_id: null })
    expect(rows.find((r) => r.source === 'member_invite')).toMatchObject({ owner_user_id: 'buyer-user', valid_from: '2026-10-20' })
  })

  it('an email is matched exactly: a wildcard in it matches nobody else', async () => {
    const m = memorySupabase({ ownerships: [saleRow({ owner_email: 'buyerX@example.test' })] })
    expect(await link(m, 'buyer_@example.test')).toEqual({ ok: true, data: { outcome: 'opened' } })
    expect(m.rows('ownerships').find((r) => r.id === 'o-sale')).toMatchObject({ owner_user_id: null })
  })
})
