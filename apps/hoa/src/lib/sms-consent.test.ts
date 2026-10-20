import { describe, expect, it, vi } from 'vitest'
import {
  PRIVACY_POLICY_URL,
  SMS_CONSENT_GRANTED,
  SMS_CONSENT_REVOKED,
  disclosureHash,
  formatUsPhone,
  loadMyTextPhones,
  normalizeUsPhone,
  phonesFingerprint,
  setSmsOptIn,
  sha256Hex,
  smsDisclosure,
} from './sms-consent'

// BL-110: resident SMS consent — the disclosure, the evidence row, and
// the order of writes (no grant without evidence; a revoke never blocked).

type Result = { data?: unknown; error: { code?: string } | null }

/** A chainable fake: records every call; `results[table]` answers terminals in order. */
function fakeClient(results: Record<string, Result[]>) {
  const calls: unknown[][] = []
  const next = (table: string): Result => results[table]?.shift() ?? { data: null, error: null }
  const client = {
    from(table: string) {
      calls.push(['from', table])
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'update', 'insert']) {
        b[op] = (...args: unknown[]) => {
          calls.push([op, ...args])
          return b
        }
      }
      b.maybeSingle = async () => next(table)
      b.single = async () => next(table)
      b.then = (resolve: (r: Result) => unknown) => resolve(next(table))
      return b
    },
  }
  return { client: client as never, calls }
}

const NOW = new Date('2026-10-20T15:00:00.000Z')
const ORG = 'org-1'
const ME = 'user-1'

describe('smsDisclosure', () => {
  const text = smsDisclosure('Maple Grove HOA')
  it.each([
    ['names the association', 'Maple Grove HOA'],
    ['names the program', 'HomeownerHub'],
    ['frequency', 'Message frequency varies.'],
    ['rates', 'Msg & data rates may apply.'],
    ['STOP', 'Reply STOP'],
    ['HELP', 'HELP for help'],
    ['privacy policy', PRIVACY_POLICY_URL],
    ['not a condition', 'not a condition'],
  ])('%s', (_what, needle) => {
    expect(text).toContain(needle)
  })

  it('hash is stable and changes with the wording', () => {
    expect(disclosureHash('Maple Grove HOA')).toBe(sha256Hex(text))
    expect(disclosureHash('Oak Ridge HOA')).not.toBe(disclosureHash('Maple Grove HOA'))
  })
})

describe('phones', () => {
  it('normalises US numbers and rejects others', () => {
    expect(normalizeUsPhone('(404) 555-1234')).toBe('+14045551234')
    expect(normalizeUsPhone('1-404-555-1234')).toBe('+14045551234')
    expect(normalizeUsPhone('555-1234')).toBeNull()
    expect(normalizeUsPhone(null)).toBeNull()
    expect(formatUsPhone('+14045551234')).toBe('(404) 555-1234')
  })

  it('fingerprint ignores order and duplicates', () => {
    expect(phonesFingerprint(['+14045551234', '+17705550000'])).toBe(phonesFingerprint(['+17705550000', '+14045551234', '+14045551234']))
  })

  it('loadMyTextPhones reads only my rows in this org and de-duplicates', async () => {
    const { client, calls } = fakeClient({
      ownerships: [{ data: [{ owner_phone: '404-555-1234' }, { owner_phone: null }], error: null }],
      tenancies: [{ data: [{ tenant_phone: '(404) 555-1234' }, { tenant_phone: 'abc' }], error: null }],
    })
    expect(await loadMyTextPhones(client, ORG, ME)).toEqual({ ok: true, phones: ['+14045551234'] })
    expect(calls).toContainEqual(['eq', 'owner_user_id', ME])
    expect(calls).toContainEqual(['eq', 'tenant_user_id', ME])
    expect(calls.filter((c) => c[0] === 'eq' && c[1] === 'organization_id')).toHaveLength(2)
  })
})

