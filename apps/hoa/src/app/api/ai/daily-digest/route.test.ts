import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-104: the shared board AI ceiling is tested in lib/api/rate-limit.test.ts.
vi.mock('@/lib/api/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/rate-limit')>()),
  requireAiQuota: vi.fn(async () => ({ usageId: null, userId: 'user-1' })),
}))
vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
}))

// The board-only gate (0063). Admits by default; one case below refuses.
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, role: 'board', orgId: 'org-1' })),
}))

// Per-table upsert failures, so a test can force a write error with a
// message that must never reach the response or a log line.
//
// The session client models the REAL policy on dashboard_daily_snapshots
// (0038): SELECT for board/admin, no INSERT policy at all. A session-client
// write there is a 42501 for every caller, board included, which is the
// prod failure of 2026-10-21. Writes to it must go through the service
// role after the board gate, so the admin client below has its own errors.
const db = vi.hoisted(() => ({
  upsertError: {} as Record<string, { code: string; message: string } | undefined>,
  adminUpsertError: {} as Record<string, { code: string; message: string } | undefined>,
  adminUpserts: [] as Array<{ table: string; row: unknown; opts: unknown }>,
  sessionUpserts: [] as string[],
  user: { id: 'user-1' } as { id: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: db.user } })) },
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn(async () => {
        db.sessionUpserts.push(table)
        // No INSERT policy on this table for any session (0038).
        if (table === 'dashboard_daily_snapshots') {
          return {
            error: {
              code: '42501',
              message: 'new row violates row-level security policy for table "dashboard_daily_snapshots"',
            },
          }
        }
        return { error: db.upsertError[table] ?? null }
      }),
    })),
  })),
}))

vi.mock('@homeowner-portal/db', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/db')>()),
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      upsert: vi.fn(async (row: unknown, opts: unknown) => {
        db.adminUpserts.push({ table, row, opts })
        return { error: db.adminUpsertError[table] ?? null }
      }),
    })),
  })),
}))

// getApprovalsInbox / getNextMeeting resolve their own cookie-bound client,
// which does not exist outside a Next request. Mocked so this test exercises
// the route's own branching, not Next's request plumbing.
vi.mock('@/lib/dashboard/queries', () => ({
  getApprovalsInbox: vi.fn(async () => ({ items: [], totalCount: 3 })),
  getNextMeeting: vi.fn(async () => null),
  getAtRiskThisWeek: vi.fn(async () => ({
    items: [],
    totalCount: 3,
    counts: {
      duesOverdueUnits: 22,
      cureDeadlinesElapsed: 4,
      cureDeadlinesUpcoming: 0,
      coiExpiring: 2,
      coiExpired: 0,
    },
    failed: false,
  })),
  getStaleApprovalCount: vi.fn(async () => ({ count: 25, failed: false })),
  getLeaseSummary: vi.fn(async () => ({
    hasAssociation: true,
    capPct: 15,
    totalUnits: 100,
    leasedCount: 15,
    leasedPct: 15,
    headroom: 0,
    waitingListCount: 2,
    capIsMixed: false,
    failed: false,
  })),
  getResidentQueueCounts: vi.fn(async () => ({
    openTickets: 20,
    pendingArcRequests: 5,
    openConcerns: 2,
    failed: false,
  })),
}))

vi.mock('@/lib/dashboard/charts', () => ({
  getDashboardKpis: vi.fn(async () => ({
    duesOutstandingUsd: { value: 4200, previous: null },
    openViolations: { value: 0, previous: null },
    activeVendors: { value: 0, previous: null },
    openTickets: { value: 0, previous: null },
    failed: false,
  })),
}))

vi.mock('@/lib/dashboard/triage', () => ({
  ACTIVE_STATUSES: ['needs_review', 'open'],
  getTriageSnapshot: vi.fn(async () => ({
    needsReply: { count: 32, oldestWaitingDays: 6 },
    untriaged: { count: 365 },
    threads: [
      { id: 't1', subject: 'Pond', lastMessageAt: '2026-07-27T12:00:00Z', waitingDays: 6 },
    ],
    failed: false,
  })),
}))

vi.mock('@homeowner-portal/ai', async () => {
  const actual = await vi.importActual<typeof import('@homeowner-portal/ai')>(
    '@homeowner-portal/ai',
  )
  return { ...actual, generateDigestSuggestion: vi.fn(), generateBoardInsights: vi.fn() }
})

