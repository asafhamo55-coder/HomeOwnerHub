import { describe, expect, it, vi } from 'vitest'
import { buildDigestEmail, buildVendorCoiBlock, loadVendorCoiCounts, runDailyDigest, type DailyDigestDeps } from './daily-digest'

/**
 * Round 15 (OA-19): the board's morning email carries a "Vendor insurance"
 * block with counts only. No vendor name or email is ever selected, and
 * nothing here can email a vendor.
 */

type Row = { data: unknown; error: unknown }
const ORG = 'org-1'
const TODAY = '2026-10-21'
const VENDOR_EMAIL = 'secret-vendor@example.test'

function fakeDb(results: Record<string, Row>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'lt', 'lte', 'order', 'limit', 'neq', 'range']) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        return chain
      }
    }
    chain.then = (resolve: (r: Row) => unknown) => {
      // Page 1 returns the rows; any later page is empty so readAll stops.
      const isLaterPage = calls.some((c) => c.table === table && c.method === 'range' && c.args[0] !== 0)
      const r = isLaterPage ? { data: [], error: null } : (results[table] ?? { data: [], error: null })
      return Promise.resolve(r).then(resolve)
    }
    return chain
  })
  return { db: { from } as never, calls }
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
const row = (vendor_id: string, day: string, status = 'active', deleted_at: string | null = null) => ({
  vendor_id,
  coi_expiration_date: day,
  vendor: { status, deleted_at },
})

describe('loadVendorCoiCounts', () => {
  it('counts expired and expiring-within-30-days vendors, one per vendor on the earliest date', async () => {
    const { db } = fakeDb({
      vendor_compliance: {
        data: [
          row('v1', '2026-10-01'), // expired
          row('v1', '2026-12-01'), // same vendor, later date: still one, earliest wins
          row('v2', '2026-10-21'), // today: expiring
          row('v3', '2026-11-20'), // day 30: expiring
          row('v4', '2026-11-21'), // day 31: outside
          row('v5', '2026-09-01', 'inactive'), // untracked status
          row('v6', '2026-09-01', 'active', '2026-01-01T00:00:00Z'), // deleted
        ],
        error: null,
      },
    })
    expect(await loadVendorCoiCounts(db, ORG, TODAY, logger())).toEqual({ expired: 1, expiring: 2 })
  })

  it('is org scoped, paged, and selects no vendor name or email', async () => {
    const { db, calls } = fakeDb({ vendor_compliance: { data: [row('v1', '2026-10-01')], error: null } })
    await loadVendorCoiCounts(db, ORG, TODAY, logger())
    expect(calls.find((c) => c.table === 'vendor_compliance' && c.method === 'eq')?.args).toEqual(['organization_id', ORG])
    expect(calls.some((c) => c.method === 'range')).toBe(true)
    const select = String(calls.find((c) => c.method === 'select')?.args[0])
    expect(select).not.toMatch(/name|email/)
  })

  it('a failed read is null (logged by code), never "nothing expiring"', async () => {
    const log = logger()
    const { db } = fakeDb({ vendor_compliance: { data: null, error: { code: '42501' } } })
    expect(await loadVendorCoiCounts(db, ORG, TODAY, log)).toBeNull()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('vendor certificates'), { code: '42501' })
  })
})

describe('the email', () => {
  const base = { orgName: 'Bay HOA', mailboxes: [], reconnectUrl: 'x', waiting: null }

  it('block: counts line and Review vendors link, HTML and text', () => {
    const b = buildVendorCoiBlock({ counts: { expired: 2, expiring: 1 }, vendorsUrl: 'https://app.test/vendors' })
    expect(b.text).toContain('2 vendor certificates expired, 1 expiring within 30 days')
    expect(b.text).toContain('Review vendors: https://app.test/vendors')
    expect(b.html).toContain('Review vendors')
    expect(b.html).toContain('href="https://app.test/vendors"')
    expect(`${b.text}${b.html}`).not.toMatch(/[—–]/)
  })

  it('present when there are counts, absent when zero or omitted', () => {
    const withBlock = buildDigestEmail({
      ...base,
      arc: { overdue: 1, dueSoon: 0, arcUrl: 'u' },
      vendorCoi: { counts: { expired: 0, expiring: 1 }, vendorsUrl: 'https://app.test/vendors' },
    })
    expect(withBlock.text).toContain('Vendor insurance')
    expect(withBlock.text).toContain('1 vendor certificate expiring within 30 days')
    for (const vendorCoi of [undefined, null, { counts: { expired: 0, expiring: 0 }, vendorsUrl: 'u' }]) {
      const without = buildDigestEmail({ ...base, arc: { overdue: 1, dueSoon: 0, arcUrl: 'u' }, vendorCoi })
      expect(without.text).not.toContain('Vendor insurance')
      expect(without.html).not.toContain('Vendor insurance')
    }
  })

  it('alone in the email it sets its own subject', () => {
    const email = buildDigestEmail({ ...base, vendorCoi: { counts: { expired: 3, expiring: 0 }, vendorsUrl: 'u' } })
    expect(email.subject).toBe('3 vendor certificates expired — Bay HOA')
  })

  it('runDailyDigest emails only the board, no vendor email anywhere, and logs counts only', async () => {
    const { db, calls } = fakeDb({
      orgs: { data: [{ id: ORG, name: 'Bay HOA' }], error: null },
      org_members: { data: [{ user_id: 'u1', role: 'board' }], error: null },
      profiles: { data: [{ id: 'u1', email: 'board@example.test', full_name: 'Bo Board' }], error: null },
      vendor_compliance: { data: [row('v1', '2020-01-01'), row('v2', '2999-01-01')], error: null },
    })
    const sendEmail = vi.fn<DailyDigestDeps['sendEmail']>(async () => ({ ok: true }))
    const log = logger()
    const res = await runDailyDigest(db, { sendEmail, appUrl: (p) => `https://app.test${p}` }, log)
    expect(res.vendorCoiAlerts).toBe(1)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const sent = sendEmail.mock.calls[0]![0]
    expect(sent.to).toBe('board@example.test')
    expect(sent.text).toContain('1 vendor certificate expired')
    expect(sent.text).toContain('https://app.test/vendors')
    expect(JSON.stringify(sent)).not.toContain(VENDOR_EMAIL)
    expect(JSON.stringify(log.info.mock.calls)).toContain('1 vendor certificate(s) expired, 0 expiring')
    // vendors table is never read for contact details
    expect(calls.some((c) => c.table === 'vendors')).toBe(false)
  })
})
