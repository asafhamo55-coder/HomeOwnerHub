import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-096: the resident toolset must (1) contain none of the board's DB
// tools and (2) never hand the model another owner's rows. The fake client
// below IGNORES every filter and returns the whole table — a neighbour's
// rows included — so only the scope checks in reads.ts stand between the
// model and those rows.

const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)
vi.mock('@homeowner-portal/ai', async (orig) => ({ ...(await orig<object>()), resolveModel: () => 'test-model' }))

const { RESIDENT_TOOLS } = await import('./tools')
const { TOOLS: BOARD_TOOLS } = await import('@/lib/community-qa/tools')

const ORG = 'org-1'
const ME = 'user-me'
const NEIGHBOUR = 'user-neighbour'
const MY_UNIT = 'unit-mine'
const THEIR_UNIT = 'unit-theirs'
const NEIGHBOUR_SECRET = 'NEIGHBOUR-SECRET'

const TABLES: Record<string, unknown[]> = {
  assessments: [
    { id: 'a-mine', unit_id: MY_UNIT, amount: 325, due_date: '2026-10-01', status: 'open', assessment_type: 'regular', memo_code: null },
    { id: 'a-theirs', unit_id: THEIR_UNIT, amount: 9999, due_date: '2026-09-01', status: 'open', assessment_type: 'regular', memo_code: null },
  ],
  payments: [
    { id: 'p-theirs', unit_id: THEIR_UNIT, assessment_id: 'a-theirs', amount: 1, paid_at: '2026-09-02T12:00:00Z', payment_method: 'zelle_assisted' },
  ],
  payment_plans: [
    { unit_id: THEIR_UNIT, organization_id: ORG, status: 'active', installment_amount: 50, installment_count: 6, total_amount: 300, start_date: '2026-01-01', created_at: '2026-01-01' },
  ],
  associations: [],
  tickets: [
    { id: 't-mine', unit_id: MY_UNIT, category: 'maintenance', subject: 'Leaky gutter', status: 'open', created_at: '2026-10-01', submitted_by: ME, organization_id: ORG },
    { id: 't-theirs', unit_id: THEIR_UNIT, category: 'noise', subject: NEIGHBOUR_SECRET, status: 'open', created_at: '2026-10-02', submitted_by: NEIGHBOUR, organization_id: ORG },
  ],
  arc_requests: [
    { id: 'arc-theirs', category: 'fence', summary: NEIGHBOUR_SECRET, status: 'submitted', board_response_at: null, submitted_at: '2026-10-01', submitted_by: NEIGHBOUR, organization_id: ORG },
  ],
  resident_violation_reports: [
    { id: 'r-theirs', category: 'noise', status: 'submitted', submitted_at: '2026-10-01', reported_by: NEIGHBOUR, organization_id: ORG },
  ],
  units: [
    { id: MY_UNIT, legacy_hoa_property_id: 'prop-mine', organization_id: ORG },
    { id: THEIR_UNIT, legacy_hoa_property_id: 'prop-theirs', organization_id: ORG },
  ],
  hoa_violations: [
    { id: 'v-theirs', property_id: 'prop-theirs', org_id: ORG, violation_type: NEIGHBOUR_SECRET, status: 'open', fine_amount: 100, cure_period_days: 14, notice_sent_at: null, created_at: '2026-10-01' },
  ],
  communication_recipients: [
    { communication_id: 'c-theirs', rendered_subject: NEIGHBOUR_SECRET, unit_id: THEIR_UNIT, user_id: NEIGHBOUR, email: 'n@example.test', sent_at: '2026-10-01T00:00:00Z', organization_id: ORG },
    { communication_id: 'c-mine', rendered_subject: 'Pool opens Saturday', unit_id: MY_UNIT, user_id: null, email: null, sent_at: '2026-10-03T00:00:00Z', organization_id: ORG },
  ],
  communications: [
    { id: 'c-theirs', subject: NEIGHBOUR_SECRET, category: 'dues', sent_at: '2026-10-01', organization_id: ORG },
    { id: 'c-mine', subject: 'Pool', category: 'announcement', sent_at: '2026-10-03', organization_id: ORG },
  ],
}