import { POST } from './route'
import { generateBoardInsights, generateDigestSuggestion } from '@homeowner-portal/ai'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@homeowner-portal/db'

/** The AI half is not under test in the suggestion cases; keep it quiet. */
beforeEach(() => {
  vi.mocked(generateBoardInsights).mockResolvedValue('[]')
  vi.mocked(generateDigestSuggestion).mockClear()
  db.upsertError = {}
  db.adminUpsertError = {}
  db.adminUpserts = []
  db.sessionUpserts = []
  db.user = { id: 'user-1' }
  vi.mocked(createAdminClient).mockClear()
})

const req = () => new Request('http://x/api/ai/daily-digest', { method: 'POST' })

/** Everything the route logged, flattened, for "no raw text" assertions. */
function logged(spy: { mock: { calls: unknown[][] } }): string {
  return JSON.stringify(spy.mock.calls)
}

describe('POST /api/ai/daily-digest conventions (RC-1, RC-2, RC-6, RC-10)', () => {
  it('answers a resident with the 403 envelope', async () => {
    vi.mocked(requireBoardOrAdminForAction).mockResolvedValueOnce({
      ok: false,
      error: 'Only board members and admins can make this change.',
    })

    const response = await POST(req())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'forbidden', message: 'Only board members and admins can make this change.' },
    })
  })

  it('answers a signed-in caller with no HOA org with 403 forbidden / no_org', async () => {
    vi.mocked(requireBoardOrAdminForAction).mockResolvedValueOnce({
      ok: false,
      error: 'You are not signed in to an organization.',
    })

    const response = await POST(req())

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.code).toBe('forbidden')
    expect(body.error.reason).toBe('no_org')
  })

  it('answers a signed-out caller with 401 unauthenticated', async () => {
    vi.mocked(requireBoardOrAdminForAction).mockResolvedValueOnce({
      ok: false,
      error: 'You are not signed in to an organization.',
    })
    db.user = null

    const response = await POST(req())

    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('unauthenticated')
  })

  it('turns a thrown dashboard query into the generic JSON 500, not a framework error', async () => {
    const { getApprovalsInbox } = await import('@/lib/dashboard/queries')
    vi.mocked(getApprovalsInbox).mockRejectedValueOnce(
      new Error('relation "approvals" does not exist at row 7'),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(req())

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({
      error: { code: 'internal', message: 'Something went wrong on our side. Try again in a moment.' },
    })
    expect(logged(spy)).not.toContain('does not exist')
    spy.mockRestore()
  })

  it('fails with the generic 500 when the digest upsert fails, and never logs its message', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    db.upsertError.hoa_digests = { code: '42501', message: 'new row violates policy for jane@x.test' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(req())

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain('violates')
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(logged(spy)).not.toContain('jane@x.test')
    expect(logged(spy)).toContain('42501')
    spy.mockRestore()
  })

  it('fails with the generic 500 when the snapshot write fails, and never logs its message', async () => {
    db.adminUpsertError.dashboard_daily_snapshots = {
      code: '23514',
      message: 'check constraint violated by value 4200',
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(req())

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain('constraint')
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(logged(spy)).not.toContain('violated by value')
    // Failing before the model calls means a broken DB does not also bill
    // two model requests.
    expect(generateDigestSuggestion).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a success body carries no error key', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')

    const body = await (await POST(req())).json()

    expect(body).not.toHaveProperty('error')
    expect(Object.keys(body).sort()).toEqual(['bullets', 'generatedAt', 'insights', 'suggestion'])
  })
})

