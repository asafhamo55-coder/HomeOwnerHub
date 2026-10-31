import { beforeEach, describe, expect, it, vi } from 'vitest'

const UUID = '11111111-1111-4111-8111-111111111111'
const RAW = 'duplicate key value violates unique constraint "secret_table_pkey"'

const h = vi.hoisted(() => ({ report: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: h.report }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'HOA', hub_type: 'hoa' })) }))
vi.mock('@/lib/resident', () => ({
  getResidentUnits: vi.fn(async () => [{ unit_id: UUID, association_id: 'assoc-1' }]),
}))
vi.mock('@/lib/impersonation', () => ({
  getResidentActor: vi.fn(async () => ({ impersonating: false })),
  IMPERSONATION_READONLY_MSG: 'read only',
}))
vi.mock('@/lib/arc-review/server', () => ({ startBoardArcReview: vi.fn(), closeArcReviewsOnWithdraw: vi.fn() }))
vi.mock('@/lib/arc-review/precheck-binding', () => ({ bindPrecheckRun: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const res = { data: null, error: { code: '23505', message: RAW } }
    const q: Record<string, unknown> = {}
    for (const m of ['insert', 'update', 'select', 'eq', 'in', 'is', 'order', 'limit']) q[m] = () => q
    q.single = async () => res
    q.maybeSingle = async () => res
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok)
    return { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }, from: () => q }
  }),
}))

const subs = await import('./resident-submissions')
const tix = await import('./resident-tickets')

const FRIENDLY = 'Couldn’t send. Try again, or message the board.'
const BODY = 'A message that is long enough.'

const cases: Array<[string, () => Promise<unknown>]> = [
  [
    'createArcRequest',
    () =>
      subs.createArcRequest({
        unitId: UUID,
        category: 'fence',
        summary: 'Replace rear fence',
        scopeDescription: 'Six foot white vinyl privacy fence on the rear line.',
      } as never),
  ],
  ['addArcMessage', () => subs.addArcMessage(UUID, BODY)],
  ['withdrawMyArcRequest', () => subs.withdrawMyArcRequest(UUID)],
  [
    'createViolationReport',
    () =>
      subs.createViolationReport({
        unitId: UUID,
        aboutAddress: '1 Main St',
        category: 'noise',
        description: 'Loud music every night after midnight.',
      } as never),
  ],
  ['addViolationReportMessage', () => subs.addViolationReportMessage(UUID, BODY)],
  [
    'createTicket',
    () =>
      tix.createTicket({
        unitId: UUID,
        category: 'maintenance',
        subject: 'Gate latch',
        description: 'The pool gate latch is sticking and will not close.',
      }),
  ],
  ['addTicketMessage', () => tix.addTicketMessage(UUID, BODY)],
]

describe('resident writes hide database errors', () => {
  beforeEach(() => h.report.mockClear())
  it.each(cases)('%s returns friendly text and reports the real error', async (name, run) => {
    const r = await run()
    expect(r).toEqual({ ok: false, error: FRIENDLY })
    expect(JSON.stringify(r)).not.toContain('secret_table')
    expect(h.report).toHaveBeenCalledTimes(1)
    const [err, where, ctx] = h.report.mock.calls[0]
    expect(where).toBe('resident-action')
    expect(ctx).toEqual({ action: name, code: '23505' })
    expect(String((err as Error).message)).not.toContain('secret_table')
  })
})
