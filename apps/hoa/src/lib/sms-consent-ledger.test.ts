import { describe, expect, it } from 'vitest'
import { loadTextMessagesState, sha256Hex } from './sms-consent'
import {
  consentGap,
  foldConsentRows,
  loadSmsConsentMap,
  loadUserSmsConsent,
  phoneConsentHash,
  phoneIsConsented,
} from './sms-consent-ledger'
import { fakeSupabase, hasEq } from '@/lib/test-utils/fake-supabase'

// BL-111: consent is tied to the numbers the resident agreed for.

const A = '+14045551234'
const B = '+14045559999'
const grant = (user: string, at: string, phones: string[], id = `g-${user}-${at}`) => ({
  id,
  user_id: user,
  action: 'sms_consent_granted',
  metadata: { phone_sha256: phones.map(sha256Hex) },
  created_at: at,
})
const revoke = (user: string, at: string) => ({ id: `r-${user}-${at}`, user_id: user, action: 'sms_consent_revoked', metadata: {}, created_at: at })

describe('foldConsentRows', () => {
  it('the latest grant replaces the set; order of the input does not matter', () => {
    const map = foldConsentRows([grant('u', '2026-10-10', [B]), grant('u', '2026-10-01', [A])])
    expect([...map.get('u')!]).toEqual([sha256Hex(B)])
  })

  it('a later revoke clears consent; a grant after it restores', () => {
    expect(foldConsentRows([grant('u', '2026-10-01', [A]), revoke('u', '2026-10-02')]).has('u')).toBe(false)
    const back = foldConsentRows([grant('u', '2026-10-01', [A]), revoke('u', '2026-10-02'), grant('u', '2026-10-03', [A])])
    expect(back.get('u')!.has(sha256Hex(A))).toBe(true)
  })

  it('ignores malformed hashes and rows with no user', () => {
    const map = foldConsentRows([
      { id: 'x', user_id: 'u', action: 'sms_consent_granted', metadata: { phone_sha256: ['not-a-hash', 7] }, created_at: '2026-10-01' },
      { id: 'y', user_id: null, action: 'sms_consent_granted', metadata: { phone_sha256: [sha256Hex(A)] }, created_at: '2026-10-01' },
    ])
    expect(map.size).toBe(0)
  })
})

describe('phone matching', () => {
  const set = new Set([sha256Hex(A)])
  it('matches any formatting of the same US number', () => {
    for (const raw of [A, '4045551234', '1-404-555-1234', '(404) 555-1234']) expect(phoneIsConsented(set, raw)).toBe(true)
  })
  it('a different number, a non-US number, or no consent never matches', () => {
    expect(phoneIsConsented(set, B)).toBe(false)
    expect(phoneIsConsented(set, '+44 20 7946 0958')).toBe(false)
    expect(phoneIsConsented(undefined, A)).toBe(false)
    expect(phoneIsConsented(new Set(), A)).toBe(false)
    expect(phoneConsentHash('12')).toBeNull()
  })
})

describe('consentGap (the account panel)', () => {
  it('none when every current number is covered', () => {
    expect(consentGap([A], new Set([sha256Hex(A), sha256Hex(B)]))).toBe('none')
  })
  it('number_changed when a grant exists but not for the current number', () => {
    expect(consentGap([B], new Set([sha256Hex(A)]))).toBe('number_changed')
  })
  it('no_record for a texts-on resident with no grant at all (pre-BL-110)', () => {
    expect(consentGap([A], new Set())).toBe('no_record')
  })
})

describe('loaders', () => {
  it('org map: one filtered read of grant/revoke rows', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [grant('u', '2026-10-01', [A])], error: null }))
    const res = await loadSmsConsentMap(client as never, 'org-1')
    expect(res.ok && res.map.get('u')!.has(sha256Hex(A))).toBe(true)
    expect(queries).toHaveLength(1)
    expect(hasEq(queries[0], 'org_id', 'org-1')).toBe(true)
  })

  it('user read is scoped to org and user; a read error is ok:false', async () => {
    const ok = fakeSupabase(() => ({ data: [grant('u', '2026-10-01', [A])], error: null }))
    const res = await loadUserSmsConsent(ok.client as never, 'org-1', 'u')
    expect(res.ok && res.phones.has(sha256Hex(A))).toBe(true)
    expect(hasEq(ok.queries[0], 'org_id', 'org-1') && hasEq(ok.queries[0], 'user_id', 'u')).toBe(true)
    const bad = fakeSupabase(() => ({ data: null, error: { code: 'XX' } }))
    expect(await loadUserSmsConsent(bad.client as never, 'org-1', 'u')).toEqual({ ok: false })
  })
})

describe('loadTextMessagesState: consentGap for the account panel', () => {
  const ORG = { id: 'org-1', name: 'Maple Grove HOA' }
  function clients(ownerPhone: string, optIn: boolean, grants: unknown[]) {
    const own = fakeSupabase((q) => {
      if (q.table === 'resident_communication_preferences')
        return { data: { organization_id: 'org-1', sms_opt_in: optIn, updated_at: '2026-10-01T00:00:00Z' }, error: null }
      if (q.table === 'ownerships') return { data: [{ owner_phone: ownerPhone }], error: null }
      return { data: [], error: null }
    })
    const admin = fakeSupabase((q) => (q.table === 'audit_log' ? { data: grants, error: null } : undefined))
    return { own: own.client as never, admin: admin.client as never, adminQueries: admin.queries }
  }

  it('number changed since consent', async () => {
    const c = clients(B, true, [grant('u', '2026-10-01', [A])])
    const state = await loadTextMessagesState(c.own, ORG, 'u', c.admin)
    expect(state !== 'failed' && state.consentGap).toBe('number_changed')
    expect(hasEq(c.adminQueries[0], 'user_id', 'u') && hasEq(c.adminQueries[0], 'org_id', 'org-1')).toBe(true)
  })

  it('covered number → none; legacy opt-in → no_record; texts off → none without reading audit', async () => {
    const gap = async (c: ReturnType<typeof clients>) =>
      ((await loadTextMessagesState(c.own, ORG, 'u', c.admin)) as { consentGap: string }).consentGap
    expect(await gap(clients(A, true, [grant('u', '2026-10-01', [A])]))).toBe('none')
    expect(await gap(clients(A, true, []))).toBe('no_record')
    const off = clients(A, false, [])
    expect(await gap(off)).toBe('none')
    expect(off.adminQueries).toHaveLength(0)
  })
})
