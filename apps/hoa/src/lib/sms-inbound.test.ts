import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { sha256Hex } from './sms-consent'
import { applyStart, applyStop, classifyKeyword, isNewerPortalRevoke, verifyVonageSignedWebhook } from './sms-inbound'
import { fakeSupabase, hasEq, type Recorded } from '@/lib/test-utils/fake-supabase'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// BL-111: inbound STOP / START / HELP. No real SMS, no real database.

function signVonageJwt(secret: string, claims: Record<string, unknown>, alg = 'HS256'): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const h = enc({ alg, typ: 'JWT' })
  const p = enc(claims)
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${sig}`
}

describe('classifyKeyword', () => {
  it.each(['STOP', 'stop', ' Stop. ', 'STOPALL', 'unsubscribe', 'Cancel', 'END', 'quit', 'Stop please'])('%s → stop', (t) => {
    expect(classifyKeyword(t)).toBe('stop')
  })
  it.each(['START', 'start', 'Unstop'])('%s → start', (t) => expect(classifyKeyword(t)).toBe('start'))
  it.each(['HELP', 'help?', 'INFO'])('%s → help', (t) => expect(classifyKeyword(t)).toBe('help'))
  it.each(['', 'thanks!', 'please start the meeting', 'see you at the end', null])('%s → nothing', (t) => {
    expect(classifyKeyword(t)).toBeNull()
  })
})

describe('verifyVonageSignedWebhook', () => {
  const secret = 'sig-secret'
  const body = '{"text":"STOP"}'
  const now = 1_800_000_000
  const good = signVonageJwt(secret, { iat: now - 10, payload_hash: sha256Hex(body), api_key: 'key-1' })
  const check = (authorization: string | null, rawBody = body, apiKey: string | null = 'key-1') =>
    verifyVonageSignedWebhook({ authorization, rawBody, secret, nowSeconds: now, apiKey })

  it('accepts a correctly signed request for these exact bytes', () => {
    expect(check(`Bearer ${good}`)).toEqual({ ok: true })
  })
  it('refuses unsigned, wrong secret, wrong alg, tampered body, wrong api key, stale', () => {
    expect(check(null)).toEqual({ ok: false, reason: 'missing_signature' })
    expect(check('Basic abc')).toEqual({ ok: false, reason: 'missing_signature' })
    expect(check(`Bearer ${signVonageJwt('other', { iat: now, payload_hash: sha256Hex(body) })}`).ok).toBe(false)
    expect(check(`Bearer ${signVonageJwt(secret, { iat: now, payload_hash: sha256Hex(body) }, 'none')}`).ok).toBe(false)
    expect(check(`Bearer ${good}`, '{"text":"START"}')).toEqual({ ok: false, reason: 'payload_mismatch' })
    expect(check(`Bearer ${good}`, body, 'key-2').ok).toBe(false)
    const stale = signVonageJwt(secret, { iat: now - 2 * 86400, payload_hash: sha256Hex(body) })
    expect(check(`Bearer ${stale}`)).toEqual({ ok: false, reason: 'expired' })
    const noHash = signVonageJwt(secret, { iat: now, api_key: 'key-1' })
    expect(check(`Bearer ${noHash}`)).toEqual({ ok: false, reason: 'payload_mismatch' })
  })
})

// ─── applyStop / applyStart against a recording fake ────────────────

const FROM = '14045551234' // Vonage sends digits only
const HASH = sha256Hex('+14045551234')
const NOW = new Date('2026-10-20T15:00:00Z')

const isOp = (q: Recorded, m: string) => q.ops.some(([op]) => op === m)
const payloadOf = (q: Recorded, m: string) => q.ops.find(([op]) => op === m)?.[1] as Record<string, unknown>

function harness(opts: {
  grants: Array<{ id: string; org_id: string; user_id: string; metadata?: unknown; created_at?: string }>
  ledger?: unknown[]
  prefRow?: { id: string; sms_opt_in: boolean } | null
  updatedRows?: Array<{ id: string }>
  existingAudit?: boolean
  /** L-2: the resident's newest consent event (the `limit(1)` read). */
  latest?: Array<{ id: string; action: string; metadata: unknown; created_at: string }>
  failOn?: string
}) {
  return fakeSupabase((q) => {
    if (opts.failOn && q.table === opts.failOn.split('.')[0] && isOp(q, opts.failOn.split('.')[1])) {
      return { data: null, error: { code: '08006', message: 'leak +14045551234' } }
    }
    if (q.table === 'audit_log' && isOp(q, 'insert')) return { data: null, error: null }
    if (q.table === 'audit_log') {
      const contains = q.ops.find(([op]) => op === 'contains')?.[2] as Record<string, unknown> | undefined
      if (contains && 'phone_sha256' in contains) {
        return { data: opts.grants.map((g) => ({ created_at: '2026-10-01', metadata: { phone_sha256: [HASH] }, ...g })), error: null }
      }
      if (contains && 'message_id' in contains) return { data: opts.existingAudit ? [{ id: 'dup' }] : [], error: null }
      if (!contains && isOp(q, 'limit')) return { data: opts.latest ?? [], error: null }
      return { data: opts.ledger ?? [], error: null } // the user's ledger
    }
    if (q.table === 'resident_communication_preferences' && isOp(q, 'update')) {
      return { data: opts.updatedRows ?? [], error: null }
    }
    if (q.table === 'resident_communication_preferences') return { data: opts.prefRow ?? null, error: null }
    return undefined
  })
}

describe('applyStop', () => {
  it('turns texts off for every resident (across orgs) whose consent names the number, and records the revoke', async () => {
    const { client, queries } = harness({
      grants: [
        { id: 'g1', org_id: 'org-1', user_id: 'u-1' },
        { id: 'g2', org_id: 'org-2', user_id: 'u-1' },
        { id: 'g3', org_id: 'org-1', user_id: 'u-1' }, // same resident twice: one entry
      ],
      updatedRows: [{ id: 'pref-1' }],
    })
    const out = await applyStop(client as never, { fromRaw: FROM, messageId: 'm-1', keyword: 'STOP', now: NOW })
    expect(out).toEqual({ matched: 2, changed: 2 })

    const lookup = queries[0]
    expect(lookup.table).toBe('audit_log')
    expect(hasEq(lookup, 'action', 'sms_consent_granted')).toBe(true)
    expect(lookup.ops.find(([op]) => op === 'contains')).toEqual(['contains', 'metadata', { phone_sha256: [HASH] }])

    const updates = queries.filter((q) => q.table === 'resident_communication_preferences' && isOp(q, 'update'))
    expect(updates).toHaveLength(2)
    expect(payloadOf(updates[0], 'update')).toMatchObject({ sms_opt_in: false })
    expect(hasEq(updates[1], 'organization_id', 'org-2') && hasEq(updates[1], 'user_id', 'u-1')).toBe(true)

    const inserts = queries.filter((q) => q.table === 'audit_log' && isOp(q, 'insert'))
    expect(inserts).toHaveLength(2)
    const row = payloadOf(inserts[0], 'insert')
    expect(row).toMatchObject({ action: 'sms_consent_revoked', org_id: 'org-1', user_id: 'u-1' })
    expect(row.metadata).toMatchObject({ method: 'sms_keyword', keyword: 'STOP', message_id: 'm-1' })
    // The number never lands in the audit row.
    expect(JSON.stringify(row)).not.toContain('4045551234')
  })

  it('a retried delivery writes no second audit row', async () => {
    const { client, queries } = harness({ grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1' }], existingAudit: true })
    await applyStop(client as never, { fromRaw: FROM, messageId: 'm-1', keyword: 'STOP', now: NOW })
    expect(queries.some((q) => q.table === 'audit_log' && isOp(q, 'insert'))).toBe(false)
  })

  it('an unknown or non-US number changes nothing', async () => {
    const none = harness({ grants: [] })
    expect(await applyStop(none.client as never, { fromRaw: FROM, messageId: 'm', keyword: 'STOP', now: NOW })).toEqual({ matched: 0, changed: 0 })
    const intl = harness({ grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1' }] })
    expect(await applyStop(intl.client as never, { fromRaw: '442079460958', messageId: 'm', keyword: 'STOP', now: NOW })).toEqual({
      matched: 0,
      changed: 0,
    })
    expect(intl.queries).toHaveLength(0)
  })

  it('a failed write throws (the route answers 500 so Vonage retries) and logs no number', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = harness({ grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1' }], failOn: 'resident_communication_preferences.update' })
    await expect(applyStop(client as never, { fromRaw: FROM, messageId: 'm', keyword: 'STOP', now: NOW })).rejects.toMatchObject({ code: 'internal' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('4045551234')
    spy.mockRestore()
  })
})

describe('applyStart', () => {
  const prior = { disclosure_version: '2026-10-20.1', disclosure_sha256: 'd'.repeat(64), phone_sha256: [HASH] }

  it('re-enables only where a prior consent names the number, writing the evidence first', async () => {
    const { client, queries } = harness({
      grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1', metadata: prior }],
      prefRow: { id: 'pref-1', sms_opt_in: false },
      ledger: [], // revoked by an earlier STOP: nothing covered now
    })
    const out = await applyStart(client as never, { fromRaw: FROM, messageId: 'm-2', keyword: 'START', now: NOW })
    expect(out).toEqual({ matched: 1, changed: 1 })

    const insertAt = queries.findIndex((q) => q.table === 'audit_log' && isOp(q, 'insert'))
    const updateAt = queries.findIndex((q) => q.table === 'resident_communication_preferences' && isOp(q, 'update'))
    expect(insertAt).toBeGreaterThan(-1)
    expect(updateAt).toBeGreaterThan(insertAt)
    const row = payloadOf(queries[insertAt], 'insert')
    expect(row).toMatchObject({ action: 'sms_consent_granted', org_id: 'org-1', user_id: 'u-1', entity_id: 'pref-1' })
    expect(row.metadata).toMatchObject({
      disclosure_version: '2026-10-20.1',
      phone_sha256: [HASH],
      method: 'sms_keyword',
      message_id: 'm-2',
      restores_grant_id: 'g1',
    })
    expect(payloadOf(queries[updateAt], 'update')).toMatchObject({ sms_opt_in: true })
  })

  it('keeps numbers the resident still has consent for', async () => {
    const other = sha256Hex('+14045559999')
    const { client, queries } = harness({
      grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1', metadata: prior }],
      prefRow: { id: 'pref-1', sms_opt_in: true },
      ledger: [{ id: 'g0', user_id: 'u-1', action: 'sms_consent_granted', metadata: { phone_sha256: [other] }, created_at: '2026-10-05' }],
    })
    const out = await applyStart(client as never, { fromRaw: FROM, messageId: 'm-3', keyword: 'START', now: NOW })
    expect(out.changed).toBe(0) // already on: no preference write
    const row = payloadOf(queries.find((q) => q.table === 'audit_log' && isOp(q, 'insert'))!, 'insert')
    expect((row.metadata as { phone_sha256: string[] }).phone_sha256).toEqual([HASH, other].sort())
  })

  it('no prior consent for the number: nothing is turned on', async () => {
    const { client, queries } = harness({ grants: [], prefRow: { id: 'pref-1', sms_opt_in: false } })
    expect(await applyStart(client as never, { fromRaw: FROM, messageId: 'm', keyword: 'START', now: NOW })).toEqual({ matched: 0, changed: 0 })
    expect(queries.some((q) => isOp(q, 'update') || isOp(q, 'insert'))).toBe(false)
  })

  it('no preference row in that org: left alone', async () => {
    const { client, queries } = harness({ grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1', metadata: prior }], prefRow: null })
    expect(await applyStart(client as never, { fromRaw: FROM, messageId: 'm', keyword: 'START', now: NOW })).toEqual({ matched: 1, changed: 0 })
    expect(queries.some((q) => isOp(q, 'update') || isOp(q, 'insert'))).toBe(false)
  })

  it('a retried START writes no duplicate evidence but still completes the opt-in', async () => {
    const { client, queries } = harness({
      grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1', metadata: prior }],
      prefRow: { id: 'pref-1', sms_opt_in: false },
      existingAudit: true,
    })
    const out = await applyStart(client as never, { fromRaw: FROM, messageId: 'm', keyword: 'START', now: NOW })
    expect(out.changed).toBe(1)
    expect(queries.some((q) => q.table === 'audit_log' && isOp(q, 'insert'))).toBe(false)
  })

  it('L-2: skips a resident whose latest event is a portal revoke newer than the grant', async () => {
    const { client, queries } = harness({
      grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1', metadata: prior, created_at: '2026-10-01T00:00:00Z' }],
      prefRow: { id: 'pref-1', sms_opt_in: false },
      latest: [{ id: 'r1', action: 'sms_consent_revoked', metadata: { method: 'portal', revoked_at: '2026-10-10T00:00:00Z' }, created_at: '2026-10-10T00:00:00Z' }],
    })
    const out = await applyStart(client as never, { fromRaw: FROM, messageId: 'm-4', keyword: 'START', now: NOW })
    expect(out).toEqual({ matched: 1, changed: 0 })
    expect(queries.some((q) => isOp(q, 'update') || isOp(q, 'insert'))).toBe(false)
  })

  it('L-2: a STOP-keyword revoke (not portal) is still undone by START', async () => {
    const { client } = harness({
      grants: [{ id: 'g1', org_id: 'org-1', user_id: 'u-1', metadata: prior, created_at: '2026-10-01T00:00:00Z' }],
      prefRow: { id: 'pref-1', sms_opt_in: false },
      latest: [{ id: 'r1', action: 'sms_consent_revoked', metadata: { method: 'sms_keyword' }, created_at: '2026-10-10T00:00:00Z' }],
    })
    expect(await applyStart(client as never, { fromRaw: FROM, messageId: 'm-5', keyword: 'START', now: NOW })).toEqual({ matched: 1, changed: 1 })
  })

  it('L-2: per resident — another org without a portal revoke is still re-enabled', async () => {
    const { client, queries } = fakeSupabase((q) => {
      const contains = q.ops.find(([op]) => op === 'contains')?.[2] as Record<string, unknown> | undefined
      if (q.table === 'audit_log' && isOp(q, 'insert')) return { data: null, error: null }
      if (q.table === 'audit_log' && contains && 'phone_sha256' in contains) {
        return {
          data: ['org-1', 'org-2'].map((org, i) => ({ id: `g${i}`, org_id: org, user_id: 'u-1', metadata: prior, created_at: '2026-10-01T00:00:00Z' })),
          error: null,
        }
      }
      if (q.table === 'audit_log' && !contains && isOp(q, 'limit')) {
        return hasEq(q, 'org_id', 'org-1')
          ? { data: [{ id: 'r1', action: 'sms_consent_revoked', metadata: { method: 'portal' }, created_at: '2026-10-10T00:00:00Z' }], error: null }
          : { data: [], error: null }
      }
      if (q.table === 'audit_log') return { data: [], error: null }
      if (q.table === 'resident_communication_preferences' && isOp(q, 'update')) return { data: [], error: null }
      if (q.table === 'resident_communication_preferences') return { data: { id: 'pref-x', sms_opt_in: false }, error: null }
      return undefined
    })
    expect(await applyStart(client as never, { fromRaw: FROM, messageId: 'm-6', keyword: 'START', now: NOW })).toEqual({ matched: 2, changed: 1 })
    const updates = queries.filter((q) => q.table === 'resident_communication_preferences' && isOp(q, 'update'))
    expect(updates).toHaveLength(1)
  })

  it('L-2: a portal revoke older than the grant does not block START', () => {
    expect(isNewerPortalRevoke({ action: 'sms_consent_revoked', metadata: { method: 'portal' }, created_at: '2026-09-01T00:00:00Z' }, '2026-10-01T00:00:00Z')).toBe(false)
    expect(isNewerPortalRevoke({ action: 'sms_consent_granted', metadata: {}, created_at: '2026-11-01T00:00:00Z' }, '2026-10-01T00:00:00Z')).toBe(false)
    expect(isNewerPortalRevoke(null, '2026-10-01T00:00:00Z')).toBe(false)
  })
})
