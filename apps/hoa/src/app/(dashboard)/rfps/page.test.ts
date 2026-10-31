import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const h = vi.hoisted(() => ({
  rfps: { ok: true, data: [] as unknown[] } as { ok: boolean; data?: unknown[] },
  bids: { ok: true, data: {} } as { ok: boolean; data?: Record<string, number> },
}))

vi.mock('@/lib/rfps', () => ({
  listRfpsResult: vi.fn(async () => h.rfps),
  listBidCountsByRfpResult: vi.fn(async () => h.bids),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/components/vendors/VendorTabs', () => ({ VendorTabs: () => null }))

const { default: RfpsListPage } = await import('./page')

// Noon on the target day, so the New York calendar day is unambiguous.
const iso = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000)
  d.setUTCHours(17, 0, 0, 0)
  return d.toISOString()
}
const row = (id: string, status: string, days: number) => ({
  id,
  rfp_number: `RFP-${id}`,
  title: `Title ${id}`,
  status,
  submission_deadline: iso(days),
  budget_min: null,
  budget_max: null,
  ai_generated: false,
  created_at: iso(-10),
})

const render = async (status?: string) =>
  renderToStaticMarkup((await RfpsListPage({ searchParams: Promise.resolve({ status }) })) as React.ReactElement)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-30T16:00:00Z'))
  h.rfps = { ok: true, data: [row('1', 'draft', 20), row('2', 'open', 3), row('3', 'open', 30), row('4', 'awarded', -5)] }
  h.bids = { ok: true, data: { '2': 4, '3': 1 } }
})

describe('/rfps list', () => {
  it('shows the strip tiles linked to status filters', async () => {
    const html = await render()
    expect(html).toContain('Closing within 7 days')
    for (const s of ['draft', 'open', 'closing', 'awarded']) expect(html).toContain(`href="/rfps?status=${s}"`)
  })

  it('shows bid counts per RFP, zero when there are none', async () => {
    const html = await render()
    expect(html).toContain('>4<')
    expect(html).toContain('>1<')
    expect(html).toContain('>0<')
    expect(html).toContain('Due in 3 days')
    expect(html).toContain('Due in 30 days')
  })

  it('filters rows by ?status=', async () => {
    const html = await render('closing')
    expect(html).toContain('Title 2')
    expect(html).not.toContain('Title 3')
    expect(html).not.toContain('Title 1')
  })

  it('a failed bids read says Not available and never shows 0', async () => {
    h.bids = { ok: false }
    const html = await render()
    expect(html).toContain('Not available')
    expect(html).not.toContain('>0<')
  })
})

afterEach(() => vi.useRealTimers())