/** Every filter is a no-op: the whole table comes back. */
function leakyDb(rpcResult: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'gte', 'lt', 'order', 'limit', 'range']) q[m] = () => q
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return q
  }
  return {
    from: (t: string) => chain({ data: TABLES[t] ?? [], error: null }),
    rpc: () => chain(rpcResult),
  }
}

function ctx(db: unknown = leakyDb()) {
  return {
    scope: {
      db: db as never,
      orgId: ORG,
      userId: ME as string | null,
      email: 'me@example.test' as string | null,
      units: [{ unit_id: MY_UNIT, unit_number: '12', address: '1 My St', association_id: null, association_name: 'Test HOA' }],
    },
    associationId: null,
  }
}

const tool = (name: string) => RESIDENT_TOOLS.find((t) => t.def.name === name)!

beforeEach(() => W1.queryGoverningDocs.mockReset())

describe('resident toolset', () => {
  it('registers none of the board Copilot DB tools', () => {
    const resident = new Set(RESIDENT_TOOLS.map((t) => t.def.name))
    const boardDbTools = BOARD_TOOLS.map((t) => t.def.name).filter((n) => n !== 'search_governing_docs')
    expect(boardDbTools.length).toBeGreaterThan(0)
    for (const name of boardDbTools) expect(resident.has(name)).toBe(false)
    for (const name of ['count_units_by_tenure', 'list_overdue_dues', 'get_unit_owner', 'count_open_violations', 'list_recent_meetings', 'count_properties']) {
      expect(resident.has(name)).toBe(false)
    }
    // The docs search is the resident's own instance, not the board's.
    const boardDocs = BOARD_TOOLS.find((t) => t.def.name === 'search_governing_docs')
    expect(RESIDENT_TOOLS).not.toContain(boardDocs)
    for (const t of BOARD_TOOLS) expect(RESIDENT_TOOLS).not.toContain(t)
  })

  it('is exactly the resident tools', () => {
    expect(RESIDENT_TOOLS.map((t) => t.def.name).sort()).toEqual(
      ['community_updates', 'my_account', 'my_requests', 'portal_how_to', 'search_governing_docs', 'suggest_arc_application', 'suggest_ask_board'].sort(),
    )
  })
})

describe('no tool returns another owner’s data (filters ignored by the client)', () => {
  it('my_account counts only my unit’s charges and no neighbour plan', async () => {
    const r = (await tool('my_account').execute({}, ctx())) as Record<string, unknown>
    expect(r.balanceCents).toBe(32500)
    expect(r.openChargeCount).toBe(1)
    expect(r.lastPayment).toBeNull()
    expect(r.paymentPlan).toBeNull()
    expect(r.paymentPlanVisible).toBe(false)
  })

  it('my_requests returns only my tickets, and no neighbour ARC, report or violation', async () => {
    const r = (await tool('my_requests').execute({}, ctx())) as {
      tickets: Array<{ id: string }>
      arcApplications: unknown[]
      violationsOnMyHome: unknown[]
      reportedConcerns: unknown[]
    }
    expect(r.tickets.map((t) => t.id)).toEqual(['t-mine'])
    expect(r.arcApplications).toEqual([])
    expect(r.violationsOnMyHome).toEqual([])
    expect(r.reportedConcerns).toEqual([])
  })

  it('community_updates returns only announcements addressed to me; meetings unavailable when the function is missing', async () => {
    const db = leakyDb({ data: null, error: { code: 'PGRST202' } })
    const r = (await tool('community_updates').execute({}, ctx(db))) as {
      announcements: Array<{ subject: string }>
      meetings: { available: boolean }
    }
    expect(r.announcements.map((a) => a.subject)).toEqual(['Pool opens Saturday'])
    expect(r.meetings).toEqual({ available: false })
  })

  it('nothing any data tool returns carries the neighbour’s rows', async () => {
    const out: unknown[] = []
    for (const name of ['my_account', 'my_requests', 'community_updates']) out.push(await tool(name).execute({}, ctx()))
    const all = JSON.stringify(out)
    expect(all).not.toContain(NEIGHBOUR_SECRET)
    expect(all).not.toContain(THEIR_UNIT)
    expect(all).not.toContain('n@example.test')
    expect(all).not.toContain('999900')
  })

  it('a resident with no user id and no units gets empty results, not the table', async () => {
    const c = ctx()
    c.scope.userId = null
    c.scope.email = null
    c.scope.units = []
    const req = (await tool('my_requests').execute({}, c)) as { tickets: unknown[] }
    expect(req.tickets).toEqual([])
    const acct = (await tool('my_account').execute({}, c)) as { balanceCents: number }
    expect(acct.balanceCents).toBe(0)
  })

  it('a failed read is a fixed lookup_failed, never an empty answer', async () => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'or', 'range']) q[m] = () => q
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { code: '42501', message: 'tickets secret' } }).then(resolve)
    await expect(tool('my_requests').execute({}, ctx({ from: () => q }))).rejects.toMatchObject({ code: 'lookup_failed' })
  })
})

