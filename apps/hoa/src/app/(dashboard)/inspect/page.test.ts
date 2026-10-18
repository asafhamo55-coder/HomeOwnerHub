import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-028: /inspect is board-only. A resident (or anyone not board/admin)
// gets a 404 before any home is read.

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  reads: [] as string[],
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
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const q: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'is', 'in']) q[op] = vi.fn(() => q)
    q.order = vi.fn(async () => ({ data: [{ id: 'p1', address: '1 Oak St', unit_number: null }], error: null }))
    q.then = (resolve: (r: unknown) => unknown) => resolve({ data: [{ id: 'u1', legacy_hoa_property_id: 'p1', created_at: null }], error: null })
    return {
      from: vi.fn((t: string) => {
        h.reads.push(t)
        return q
      }),
    }
  }),
}))
vi.mock('./InspectMode', () => ({ InspectMode: () => null }))

const { default: InspectPage } = await import('./page')

beforeEach(() => {
  h.reads = []
})

describe('/inspect gate', () => {
  it('a resident gets a 404 and nothing is read', async () => {
    h.gate = { ok: false, error: 'denied' }
    await expect(InspectPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.reads).toEqual([])
  })

  it('signed out / no org → 404 too', async () => {
    h.gate = { ok: false, error: 'You are not signed in to an organization.' }
    await expect(InspectPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('board → the page renders with the org’s homes keyed by unit', async () => {
    h.gate = { ok: true, role: 'board', orgId: 'org-1' }
    const el = (await InspectPage()) as { props: { children: { props: Record<string, unknown> } } }
    expect(h.reads).toEqual(['hoa_properties', 'units'])
    expect(el.props.children.props).toMatchObject({ orgId: 'org-1', homes: [{ id: 'u1', address: '1 Oak St', unit_number: null }], unlinked: 0 })
  })
})
