import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn(async () => ({ error: null })),
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

/** The AI half is not under test in the suggestion cases; keep it quiet. */
beforeEach(() => {
  vi.mocked(generateBoardInsights).mockResolvedValue('[]')
})

describe('POST /api/ai/daily-digest', () => {
  it('returns 200 with the facts when the AI call fails', async () => {
    // An AI outage is not an error state: the card's real content is
    // deterministic, so a 503 here would blank a card that has everything
    // it needs to render.
    vi.mocked(generateDigestSuggestion).mockRejectedValueOnce(new Error('model down'))

    const response = await POST()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.suggestion).toBeNull()
    expect(Array.isArray(body.bullets)).toBe(true)
  })

  it('returns 200 with a null suggestion when the AI returns something too long', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('x'.repeat(500))

    const response = await POST()

    expect(response.status).toBe(200)
    expect((await response.json()).suggestion).toBeNull()
  })

  it('returns the suggestion when the AI answers normally', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')

    const response = await POST()

    expect(response.status).toBe(200)
    expect((await response.json()).suggestion).toBe('Start with the pond thread')
  })

  it('reports the long-waiting thread count in the bullets', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')

    const response = await POST()

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

    const body = await (await POST()).json()

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

    await POST()

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

    const body = await (await POST()).json()

    expect(body.insights).toEqual([])
    expect(generateBoardInsights).not.toHaveBeenCalled()
  })

  it('falls back to deterministic signals when the insight call fails', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockRejectedValueOnce(new Error('model down'))

    const response = await POST()

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

    const body = await (await POST()).json()

    expect(body.insights.length).toBeLessThanOrEqual(4)
  })

  it('ignores an insight for a signal that is not firing', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([{ kind: 'reserve_study_overdue', why: 'Invented out of thin air.' }]),
    )

    const body = await (await POST()).json()

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

    const body = await (await POST()).json()

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

    const body = await (await POST()).json()

    expect(body.insights[0].severity).toBe('red')
  })

  it('keeps the reds even when every model clause is rejected', async () => {
    // A model that writes four good insights but runs long on all of them
    // yields zero accepted entries. That must not blank the section.
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([{ kind: 'dues_overdue', why: 'x'.repeat(500) }]),
    )

    const body = await (await POST()).json()

    expect(body.insights.length).toBe(4)
    expect(body.insights[0].severity).toBe('red')
  })

  it('states the true unit count, not a display slice', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce('[]')

    const body = await (await POST()).json()

    const dues = body.insights.find((i: { kind: string }) => i.kind === 'dues_overdue')
    expect(dues.headline).toContain('22')
  })
})