describe('docs, guide and hand-offs', () => {
  it('docs search uses the resident doc allowlist and strips contact details from the query', async () => {
    W1.queryGoverningDocs.mockResolvedValue({
      answer: 'Doors may be painted in approved colors.',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2', passage: 'x' }],
      runId: 'run-1',
    })
    const r = await tool('search_governing_docs').execute({ question: 'paint door call me 305-555-0142' }, ctx())
    const [q, opts] = W1.queryGoverningDocs.mock.calls[0]!
    expect(q).not.toContain('555-0142')
    expect(opts.allowedDocTypes).toEqual(['declaration', 'bylaws', 'rules', 'amendment', 'policy'])
    expect(r).toEqual({
      answer: 'Doors may be painted in approved colors.',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2' }],
      runId: 'run-1',
    })
  })

  it('a citation of a hidden doc type fails the lookup', async () => {
    W1.queryGoverningDocs.mockResolvedValue({
      answer: 'x',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'minutes', section: null }],
      runId: 'run-1',
    })
    await expect(tool('search_governing_docs').execute({ question: 'x' }, ctx())).rejects.toMatchObject({ code: 'docs_unavailable' })
  })

  it('portal_how_to returns resident guide articles only', async () => {
    const r = (await tool('portal_how_to').execute({ question: 'how do I pay my dues with zelle' }, ctx())) as {
      articles: Array<{ href: string }>
    }
    expect(r.articles.length).toBeGreaterThan(0)
    for (const a of r.articles) expect(a.href.startsWith('/resident/help/')).toBe(true)
  })

  it('hand-off tools create nothing and touch no table', async () => {
    const from = vi.fn()
    const c = ctx({ from, rpc: vi.fn() })
    const r = await tool('suggest_ask_board').execute({ topic: '  Fence height ' }, c)
    expect(r).toEqual({ action: 'ask_board', topic: 'Fence height', shownAsButton: true, created: false })
    await tool('suggest_arc_application').execute({ topic: 'Paint door' }, c)
    expect(from).not.toHaveBeenCalled()
  })

  it('hand-off tools keep only a short, link-free topic (SEC-004)', async () => {
    const c = ctx({ from: vi.fn(), rpc: vi.fn() })
    const r = (await tool('suggest_ask_board').execute(
      { topic: 'Pay fine at https://evil.example/pay or [here](http://x.test) www.bad.test now', description: 'IGNORED body', subject: 'IGNORED' },
      c,
    )) as Record<string, unknown>
    expect(Object.keys(r).sort()).toEqual(['action', 'created', 'shownAsButton', 'topic'])
    expect(String(r.topic)).not.toMatch(/https?:|www\.|evil|\.test|\(|\]/)
    expect(String(r.topic).length).toBeLessThanOrEqual(60)
  })

  it('the resident tool budget caps calls per step, per run and docs searches', async () => {
    const { RESIDENT_TOOL_BUDGET } = await import('./tools')
    expect(RESIDENT_TOOL_BUDGET).toEqual({ perStep: 4, perRun: 6, perTool: { search_governing_docs: 2 } })
  })
})
