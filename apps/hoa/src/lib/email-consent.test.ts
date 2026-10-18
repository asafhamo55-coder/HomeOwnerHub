import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { currentEmailConsent, filterEmailRecipientsByConsent, loadEmailConsent, recordEmailConsent } from './email-consent'

function fakeClient(resp: { data: unknown; error: { code?: string } | null }) {
  const calls: Array<[string, unknown[]]> = []
  const b: Record<string, unknown> = {}
  for (const op of ['from', 'select', 'eq', 'order']) {
    b[op] = (...args: unknown[]) => {
      calls.push([op, args])
      return b
    }
  }
  // Paged read: the first page answers, the second is empty (end).
  let pages = 0
  b.range = (...args: unknown[]) => {
    calls.push(['range', args])
    pages += 1
    return Promise.resolve(pages === 1 || resp.error ? resp : { data: [], error: null })
  }
  b.insert = (...args: unknown[]) => {
    calls.push(['insert', args])
    return Promise.resolve(resp)
  }
  return { client: b as unknown as SupabaseClient<Database>, calls }
}

const ORG = 'org-1'

describe('currentEmailConsent', () => {
  it('the newest event per member wins', () => {
    const m = currentEmailConsent([
      { user_id: 'a', granted: true, method: 'portal', created_at: '2026-01-01T00:00:00Z' },
      { user_id: 'a', granted: false, method: 'portal', created_at: '2026-02-01T00:00:00Z' },
      { user_id: 'b', granted: true, method: 'written', created_at: '2026-01-01T00:00:00Z' },
    ])
    expect(m.get('a')?.granted).toBe(false)
    expect(m.get('b')).toEqual({ granted: true, method: 'written', at: '2026-01-01T00:00:00Z' })
  })
})

describe('flag off (pre-M1)', () => {
  it('reads report unavailable and touch nothing; writes refuse', async () => {
    const f = fakeClient({ data: [], error: null })
    expect(await loadEmailConsent(f.client, ORG, { m1: false })).toEqual({ ok: true, available: false })
    expect(
      await recordEmailConsent(f.client, { orgId: ORG, userId: 'u', recordedBy: 'u', granted: true, method: 'portal' }, { m1: false }),
    ).toEqual({ ok: false, error: 'not_available' })
    expect(f.calls).toEqual([])
  })

  it('the audience filter keeps everyone, even in CA', () => {
    const r = filterEmailRecipientsByConsent([{ userId: 'a' }, { userId: null }], {
      state: 'CA',
      officialNotice: true,
      consent: { ok: true, available: false },
    })
    expect(r).toEqual({ kept: [{ userId: 'a' }, { userId: null }], excluded: 0 })
  })
})

describe('flag on (M1 applied)', () => {
  it('loads and folds the org’s events', async () => {
    const f = fakeClient({ data: [{ user_id: 'a', granted: true, method: 'portal', created_at: '2026-01-01T00:00:00Z' }], error: null })
    const r = await loadEmailConsent(f.client, ORG, { m1: true })
    expect(r.ok && r.available && r.consent.get('a')?.granted).toBe(true)
    expect(f.calls).toContainEqual(['from', ['member_email_consent_events']])
    expect(f.calls).toContainEqual(['eq', ['organization_id', ORG]])
  })

  it('a failed read is a coded error, not "nobody consented"', async () => {
    const f = fakeClient({ data: null, error: { code: '42501' } })
    expect(await loadEmailConsent(f.client, ORG, { m1: true })).toEqual({ ok: false, error: 'member_email_consent_events: 42501' })
  })

  it('appends a row; refuses a portal consent recorded for someone else', async () => {
    const f = fakeClient({ data: null, error: null })
    expect(
      await recordEmailConsent(f.client, { orgId: ORG, userId: 'u', recordedBy: 'u', granted: false, method: 'portal' }, { m1: true }),
    ).toEqual({ ok: true })
    expect(f.calls).toContainEqual([
      'insert',
      [{ organization_id: ORG, user_id: 'u', recorded_by: 'u', granted: false, method: 'portal' }],
    ])
    expect(
      (await recordEmailConsent(f.client, { orgId: ORG, userId: 'u', recordedBy: 'board', granted: true, method: 'portal' }, { m1: true }))
        .ok,
    ).toBe(false)
  })

  it('CA official notices keep only consenting members and count the rest', () => {
    const consent = {
      ok: true as const,
      available: true as const,
      consent: new Map([
        ['a', { granted: true, method: 'portal' as const, at: 'x' }],
        ['b', { granted: false, method: 'portal' as const, at: 'x' }],
      ]),
    }
    const rs = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }, { userId: null }]
    expect(filterEmailRecipientsByConsent(rs, { state: 'ca', officialNotice: true, consent })).toEqual({
      kept: [{ userId: 'a' }],
      excluded: 3,
    })
    // Not CA, or not an official notice: unchanged.
    expect(filterEmailRecipientsByConsent(rs, { state: 'FL', officialNotice: true, consent }).excluded).toBe(0)
    expect(filterEmailRecipientsByConsent(rs, { state: 'CA', officialNotice: false, consent }).excluded).toBe(0)
  })
})
