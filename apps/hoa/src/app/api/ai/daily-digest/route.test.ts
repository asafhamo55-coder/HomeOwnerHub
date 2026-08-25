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
    items: [
      { kind: 'dues_overdue', id: 'a', title: 'x', severity: 'red', daysOffset: -45, href: '/x' },
      { kind: 'cure_deadline', id: 'b', title: 'y', severity: 'red', daysOffset: -2, href: '/y' },
      { kind: 'coi_expiring', id: 'c', title: 'z', severity: 'amber', daysOffset: 9, href: '/z' },
    ],
    totalCount: 3,
  })),
  getLeaseSummary: vi.fn(async () => ({
    hasAssociation: true,
    capPct: 15,
    totalUnits: 100,
    leasedCount: 15,
    leasedPct: 15,
    headroom: 0,
    waitingListCount: 2,
    capIsMixed: false,
  })),
  getResidentQueueCounts: vi.fn(async () => ({
    openTickets: 20,
    pendingArcRequests: 5,
    openConcerns: 2,
  })),
}))

vi.mock('@/lib/dashboard/charts', () => ({
  getDashboardKpis: vi.fn(async () => ({
    duesOutstandingUsd: { value: 4200, previous: null },
    openViolations: { value: 0, previous: null },
    activeVendors: { value: 0, previous: null },
    openTickets: { value: 0, previous: null },
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
  it('renders our headline and link, never the model\'s', async () => {
    // The model is given a kind and returns a kind. Everything the board
    // reads as fact — the count, the link — comes from our own query.
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')
    vi.mocked(generateBoardInsights).mockResolvedValueOnce(
      JSON.stringify([
        { kind: 'untriaged_mail', why: 'Unmapped mail hides owner complaints from the board.' },
      ]),
    )

    const body = await (await POST()).json()

    const insight = body.insights.find((i: { kind: string }) => i.kind === 'untriaged_mail')
    expect(insight.headline).toContain('365')
    expect(insight.href).toBe('/inbox')
    expect(insight.why).toBe('Unmapped mail hides owner complaints from the board.')
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
