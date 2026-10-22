import { describe, expect, it, vi } from 'vitest'
import { buildDigestEmail, buildLateFeeBlock, lateFeeDigestLine, loadLateFeeCharges } from './daily-digest'

/**
 * BL-147: the board's morning email says how many late fees the nightly
 * job charged under the board's policy, from the job's audit rows (counts
 * only), linking to Settings → Late fees.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args])
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { calls, db: { from: (table: string) => (calls.push(['from', [table]]), chain) } }
}

describe('loadLateFeeCharges', () => {
  it('sums the job’s audit rows for this org since the cutoff', async () => {
    const f = fakeDb({ data: [{ metadata: { charged: 2, total_cents: 2000 } }, { metadata: { charged: 1, total_cents: 1000 } }], error: null })
    expect(await loadLateFeeCharges(f.db, 'org-1', '2026-10-21T04:00:00.000Z', logger)).toEqual({ charged: 3, totalCents: 3000 })
    expect(f.calls).toContainEqual(['from', ['audit_log']])
    expect(f.calls).toContainEqual(['eq', ['org_id', 'org-1']])
    expect(f.calls).toContainEqual(['eq', ['action', 'late_fee.nightly_charged']])
    expect(f.calls).toContainEqual(['gte', ['created_at', '2026-10-21T04:00:00.000Z']])
  })

  it('a failed read is null (never "nothing charged")', async () => {
    const f = fakeDb({ data: null, error: { code: '42501' } })
    expect(await loadLateFeeCharges(f.db, 'org-1', 'x', logger)).toBeNull()
  })

  it('ignores malformed metadata', async () => {
    const f = fakeDb({ data: [{ metadata: { charged: 'lots', total_cents: -5 } }, { metadata: null }], error: null })
    expect(await loadLateFeeCharges(f.db, 'org-1', 'x', logger)).toEqual({ charged: 0, totalCents: 0 })
  })
})

describe('the late-fee digest line', () => {
  it('reads plainly, with the total', () => {
    expect(lateFeeDigestLine({ charged: 1, totalCents: 1000 })).toBe('1 late fee charged overnight under your late-fee policy ($10.00 in total).')
    expect(lateFeeDigestLine({ charged: 3, totalCents: 7500 })).toBe('3 late fees charged overnight under your late-fee policy ($75.00 in total).')
  })

  it('links to the policy', () => {
    const b = buildLateFeeBlock({ summary: { charged: 2, totalCents: 2000 }, policyUrl: 'https://app.test/settings/late-fees' })
    expect(b.text).toContain('https://app.test/settings/late-fees')
    expect(b.html).toContain('Review the late-fee policy')
  })

  it('alone, it makes the email and its subject', () => {
    const e = buildDigestEmail({
      orgName: 'Maple HOA',
      mailboxes: [],
      reconnectUrl: 'x',
      waiting: null,
      lateFees: { summary: { charged: 2, totalCents: 2000 }, policyUrl: 'https://app.test/settings/late-fees' },
    })
    expect(e.subject).toBe('2 late fees charged overnight — Maple HOA')
    expect(e.text).toContain('2 late fees charged overnight under your late-fee policy ($20.00 in total).')
  })

  it('zero charged adds nothing', () => {
    const e = buildDigestEmail({
      orgName: 'Maple HOA',
      mailboxes: [],
      reconnectUrl: 'x',
      waiting: null,
      arc: { overdue: 1, dueSoon: 0, arcUrl: 'a' },
      lateFees: { summary: { charged: 0, totalCents: 0 }, policyUrl: 'p' },
    })
    expect(e.text).not.toContain('late fee')
  })
})