// Prod, 2026-10-21: every board/admin Refresh was a 500 with
// `[api:daily-digest.snapshot] failed { errorCode: '42501' }`. The snapshot
// was written with the caller's session, and dashboard_daily_snapshots has
// no INSERT policy (0038: "writes go through the service role"). The board
// gate had already passed, so this was never a role problem.
describe('POST /api/ai/daily-digest snapshot write (42501 regression)', () => {
  it('a board member gets 200, not the 42501 500, and the snapshot is written', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(req())

    expect(response.status).toBe(200)
    expect(logged(spy)).not.toContain('42501')
    expect(db.adminUpserts.map((u) => u.table)).toEqual(['dashboard_daily_snapshots'])
    spy.mockRestore()
  })

  it('scopes the service-role write to the org the gate returned, first write wins', async () => {
    await POST(req())

    const [write] = db.adminUpserts
    expect(write.row).toMatchObject({ organization_id: 'org-1', counts: { needsReply: 32 } })
    expect(write.opts).toEqual({
      onConflict: 'organization_id,captured_on',
      ignoreDuplicates: true,
    })
  })

  it('never writes the snapshot through the session client', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')

    await POST(req())

    // The session still writes hoa_digests (board write policy, 0063) and
    // still READS the baseline; it never writes the snapshot.
    expect(db.sessionUpserts).toEqual(['hoa_digests'])
  })

  it('never builds the service-role client for a resident', async () => {
    vi.mocked(requireBoardOrAdminForAction).mockResolvedValueOnce({
      ok: false,
      error: 'Only board members and admins can make this change.',
    })

    const response = await POST(req())

    expect(response.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(db.adminUpserts).toEqual([])
  })

  it('never builds the service-role client when the session org disagrees with the gate', async () => {
    const { getCurrentOrg } = await import('@/lib/orgs')
    vi.mocked(getCurrentOrg).mockResolvedValueOnce({ id: 'org-2', name: 'Other' } as never)

    const response = await POST(req())

    expect(response.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('POST /api/ai/daily-digest', () => {
  it('refuses a resident with 403 before reading or writing anything', async () => {
    vi.mocked(requireBoardOrAdminForAction).mockResolvedValueOnce({
      ok: false,
      error: 'Only board members and admins can make this change.',
    })
    vi.mocked(getSupabaseServerClient).mockClear()

    const response = await POST(req())

    expect(response.status).toBe(403)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
    expect(generateDigestSuggestion).not.toHaveBeenCalled()
  })

  it('returns 200 with the facts when the AI call fails', async () => {
    // An AI outage is not an error state: the card's real content is
    // deterministic, so a 503 here would blank a card that has everything
    // it needs to render.
    vi.mocked(generateDigestSuggestion).mockRejectedValueOnce(new Error('model down'))

    const response = await POST(req())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.suggestion).toBeNull()
    expect(Array.isArray(body.bullets)).toBe(true)
  })

  it('returns 200 with a null suggestion when the AI returns something too long', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('x'.repeat(500))

    const response = await POST(req())

    expect(response.status).toBe(200)
    expect((await response.json()).suggestion).toBeNull()
  })

  it('returns the suggestion when the AI answers normally', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')

    const response = await POST(req())

    expect(response.status).toBe(200)
    expect((await response.json()).suggestion).toBe('Start with the pond thread')
  })

  it('reports the long-waiting thread count in the bullets', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')

    const response = await POST(req())

    const body = await response.json()
    expect(body.bullets).toContain('1 has now waited over 3 days')
  })
})

