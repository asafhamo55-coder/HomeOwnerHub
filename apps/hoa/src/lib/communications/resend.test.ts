import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-109: resendFailedRecipients against a recording fake client. A row the
 * outbound safety guard holds back on retry becomes `suppressed` (never
 * offered again), and a parent whose every remaining row is held reads
 * `cancelled` ("Held by safety guard (N)"), not `failed`.
 *
 * No real email or database: the batch sender and the client are fakes.
 */

const h = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; payload: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  results: [] as Array<{ ok: true; messageId: string } | { ok: false; error: string }>,
  failedRows: [] as Array<{ id: string; email: string | null; recipient_name: string | null; unit_id: string | null }>,
  allRows: [] as Array<{ delivery_status: string; error_message: string | null }>,
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: async () => ({ org: { id: 'org-1' } }) }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => ({ ok: true }),
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => null }))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({ fetchOrgSandbox: async () => false }))
vi.mock('@/lib/email', () => ({
  sendEmailBatch: async (payloads: unknown[]) => payloads.map((_, i) => h.results[i]),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => fakeClient() }))

function fakeClient() {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      let payload: Record<string, unknown> | null = null
      const resolve = (): { data: unknown; error: unknown } => {
        if (payload) {
          h.writes.push({ table, payload, filters })
          return { data: null, error: null }
        }
        if (table === 'communications') {
          return {
            data: { id: 'comm-1', association_id: 'assoc-1', subject: 'Pool closed', body_html: '<p>Pool closed</p>', body_text: 'Pool closed' },
            error: null,
          }
        }
        if (table === 'associations') return { data: { name: 'Maple Court', type: 'hoa' }, error: null }
        if (table === 'communication_recipients') {
          const failedOnly = filters.some(([c, v]) => c === 'delivery_status' && v === 'failed')
          return { data: failedOnly ? h.failedRows : h.allRows, error: null }
        }
        return { data: null, error: null }
      }
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.update = (p: Record<string, unknown>) => ((payload = p), b)
      for (const op of ['eq', 'is', 'in', 'not']) {
        b[op] = (col: string, v: unknown) => (filters.push([col, v]), b)
      }
      b.limit = () => b
      b.maybeSingle = async () => resolve()
      b.single = async () => resolve()
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad)
      return b
    },
  }
}

const { OUTBOUND_BLOCKED_ERROR } = await import('@homeowner-portal/observability/send-status')
const { resendFailedRecipients } = await import('./send')

const ROWS = [
  { id: 'rec-1', email: 'a@example.test', recipient_name: 'A', unit_id: null },
  { id: 'rec-2', email: 'b@example.test', recipient_name: 'B', unit_id: null },
]

const recipientWrites = () => h.writes.filter((w) => w.table === 'communication_recipients')
const parentWrites = () => h.writes.filter((w) => w.table === 'communications')

beforeEach(() => {
  h.writes = []
  h.failedRows = ROWS
})

describe('resendFailedRecipients — guard-held rows (BL-109)', () => {
  it('all held: rows become suppressed (never retried again), parent failed → cancelled', async () => {
    h.results = [
      { ok: false, error: OUTBOUND_BLOCKED_ERROR },
      { ok: false, error: OUTBOUND_BLOCKED_ERROR },
    ]
    h.allRows = [
      { delivery_status: 'suppressed', error_message: OUTBOUND_BLOCKED_ERROR },
      { delivery_status: 'suppressed', error_message: OUTBOUND_BLOCKED_ERROR },
    ]
    const r = await resendFailedRecipients('comm-1')
    expect(r).toEqual({ ok: true, sentCount: 0, failedCount: 0, heldCount: 2 })
    expect(recipientWrites().map((w) => w.payload.delivery_status)).toEqual(['suppressed', 'suppressed'])
    expect(recipientWrites().every((w) => w.payload.error_message === OUTBOUND_BLOCKED_ERROR && w.payload.failed_at === null)).toBe(true)
    // Org filter on every write off a client-supplied id.
    expect(recipientWrites().every((w) => w.filters.some(([c, v]) => c === 'organization_id' && v === 'org-1'))).toBe(true)
    expect(parentWrites()).toHaveLength(1)
    expect(parentWrites()[0].payload).toEqual({ status: 'cancelled' })
    // Only lifts a parent that is currently failed.
    expect(parentWrites()[0].filters).toContainEqual(['status', 'failed'])
  })

  it('mixed held + delivered: parent failed → sent', async () => {
    h.results = [
      { ok: true, messageId: 'm-1' },
      { ok: false, error: OUTBOUND_BLOCKED_ERROR },
    ]
    const r = await resendFailedRecipients('comm-1')
    expect(r).toEqual({ ok: true, sentCount: 1, failedCount: 0, heldCount: 1 })
    expect(recipientWrites().map((w) => w.payload.delivery_status).sort()).toEqual(['sent', 'suppressed'])
    expect(parentWrites().map((w) => w.payload)).toEqual([{ status: 'sent' }])
  })

  it('held, but a real failure remains elsewhere (an SMS row): parent stays failed', async () => {
    h.failedRows = [ROWS[0]]
    h.results = [{ ok: false, error: OUTBOUND_BLOCKED_ERROR }]
    h.allRows = [
      { delivery_status: 'suppressed', error_message: OUTBOUND_BLOCKED_ERROR },
      { delivery_status: 'failed', error_message: 'carrier rejected' },
    ]
    const r = await resendFailedRecipients('comm-1')
    expect(r).toMatchObject({ ok: true, heldCount: 1, failedCount: 0 })
    expect(parentWrites()).toHaveLength(0)
  })

  it('a real provider failure stays failed and is offered for retry again', async () => {
    h.results = [
      { ok: false, error: 'Too many requests' },
      { ok: false, error: 'Too many requests' },
    ]
    const r = await resendFailedRecipients('comm-1')
    expect(r).toEqual({ ok: true, sentCount: 0, failedCount: 2, heldCount: 0 })
    expect(recipientWrites().map((w) => w.payload.delivery_status)).toEqual(['failed', 'failed'])
    expect(parentWrites()).toHaveLength(0)
  })
})
