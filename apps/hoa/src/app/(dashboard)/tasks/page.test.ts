import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-119: /tasks is board/admin only. A resident (or anyone not board/admin)
// gets a 404 before any task, meeting or member is read.

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  reads: [] as string[],
  memberReads: 0,
  rows: [] as unknown[],
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('@/lib/orgs', () => ({ getSignedInUser: vi.fn(async () => ({ id: 'u-1' })) }))
vi.mock('@/lib/association-time-current', () => ({ currentTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/perf/timing', () => ({ timed: (_r: string, _k: string, fn: () => unknown) => fn() }))
vi.mock('@/lib/guide', () => ({ guideHref: () => '/help/x' }))
vi.mock('@/components/guide/HowThisWorks', () => ({ HowThisWorks: () => null }))
vi.mock('./TaskList', () => ({ TaskList: () => null }))
vi.mock('./TaskFilterBar', () => ({ TaskFilterBar: () => null }))
vi.mock('@/lib/inbox/assignees', () => ({
  listAssignees: vi.fn(async () => {
    h.memberReads += 1
    return [{ userId: 'u-1', name: 'Chair' }]
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn((t: string) => {
      h.reads.push(t)
      const q: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'order', 'limit']) q[op] = vi.fn(() => q)
      q.then = (resolve: (r: unknown) => unknown) =>
        resolve({ data: t === 'meeting_action_items' ? h.rows : [], error: null, count: null })
      return q
    }),
  })),
}))

const { default: TasksPage } = await import('./page')
const params = () => ({ searchParams: Promise.resolve({}) })

beforeEach(() => {
  h.reads = []
  h.memberReads = 0
  h.rows = []
})

describe('/tasks gate', () => {
  it('a resident gets a 404 and nothing is read', async () => {
    h.gate = { ok: false, error: 'denied' }
    await expect(TasksPage(params())).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.reads).toEqual([])
    expect(h.memberReads).toBe(0)
  })

  it('signed out / no org → 404 too', async () => {
    h.gate = { ok: false, error: 'You are not signed in to an organization.' }
    await expect(TasksPage(params())).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.reads).toEqual([])
  })

  it('a board member gets the page, reading tasks for their org', async () => {
    h.gate = { ok: true, role: 'board', orgId: 'org-1' }
    h.rows = [
      {
        id: 't1',
        title: 'Get roof bids',
        description: null,
        status: 'open',
        priority: 'normal',
        due_date: '2020-01-01',
        assignee_user_id: 'u-1',
        assignee_name: 'Chair',
        meeting_id: 'm1',
        ticket_id: null,
        completed_at: null,
        created_at: '2020-01-01T00:00:00Z',
      },
    ]
    const el = await TasksPage(params())
    expect(el).toBeTruthy()
    expect(h.reads).toContain('meeting_action_items')
    expect(h.reads).toContain('hoa_meeting_minutes')
    expect(h.memberReads).toBe(1)
  })

  it('an admin gets the page too', async () => {
    h.gate = { ok: true, role: 'admin', orgId: 'org-1' }
    await expect(TasksPage(params())).resolves.toBeTruthy()
  })
})
