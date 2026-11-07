import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hasEq, type Recorded } from './test-utils/fake-supabase'

// Board-side reads that used to rely on row-level security alone. For a
// person in several orgs RLS lets every org's rows through, so each read
// must name the ACTIVE org itself. One test per fixed read.

const ORG = 'org-active'

const h = vi.hoisted(() => ({ queries: [] as Recorded[] }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/dashboard/cached', () => ({ DASHBOARD_TAG_ALL: 'all' }))
vi.mock('next/navigation', () => ({
  unstable_rethrow: (e: unknown) => {
    throw e
  },
  redirect: vi.fn(),
  notFound: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'admin', org: { id: 'org-active' } })),
  getCurrentUserRoleInOrg: vi.fn(async () => 'admin'),
}))
vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => ({ id: 'org-active', name: 'Active', hub_type: 'hoa', plan: 'pro', doors_count: 1 })),
}))
vi.mock('@/lib/resident-notify/notify', () => ({ notifyResidentAfterResponse: vi.fn() }))
vi.mock('@/lib/review-reminders', () => ({ closeReviewsWithoutDecision: vi.fn(), recordBoardDecisionOnReview: vi.fn() }))
vi.mock('@/lib/arc-review/record', () => ({ closeReviewsWithoutDecision: vi.fn(), recordBoardDecisionOnReview: vi.fn() }))
vi.mock('@/lib/primary-association', () => ({
  getPrimaryAssociationResult: vi.fn(async () => ({ ok: true, association: null })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const { client, queries } = fakeSupabase(() => ({ data: null, error: null }))
    return {
      ...client,
      from(table: string) {
        const b = client.from(table)
        h.queries.push(queries[queries.length - 1])
        return b
      },
    }
  }),
}))

import {
  countArcOverdueCompletion,
  countViolationReportsByStatus,
  getArcRequestForBoard,
  getResidentViolationReportForBoard,
  listArcRequestsForBoard,
  listResidentViolationReportsForBoard,
  readArcStatusRows,
} from './board-review'
import { getEvent, listEvents, loadEvent, loadEvents } from './events'
import { getRfp, listRfpsResult } from './rfps'
import { getBid, listBidsForRfpResult } from './bids'
import { getTicketForBoard, listTicketActionItems, listTicketsForBoard } from './tickets'
import { listUnfinishedDrafts, loadDraft } from './drafts'
import { getVendor } from './vendors'
import { getPropertyDetail } from './properties'

beforeEach(() => {
  h.queries = []
})

function read(table: string, nth = 0): Recorded {
  const hits = h.queries.filter((q) => q.table === table)
  expect(hits.length, `no ${table} read`).toBeGreaterThan(nth)
  return hits[nth]
}

describe('ARC requests (board) carry organization_id', () => {
  it('list', async () => {
    await listArcRequestsForBoard({})
    expect(hasEq(read('arc_requests'), 'organization_id', ORG)).toBe(true)
  })
  it('overdue count', async () => {
    await countArcOverdueCompletion('2026-11-07')
    expect(hasEq(read('arc_requests'), 'organization_id', ORG)).toBe(true)
  })
  it('status rows behind the chips', async () => {
    await readArcStatusRows()
    expect(hasEq(read('arc_requests'), 'organization_id', ORG)).toBe(true)
  })
  it('one request by id', async () => {
    await getArcRequestForBoard('arc-1')
    const q = read('arc_requests')
    expect(hasEq(q, 'id', 'arc-1')).toBe(true)
    expect(hasEq(q, 'organization_id', ORG)).toBe(true)
  })
})

describe('tickets (board) carry organization_id', () => {
  it('one ticket by id', async () => {
    await getTicketForBoard('t-1')
    const q = read('tickets')
    expect(hasEq(q, 'id', 't-1')).toBe(true)
    expect(hasEq(q, 'organization_id', ORG)).toBe(true)
  })
  it('the list and all three status counts', async () => {
    await listTicketsForBoard({ page: 1, pageSize: 25 } as never)
    const reads = h.queries.filter((q) => q.table === 'tickets')
    expect(reads.length).toBeGreaterThanOrEqual(4)
    for (const q of reads.filter((r) => r.ops.some(([m]) => m === 'select' && true))) {
      // every tickets read that is a list or a count (the open-ticket paging reads already filtered)
      expect(hasEq(q, 'organization_id', ORG), JSON.stringify(q.ops.slice(0, 3))).toBe(true)
    }
  })
  it('action items linked to a ticket', async () => {
    await listTicketActionItems('t-1').catch(() => undefined)
    const q = read('meeting_action_items')
    expect(hasEq(q, 'ticket_id', 't-1')).toBe(true)
    expect(hasEq(q, 'org_id', ORG)).toBe(true)
  })
})

describe('wizard drafts carry org_id', () => {
  it('unfinished list', async () => {
    await listUnfinishedDrafts()
    expect(hasEq(read('wizard_drafts'), 'org_id', ORG)).toBe(true)
  })
  it('one draft by id', async () => {
    await loadDraft('d-1')
    const q = read('wizard_drafts')
    expect(hasEq(q, 'id', 'd-1')).toBe(true)
    expect(hasEq(q, 'org_id', ORG)).toBe(true)
  })
})

describe('vendor and property detail carry the org', () => {
  it('getVendor', async () => {
    await getVendor('v-1')
    const q = read('vendors')
    expect(hasEq(q, 'id', 'v-1')).toBe(true)
    expect(hasEq(q, 'organization_id', ORG)).toBe(true)
  })
  it('getPropertyDetail', async () => {
    await getPropertyDetail('p-1')
    const q = read('hoa_properties')
    expect(hasEq(q, 'id', 'p-1')).toBe(true)
    expect(hasEq(q, 'org_id', ORG)).toBe(true)
  })
})

describe('events, RFPs, bids and resident reports (board) carry the org', () => {
  it('events: list, load, get and loadEvent', async () => {
    await listEvents()
    await loadEvents()
    await getEvent('e-1')
    await loadEvent('e-1')
    const reads = h.queries.filter((q) => q.table === 'hoa_recurring_events')
    expect(reads).toHaveLength(4)
    for (const q of reads) expect(hasEq(q, 'organization_id', ORG)).toBe(true)
  })
  it('rfps: list and one', async () => {
    await listRfpsResult()
    await getRfp('r-1')
    const reads = h.queries.filter((q) => q.table === 'rfps')
    expect(reads.length).toBeGreaterThanOrEqual(2)
    for (const q of reads) expect(hasEq(q, 'organization_id', ORG)).toBe(true)
  })
  it('bids: for an rfp, and one', async () => {
    await listBidsForRfpResult('r-1')
    await getBid('b-1')
    const reads = h.queries.filter((q) => q.table === 'bids')
    expect(reads).toHaveLength(2)
    for (const q of reads) expect(hasEq(q, 'organization_id', ORG)).toBe(true)
  })
  it('resident violation reports: list, counts, one', async () => {
    await listResidentViolationReportsForBoard()
    await countViolationReportsByStatus()
    await getResidentViolationReportForBoard('rv-1').catch(() => undefined)
    const reads = h.queries.filter((q) => q.table === 'resident_violation_reports')
    expect(reads).toHaveLength(3)
    for (const q of reads) expect(hasEq(q, 'organization_id', ORG)).toBe(true)
  })
})
