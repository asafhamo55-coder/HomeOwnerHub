import { describe, expect, it } from 'vitest'
import {
  approvalsBadge,
  buildInbox,
  canUseApprovals,
  parseApprovalFilter,
  vendorItems,
  vendorNeedsBoard,
  w18Items,
  w3Items,
  type InboxSection,
} from './model'

const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
const T3 = '2026-10-03T10:00:00.000Z'

describe('canUseApprovals (role gate)', () => {
  it('lets board and admin in', () => {
    expect(canUseApprovals('board')).toBe(true)
    expect(canUseApprovals('admin')).toBe(true)
  })
  it('keeps residents, unknown roles and no role out', () => {
    expect(canUseApprovals('resident')).toBe(false)
    expect(canUseApprovals('owner')).toBe(false)
    expect(canUseApprovals(null)).toBe(false)
    expect(canUseApprovals(undefined)).toBe(false)
  })
})

describe('parseApprovalFilter', () => {
  it('accepts each source and defaults to all', () => {
    expect(parseApprovalFilter('w18')).toBe('w18')
    expect(parseApprovalFilter('w3')).toBe('w3')
    expect(parseApprovalFilter('vendor')).toBe('vendor')
    expect(parseApprovalFilter(undefined)).toBe('all')
    expect(parseApprovalFilter('')).toBe('all')
    expect(parseApprovalFilter('drop table')).toBe('all')
    expect(parseApprovalFilter(['w3', 'w18'])).toBe('w3')
  })
})

describe('w18Items', () => {
  const proposal = (id: string, subject: string, at: string, amount: number | string | null = 250) => ({
    id,
    subject_id: subject,
    summary: `Zelle ${id}`,
    amount,
    proposed_at: at,
  })

  it('maps a proposal to a decidable item with amount and the latest matcher notes', () => {
    const items = w18Items(
      [proposal('p1', 't1', T1, '250.00')],
      [
        { input: { bankTransactionId: 't1' }, output: { notes: 'older run', confidence: 0.5 }, created_at: T1 },
        { input: { bankTransactionId: 't1' }, output: { notes: 'exact memo match', confidence: 0.99 }, created_at: T2 },
      ],
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      source: 'w18',
      id: 'p1',
      title: 'Zelle p1',
      amount: 250,
      createdAt: T1,
      reasoning: 'exact memo match',
      confidenceLabel: '99% confident',
      decision: { kind: 'w18', approvalRequestId: 'p1' },
    })
  })

  it('has no reasoning (not a made-up one) when the run is missing or notes failed to load', () => {
    expect(w18Items([proposal('p1', 't1', T1)], [])[0].reasoning).toBeNull()
    expect(w18Items([proposal('p1', 't1', T1)], null)[0].reasoning).toBeNull()
  })

  it('keeps a null amount null rather than $0', () => {
    expect(w18Items([proposal('p1', 't1', T1, null)], [])[0].amount).toBeNull()
  })
})

describe('w3Items', () => {
  it('maps a pending W3 run with fine, citations and reasoning, and offers no one-click decision', () => {
    const [item] = w3Items([
      {
        id: 'r1',
        created_at: T2,
        input: { violationType: 'landscaping' },
        output: {
          notice: 'Please trim the hedge.',
          citedSection: 'CC&R §4.2',
          recommendedFineAmountCents: 2500,
          confidence: 'HIGH',
        },
        citations: ['chunk-1'],
        reasoning_trace: 'The hedge exceeds the height limit.',
      },
    ])
    expect(item).toMatchObject({
      source: 'w3',
      id: 'r1',
      title: 'Landscaping',
      detail: 'Please trim the hedge.',
      amount: 25,
      amountNote: 'per day',
      createdAt: T2,
      reasoning: 'The hedge exceeds the height limit.',
      citations: ['CC&R §4.2'],
      confidenceLabel: 'High confidence',
      decision: null,
    })
    expect(item.href).toBe('/violations/approval-queue')
  })

  it('tolerates a run with no output fields', () => {
    const [item] = w3Items([
      { id: 'r2', created_at: T1, input: null, output: null, citations: null, reasoning_trace: null },
    ])
    expect(item).toMatchObject({ title: 'Violation notice', amount: null, citations: [], reasoning: null })
  })

  it('truncates a long notice', () => {
    const [item] = w3Items([
      { id: 'r3', created_at: T1, input: {}, output: { notice: 'x'.repeat(500) }, citations: null, reasoning_trace: null },
    ])
    expect(item.detail!.length).toBeLessThanOrEqual(241)
    expect(item.detail!.endsWith('…')).toBe(true)
  })
})