describe('setSmsOptIn', () => {
  const evidence = { disclosureVersion: 'v1', disclosureSha256: 'abc', phones: ['+14045551234'] }

  it('grant: inserts my row, then the evidence row (ids and hashes, never the number)', async () => {
    const own = fakeClient({ resident_communication_preferences: [{ data: null, error: null }, { data: { id: 'pref-1' }, error: null }] })
    const audit = fakeClient({ audit_log: [{ error: null }] })
    expect(await setSmsOptIn(own.client, audit.client, { orgId: ORG, userId: ME, optIn: true, now: NOW, evidence })).toEqual({ ok: true })

    expect(own.calls).toContainEqual(['insert', { organization_id: ORG, user_id: ME, sms_opt_in: true, updated_at: NOW.toISOString() }])
    const row = audit.calls.find((c) => c[0] === 'insert')?.[1] as Record<string, unknown>
    expect(row).toEqual({
      action: SMS_CONSENT_GRANTED,
      org_id: ORG,
      user_id: ME,
      entity_type: 'resident_communication_preferences',
      entity_id: 'pref-1',
      metadata: {
        disclosure_version: 'v1',
        disclosure_sha256: 'abc',
        phone_sha256: [sha256Hex('+14045551234')],
        method: 'portal',
        consented_at: NOW.toISOString(),
      },
    })
    expect(JSON.stringify(row)).not.toContain('5551234')
  })

  it('grant: a failed evidence write turns texts back off and fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const own = fakeClient({ resident_communication_preferences: [{ data: { id: 'pref-1', organization_id: ORG }, error: null }, { error: null }, { error: null }] })
    const audit = fakeClient({ audit_log: [{ error: { code: '42501' } }] })
    expect(await setSmsOptIn(own.client, audit.client, { orgId: ORG, userId: ME, optIn: true, now: NOW, evidence })).toEqual({ ok: false, error: 'audit_failed' })
    const updates = own.calls.filter((c) => c[0] === 'update').map((c) => (c[1] as { sms_opt_in: boolean }).sms_opt_in)
    expect(updates).toEqual([true, false])
    // Logs carry ids and codes only.
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/\+1\d{10}/)
    err.mockRestore()
  })

  it('grant without evidence never stands', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const own = fakeClient({ resident_communication_preferences: [{ data: { id: 'pref-1', organization_id: ORG }, error: null }] })
    const audit = fakeClient({})
    expect(await setSmsOptIn(own.client, audit.client, { orgId: ORG, userId: ME, optIn: true, now: NOW })).toEqual({ ok: false, error: 'audit_failed' })
    expect(audit.calls).toEqual([])
    vi.restoreAllMocks()
  })

  it('grant refuses to move a row kept for another community', async () => {
    const own = fakeClient({ resident_communication_preferences: [{ data: { id: 'pref-1', organization_id: 'org-2' }, error: null }] })
    const audit = fakeClient({})
    expect(await setSmsOptIn(own.client, audit.client, { orgId: ORG, userId: ME, optIn: true, now: NOW, evidence })).toEqual({ ok: false, error: 'other_org' })
    expect(own.calls.some((c) => c[0] === 'update' || c[0] === 'insert')).toBe(false)
  })

  it('revoke: turns texts off at once; a failed audit write does not block it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const own = fakeClient({ resident_communication_preferences: [{ data: { id: 'pref-1', organization_id: 'org-2' }, error: null }, { error: null }] })
    const audit = fakeClient({ audit_log: [{ error: { code: 'x' } }] })
    expect(await setSmsOptIn(own.client, audit.client, { orgId: ORG, userId: ME, optIn: false, now: NOW })).toEqual({ ok: true })
    expect(own.calls).toContainEqual(['update', { sms_opt_in: false, updated_at: NOW.toISOString() }])
    const row = audit.calls.find((c) => c[0] === 'insert')?.[1] as Record<string, unknown>
    expect(row).toMatchObject({ action: SMS_CONSENT_REVOKED, org_id: 'org-2', user_id: ME })
    err.mockRestore()
  })

  it('a failed preference write fails without writing evidence', async () => {
    const own = fakeClient({ resident_communication_preferences: [{ data: null, error: null }, { data: null, error: { code: '42501' } }] })
    const audit = fakeClient({})
    expect(await setSmsOptIn(own.client, audit.client, { orgId: ORG, userId: ME, optIn: true, now: NOW, evidence })).toEqual({ ok: false, error: 'write_failed' })
    expect(audit.calls).toEqual([])
  })
})
