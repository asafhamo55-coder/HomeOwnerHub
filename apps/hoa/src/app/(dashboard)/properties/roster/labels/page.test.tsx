import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const m = vi.hoisted(() => ({ role: vi.fn(), client: vi.fn(), assoc: vi.fn(), load: vi.fn() }))

vi.mock('next/navigation', () => ({
  unstable_rethrow: () => {},
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/link', () => ({
  default: (p: { children?: React.ReactNode; href: string }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('@/lib/auth', () => ({ getCurrentUserRole: m.role }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: m.client }))
vi.mock('@/lib/properties/statutory-roster/load', () => ({
  readRosterAssociations: m.assoc,
  loadRosterInput: m.load,
}))
vi.mock('./PrintLabelsButton', () => ({ PrintLabelsButton: () => <button>PRINT</button> }))

const { default: Page } = await import('./page')

const org = { id: 'o1', name: 'Org', hub_type: 'hoa', plan: 'x', doors_count: null }

function home(i: number, email: string | null) {
  return {
    propertyId: `p${i}`,
    address: `${100 + i} Oak Street, Atlanta, GA 30301`,
    unitNumber: null,
    unitId: `u${i}`,
    unitIds: [`u${i}`],
    lotNumber: null,
    unitNotes: null,
    state: 'GA',
    recordOwner: { name: `Owner ${i}`, email, phone: null },
  }
}

function seed(homes: ReturnType<typeof home>[]) {
  m.assoc.mockResolvedValue({ rows: [], primary: undefined, timeZone: 'America/New_York' })
  m.load.mockResolvedValue({ input: { homes, ownerships: [], residents: [], charges: [], payments: [], timeZone: 'America/New_York' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.client.mockResolvedValue({})
})

describe('mailing labels page', () => {
  it('is board and admin only, decided before a client is made', async () => {
    for (const r of [{ role: 'resident', org }, { role: 'owner', org }, null]) {
      m.role.mockResolvedValue(r)
      await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(m.client).not.toHaveBeenCalled()
    seed([home(1, null)])
    for (const role of ['admin', 'board']) {
      m.role.mockResolvedValue({ role, org })
      expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))).toContain('Owner 1')
    }
  })

  it('prints 30-up sheets with the exact label geometry', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed(Array.from({ length: 31 }, (_, i) => home(i + 1, null)))
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('31 labels, 2 sheets.')
    expect((html.match(/class="label-sheet"/g) ?? []).length).toBe(2)
    expect(html).toContain('size: letter; margin: 0;')
    expect(html).toContain('repeat(3, 2.625in)')
    expect(html).toContain('grid-auto-rows: 1in')
  })

  it('filters to owners without email when asked', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    seed([home(1, null), home(2, 'two@example.test')])
    const all = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(all).toContain('2 labels')
    const only = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ noEmail: '1' }) }))
    expect(only).toContain('1 label,')
    expect(only).toContain('Owner 1')
    expect(only).not.toContain('Owner 2')
    expect(only).not.toContain('—')
  })

  it('says so when the read fails instead of printing an empty sheet', async () => {
    m.role.mockResolvedValue({ role: 'board', org })
    m.assoc.mockResolvedValue({ rows: [], primary: undefined, timeZone: 'America/New_York' })
    m.load.mockRejectedValue(new Error('boom'))
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).not.toContain('label-sheet')
  })
})