describe('vendor queue predicate and items', () => {
  const vendor = (id: string, status: string, coi: string | null, deficiencies: { code: string; severity: string; detail: string }[] = []) => ({
    id,
    legal_name: `Vendor ${id}`,
    status,
    created_at: T1,
    compliance: coi === null ? null : { status: coi, deficiencies, last_reviewed_at: T3 },
  })

  it('matches the vendor approval queue: green prospects and yellow/red/missing', () => {
    expect(vendorNeedsBoard(vendor('a', 'prospect', 'green'))).toBe(true)
    expect(vendorNeedsBoard(vendor('b', 'active', 'green'))).toBe(false)
    expect(vendorNeedsBoard(vendor('c', 'active', 'yellow'))).toBe(true)
    expect(vendorNeedsBoard(vendor('d', 'prospect', 'red'))).toBe(true)
    expect(vendorNeedsBoard(vendor('e', 'prospect', 'missing'))).toBe(true)
    expect(vendorNeedsBoard(vendor('f', 'prospect', null))).toBe(false)
  })

  it('only a compliant prospect gets a one-click approve; the rest link to review', () => {
    const items = vendorItems([
      vendor('a', 'prospect', 'green'),
      vendor('b', 'active', 'green'),
      vendor('c', 'active', 'red', [{ code: 'gl', severity: 'high', detail: 'GL below $1M' }]),
    ])
    expect(items.map((i) => i.id)).toEqual(['a', 'c'])
    expect(items[0].decision).toEqual({ kind: 'vendor', vendorId: 'a' })
    expect(items[1].decision).toBeNull()
    expect(items[1].reasoning).toBe('GL below $1M')
    expect(items[1].href).toBe('/vendors/c')
    expect(items[0].amount).toBeNull()
  })
})

describe('buildInbox (aggregation)', () => {
  const ok = (source: 'w18' | 'w3' | 'vendor', n: number, total = n): InboxSection => ({
    source,
    ok: true,
    total,
    items: Array.from({ length: n }, (_, i) => ({
      source,
      id: `${source}-${i}`,
      title: 't',
      detail: null,
      amount: null,
      amountNote: null,
      createdAt: T1,
      reasoning: null,
      citations: [],
      confidenceLabel: null,
      href: '/',
      decision: null,
    })),
  })

  it('counts each source and the total from the totals, not just the rows shown', () => {
    const inbox = buildInbox([ok('w18', 2, 120), ok('w3', 1), ok('vendor', 0)], 'all')
    expect(inbox.counts).toEqual({ w18: 120, w3: 1, vendor: 0 })
    expect(inbox.total).toBe(121)
    expect(inbox.anyFailed).toBe(false)
    expect(inbox.allClear).toBe(false)
    expect(inbox.sections.map((s) => s.source)).toEqual(['w18', 'w3', 'vendor'])
  })

  it('a failed source has an unknown count and the total is unknown — never 0', () => {
    const inbox = buildInbox([ok('w18', 0), { source: 'w3', ok: false }, ok('vendor', 0)], 'all')
    expect(inbox.counts.w3).toBeNull()
    expect(inbox.total).toBeNull()
    expect(inbox.anyFailed).toBe(true)
    expect(inbox.allClear, 'empty-but-failed is not inbox zero').toBe(false)
    expect(inbox.sections.find((s) => s.source === 'w3')).toEqual({ source: 'w3', ok: false })
  })

  it('is all clear only when every source loaded and is empty', () => {
    expect(buildInbox([ok('w18', 0), ok('w3', 0), ok('vendor', 0)], 'all').allClear).toBe(true)
  })

  it('a type filter shows only that section but keeps every count for the tabs', () => {
    const inbox = buildInbox([ok('w18', 2), ok('w3', 1), { source: 'vendor', ok: false }], 'w3')
    expect(inbox.sections.map((s) => s.source)).toEqual(['w3'])
    expect(inbox.counts).toEqual({ w18: 2, w3: 1, vendor: null })
  })

  it('orders sections by source regardless of input order', () => {
    const inbox = buildInbox([ok('vendor', 1), ok('w3', 1), ok('w18', 1)], 'all')
    expect(inbox.sections.map((s) => s.source)).toEqual(['w18', 'w3', 'vendor'])
  })
})

describe('approvalsBadge (sidebar)', () => {
  it('shows the total when every count loaded', () => {
    expect(approvalsBadge({ w18: 2, w3: 1, vendor: 0 })).toBe('3')
  })
  it('shows no badge for zero', () => {
    expect(approvalsBadge({ w18: 0, w3: 0, vendor: 0 })).toBeNull()
  })
  it('shows no badge — not 0 — when a count failed and nothing else is known', () => {
    expect(approvalsBadge({ w18: null, w3: 0, vendor: 0 })).toBeNull()
    expect(approvalsBadge({ w18: null, w3: null, vendor: null })).toBeNull()
  })
  it('marks a partial count as a lower bound', () => {
    expect(approvalsBadge({ w18: 2, w3: null, vendor: 1 })).toBe('3+')
  })
  it('caps at 99+', () => {
    expect(approvalsBadge({ w18: 150, w3: 0, vendor: 0 })).toBe('99+')
  })
})
