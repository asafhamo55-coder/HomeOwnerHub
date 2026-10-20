import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-099 static pass: the thread page used to await ten stages one after
// another. Each test holds one loader open and checks that the loaders
// which do not need its result were already started.

const h = vi.hoisted(() => {
  const state = {
    started: [] as string[],
    held: new Set<string>(),
    release: () => {},
    gate: Promise.resolve(),
    railResidents: undefined as unknown,
  }
  const reset = () => {
    state.started = []
    state.held = new Set()
    state.gate = new Promise<void>((r) => {
      state.release = r
    })
  }
  reset()
  /** A loader mock: records that it started, waits on the gate when held. */
  const track =
    <T>(name: string, value: (...args: unknown[]) => T) =>
    async (...args: unknown[]): Promise<Awaited<T>> => {
      state.started.push(name)
      if (state.held.has(name)) await state.gate
      return (await value(...args)) as Awaited<T>
    }
  return { state, reset, track }
})

const THREAD = {
  id: '11111111-1111-1111-1111-111111111111',
  subject: 'Pool gate',
  status: 'open',
  unitId: null,
  vendorId: null,
  matchConfidence: 'none',
  matchReason: null,
  matchSource: 'none',
  lastDirection: 'inbound',
  lastMessageAt: '2026-10-19T12:00:00Z',
  messages: [],
}

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'board', org: { id: 'org-1', name: 'HOA' } })),
}))
vi.mock('@/lib/orgs', () => ({
  getSignedInUser: h.track('getSignedInUser', () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: () => ({}) })),
}))
vi.mock('@/lib/inbox/queries', () => ({
  INBOX_PAGE_SIZE: 50,
  getThreadDetail: h.track('getThreadDetail', () => THREAD),
  countThreadsByStatus: h.track('countThreadsByStatus', () => ({ needs_review: 1, open: 1, all: 1 })),
  listThreads: h.track('listThreads', () => []),
  getPropertyContext: h.track('getPropertyContext', () => null),
  getUnitLabel: h.track('getUnitLabel', () => null),
  getLatestDraft: h.track('getLatestDraft', () => null),
  getDraftById: h.track('getDraftById', () => null),
  listDraftAttachments: h.track('listDraftAttachments', () => []),
  listAttachableDocuments: h.track('listAttachableDocuments', () => []),
}))
vi.mock('@/lib/inbox/thread-context', () => ({
  getThreadRailContext: h.track('getThreadRailContext', async (...args: unknown[]) => {
    h.state.railResidents = await args[3]
    return null
  }),
}))
vi.mock('@/lib/inbox/vendor-request-links', () => ({
  getOutgoingVendorRequests: h.track('getOutgoingVendorRequests', () => []),
  getIncomingVendorRequest: h.track('getIncomingVendorRequest', () => null),
}))
vi.mock('@/lib/inbox/autodraft', () => ({
  loadAutoDraftDecision: h.track('loadAutoDraftDecision', () => ({ draft: null, version: null })),
}))
vi.mock('@/lib/inbox/assignees', () => ({
  listAssignees: h.track('listAssignees', () => []),
}))
vi.mock('@/lib/inbox/waiting', async (orig) => ({
  ...(await orig<object>()),
  loadInboxSlaHours: h.track('loadInboxSlaHours', () => 48),
}))

const { default: ThreadPage } = await import('./page')

async function settle() {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

function render() {
  return ThreadPage({
    params: Promise.resolve({ id: THREAD.id }),
    searchParams: Promise.resolve({ filter: 'open' }),
  })
}

beforeEach(() => h.reset())

describe('/inbox/[id] loads in parallel (BL-099)', () => {
  it('reads the user and the chip counts while the thread read is in flight', async () => {
    h.state.held.add('getThreadDetail')
    const page = render()
    await settle()
    expect(h.state.started).toEqual(
      expect.arrayContaining(['getThreadDetail', 'getSignedInUser', 'countThreadsByStatus']),
    )
    h.state.release()
    await page
  })

  it('starts the rail, library, vendor links and queue reads while the thread list is in flight', async () => {
    h.state.held.add('listThreads')
    const page = render()
    await settle()
    expect(h.state.started).toEqual(
      expect.arrayContaining([
        'getThreadRailContext',
        'listAttachableDocuments',
        'getOutgoingVendorRequests',
        'getIncomingVendorRequest',
        'loadAutoDraftDecision',
        'listAssignees',
        'loadInboxSlaHours',
        'getLatestDraft',
      ]),
    )
    h.state.release()
    await page
  })

  it('still renders, and the rail still gets the residents (none without a home)', async () => {
    const page = await render()
    expect(page).toBeTruthy()
    expect(h.state.railResidents).toBeNull()
  })
})