describe('POST /api/ai/daily-digest board insights', () => {
  it('renders our headline, link and severity even when the model supplies its own', async () => {
    // The adversarial case: a model that returns a full-looking insight
    // object. Everything the board reads as fact must still come from our
    // query — the model contributes one clause and nothing else.
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([
        {
          kind: 'dues_overdue',
          why: 'Collections are slipping ahead of the budget vote.',
          headline: '2 units are behind on dues',
          href: 'https://evil.example/phish',
          severity: 'info',
        },
      ]),
    )

    const body = await (await POST(req())).json()

    const insight = body.insights.find((i: { kind: string }) => i.kind === 'dues_overdue')
    expect(insight.headline).toContain('22')
    expect(insight.href).toBe('/dues')
    expect(insight.severity).toBe('red')
    expect(insight.why).toBe('Collections are slipping ahead of the budget vote.')
  })

  it('sends the model only a kind and a headline', async () => {
    // Nothing pinned the OUTBOUND half: handing the model href/severity
    // invites it to echo them back as if authoritative.
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce('[]')

    await POST(req())

    const sent = vi.mocked(generateBoardInsights).mock.calls.at(-1)![0].signals
    expect(sent.length).toBeGreaterThan(0)
    for (const signal of sent) {
      expect(Object.keys(signal).sort()).toEqual(['headline', 'kind'])
    }
  })

  it('does not call the model at all for a community with nothing firing', async () => {
    const { getAtRiskThisWeek, getLeaseSummary, getResidentQueueCounts, getStaleApprovalCount } =
      await import('@/lib/dashboard/queries')
    const { getDashboardKpis } = await import('@/lib/dashboard/charts')
    const { getTriageSnapshot } = await import('@/lib/dashboard/triage')

    vi.mocked(getAtRiskThisWeek).mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      counts: {
        duesOverdueUnits: 0,
        cureDeadlinesElapsed: 0,
        cureDeadlinesUpcoming: 0,
        coiExpiring: 0,
        coiExpired: 0,
      },
      failed: false,
    })
    vi.mocked(getStaleApprovalCount).mockResolvedValueOnce({ count: 0, failed: false })
    vi.mocked(getLeaseSummary).mockResolvedValueOnce({
      hasAssociation: true,
      capPct: 15,
      totalUnits: 100,
      leasedCount: 2,
      leasedPct: 2,
      headroom: 13,
      waitingListCount: 0,
      capIsMixed: false,
      failed: false,
    })
    vi.mocked(getResidentQueueCounts).mockResolvedValueOnce({
      openTickets: 0,
      pendingArcRequests: 0,
      openConcerns: 0,
      failed: false,
    })
    vi.mocked(getDashboardKpis).mockResolvedValueOnce({
      duesOutstandingUsd: { value: 100, previous: 100 },
      openViolations: { value: 0, previous: 0 },
      activeVendors: { value: 0, previous: 0 },
      openTickets: { value: 0, previous: 0 },
      failed: false,
    })
    vi.mocked(getTriageSnapshot).mockResolvedValueOnce({
      needsReply: { count: 0, oldestWaitingDays: null },
      untriaged: { count: 0 },
      threads: [],
      failed: false,
    })
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('All quiet')
    vi.mocked(generateBoardInsights).mockClear()

    const body = await (await POST(req())).json()

    expect(body.insights).toEqual([])
    expect(generateBoardInsights).not.toHaveBeenCalled()
  })

  it('falls back to deterministic signals when the insight call fails', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockRejectedValueOnce(new Error('model down'))

    const response = await POST(req())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.insights.length).toBe(4)
    expect(body.insights.every((i: { why: string | null }) => i.why === null)).toBe(true)
    // Most severe first, so a fallback still leads with what is on fire.
    expect(body.insights[0].severity).toBe('red')
  })

  it('never returns more than four insights', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce('[]')

    const body = await (await POST(req())).json()

    expect(body.insights.length).toBeLessThanOrEqual(4)
  })

  it('ignores an insight for a signal that is not firing', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([{ kind: 'reserve_study_overdue', why: 'Invented out of thin air.' }]),
    )

    const body = await (await POST(req())).json()

    expect(
      body.insights.some((i: { kind: string }) => i.kind === 'reserve_study_overdue'),
    ).toBe(false)
  })
})

describe('POST /api/ai/daily-digest insight safety', () => {
  it('never lets the model delete a red finding', async () => {
    // The model is allowed to select and explain. It is NOT allowed to
    // decide the board should not hear about an elapsed cure deadline
    // because it found the lease waiting list more interesting.
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([{ kind: 'waiting_list', why: 'Owners are queued behind the cap.' }]),
    )

    const body = await (await POST(req())).json()

    const kinds = body.insights.map((i: { kind: string }) => i.kind)
    expect(kinds).toContain('dues_overdue')
    expect(kinds).toContain('cure_deadline')
    expect(kinds).toContain('stale_approvals')
  })

  it('shows red findings before the model\'s own ordering', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([
        { kind: 'waiting_list', why: 'Owners are queued behind the cap.' },
        { kind: 'dues_overdue', why: 'Collections are slipping before the vote.' },
      ]),
    )

    const body = await (await POST(req())).json()

    expect(body.insights[0].severity).toBe('red')
  })

  it('keeps the reds even when every model clause is rejected', async () => {
    // A model that writes four good insights but runs long on all of them
    // yields zero accepted entries. That must not blank the section.
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([{ kind: 'dues_overdue', why: 'x'.repeat(500) }]),
    )

    const body = await (await POST(req())).json()

    expect(body.insights.length).toBe(4)
    expect(body.insights[0].severity).toBe('red')
  })

  it('states the true unit count, not a display slice', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce('[]')

    const body = await (await POST(req())).json()

    const dues = body.insights.find((i: { kind: string }) => i.kind === 'dues_overdue')
    expect(dues.headline).toContain('22')
  })
})
