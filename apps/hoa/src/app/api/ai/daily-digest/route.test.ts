import { describe, expect, it, vi } from 'vitest'

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
  return { ...actual, generateDigestSuggestion: vi.fn() }
})

import { POST } from './route'
import { generateDigestSuggestion } from '@homeowner-portal/ai'

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
