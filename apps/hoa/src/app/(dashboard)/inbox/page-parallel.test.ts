import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-099 static pass: on /inbox the SLA, assignee names, draft-quality and
// undo reads need neither the counts nor the page offset, so they start
// alongside the mailbox status and count reads instead of after them, and
// the user comes from the request-memoized getSignedInUser.

const h = vi.hoisted(() => {
  const state = {
    started: [] as string[],
    held: new Set<string>(),
    release: () => {},
    gate: Promise.resolve(),
    authGetUser: 0,
  }
  const reset = () => {
    state.started = []
    state.held = new Set()
    state.authGetUser = 0
    state.gate = new Promise<void>((r) => {
      state.release = r
    })
  }
  reset()
  const track =
    <T>(name: string, value: () => T) =>
    async (): Promise<Awaited<T>> => {
      state.started.push(name)
      if (state.held.has(name)) await state.gate
      return (await value()) as Awaited<T>
    }
  return { state, reset, track }
})

const UNDO = '22222222-2222-2222-2222-222222222222'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'board', org: { id: 'org-1', name: 'HOA' } })),
}))
vi.mock('@/lib/orgs', () => ({
  getSignedInUser: h.track('getSignedInUser', () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => ({}),
    auth: {
      getUser: async () => {
        h.state.authGetUser += 1
        return { data: { user: { id: 'user-1' } } }
      },
    },
  })),
}))
vi.mock('@/lib/inbox/queries', () => ({
  INBOX_PAGE_SIZE: 50,
  // No mailbox connected: the page's simplest complete render.
  getMailboxStatus: h.track('getMailboxStatus', () => null),
  countThreadsByStatus: h.track('countThreadsByStatus', () => ({ needs_review: 0, open: 0, all: 0 })),
  listThreads: h.track('listThreads', () => []),
  getDraftById: h.track('getDraftById', () => null),
  getPropertyContext: h.track('getPropertyContext', () => null),
}))
vi.mock('@/lib/inbox/waiting', async (orig) => ({
  ...(await orig<object>()),
  loadInboxSlaHours: h.track('loadInboxSlaHours', () => 48),
}))
vi.mock('@/lib/inbox/assignees', () => ({
  listAssignees: h.track('listAssignees', () => []),
}))
vi.mock('@/lib/inbox/draft/metrics-store', () => ({
  loadDraftQuality: h.track('loadDraftQuality', () => ({ summary: null })),
}))

const { default: InboxPage } = await import('./page')

async function settle() {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

beforeEach(() => h.reset())

describe('/inbox loads in parallel (BL-099)', () => {
  it('starts the SLA, assignee, draft-quality and undo reads while the counts are in flight', async () => {
    h.state.held.add('countThreadsByStatus')
    const page = InboxPage({ searchParams: Promise.resolve({ undo: UNDO }) })
    await settle()
    expect(h.state.started).toEqual(
      expect.arrayContaining([
        'getMailboxStatus',
        'countThreadsByStatus',
        'loadInboxSlaHours',
        'listAssignees',
        'loadDraftQuality',
        'getDraftById',
      ]),
    )
    h.state.release()
    expect(await page).toBeTruthy()
  })

  it('takes the user from the memoized getSignedInUser, not a second getUser', async () => {
    await InboxPage({ searchParams: Promise.resolve({}) })
    expect(h.state.started).toContain('getSignedInUser')
    expect(h.state.authGetUser).toBe(0)
  })
})
