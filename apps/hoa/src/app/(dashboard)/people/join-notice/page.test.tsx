import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const m = vi.hoisted(() => ({ role: vi.fn(), assoc: vi.fn() }))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/link', () => ({
  default: (p: { children?: React.ReactNode; href: string }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('@homeowner-portal/db/m5', () => ({ M5_APPLIED: true }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRole: m.role }))
vi.mock('@/lib/app-origin', () => ({ appUrl: (p: string) => `https://app.example.org${p}` }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ range: async () => m.assoc() }) }) }),
    }),
  }),
}))
vi.mock('./PrintButton', () => ({ PrintButton: () => <button>PRINT</button> }))

const { default: Page } = await import('./page')

const org = { id: 'o1', name: 'Fallback Org', hub_type: 'hoa', plan: 'x', doors_count: null }
const board = { role: 'board', org }

function assoc(compliance_settings: unknown = {}) {
  m.assoc.mockReturnValue({ data: [{ id: 'a1', name: 'Madison Park', compliance_settings }], error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  assoc()
})

describe('join notice page', () => {
  it('is board and admin only', async () => {
    m.role.mockResolvedValue({ role: 'resident', org })
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND')
    m.role.mockResolvedValue(null)
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND')
    m.role.mockResolvedValue({ role: 'admin', org })
    expect(renderToStaticMarkup(await Page())).toContain('Madison Park')
    m.role.mockResolvedValue(board)
    expect(renderToStaticMarkup(await Page())).toContain('Madison Park')
  })

  it('renders the association name, three steps, the address and a QR svg', async () => {
    m.role.mockResolvedValue(board)
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Madison Park is now on HomeownerHub')
    expect(html).toContain('Look for our email.')
    expect(html).toContain('No email? Open the web address below.')
    expect(html).toContain('Ask to join your home')
    expect(html).toContain('app.example.org/join')
    expect(html).toContain('app.example.org/welcome')
    expect(html).toContain('<svg')
    expect(html).toContain('QR code that opens app.example.org/join')
    expect(html).toContain('home screen')
    expect(html).not.toContain('—')
  })

  it('shows the board contact only when one is set', async () => {
    m.role.mockResolvedValue(board)
    expect(renderToStaticMarkup(await Page())).not.toContain('Need help?')

    assoc({ board_contacts: [{ label: 'President', name: 'Pat Lee', phone: '678-555-0100', email: 'pat@example.org' }] })
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Need help? Call or email')
    expect(html).toContain('Pat Lee')
    expect(html).toContain('678-555-0100')
    expect(html).toContain('pat@example.org')
  })

  it('skips a contact that has no phone or email', async () => {
    m.role.mockResolvedValue(board)
    assoc({ board_contacts: [{ label: 'Gate', name: '', phone: '', email: '', emergencyLine: 'Gate guard' }] })
    expect(renderToStaticMarkup(await Page())).not.toContain('Need help?')
  })
})
