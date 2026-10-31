import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const m = vi.hoisted(() => ({ audit: vi.fn(), detail: vi.fn(), stats: vi.fn(), tenants: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/platform-admin', () => ({
  listPlatformAuditLog: m.audit,
  getTenantDetail: m.detail,
  getPlatformStats: m.stats,
  listTenants: m.tenants,
}))
vi.mock('./tenants/[id]/TenantActions', () => ({ TenantActions: () => null }))

const { default: AuditPage } = await import('./audit/page')
const { default: TenantPage } = await import('./tenants/[id]/page')
const { default: OverviewPage } = await import('./page')

beforeEach(() => vi.clearAllMocks())

describe('admin audit page', () => {
  it('a failed read shows LoadFailed, not the empty state', async () => {
    m.audit.mockResolvedValue({ ok: false })
    const html = renderToStaticMarkup(await AuditPage())
    expect(html).toContain('Couldn’t load the audit log')
    expect(html).not.toContain('No platform-admin activity yet')
  })
  it('no rows is the empty state', async () => {
    m.audit.mockResolvedValue({ ok: true, rows: [] })
    const html = renderToStaticMarkup(await AuditPage())
    expect(html).toContain('No platform-admin activity yet')
    expect(html).not.toContain('Couldn’t load')
  })
})

describe('admin tenant page', () => {
  const params = { params: Promise.resolve({ id: 'org-a' }) }
  it('a failed read shows LoadFailed', async () => {
    m.detail.mockResolvedValue({ ok: false, reason: 'error' })
    const html = renderToStaticMarkup(await TenantPage(params))
    expect(html).toContain('Couldn’t load this tenant')
  })
  it('a real miss is notFound', async () => {
    m.detail.mockResolvedValue({ ok: false, reason: 'not_found' })
    await expect(TenantPage(params)).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('admin overview', () => {
  const base = { total_tenants: 2, active_tenants: 2, suspended_tenants: 0, ai_runs_30d: 5, tenants_by_plan: [], tenants_over_time: [], workflows_30d: [] }
  it('a failed count reads Not available, never 0', async () => {
    m.stats.mockResolvedValue({ ...base, total_members: null, total_units: null, total_vendors: 3 })
    m.tenants.mockResolvedValue([])
    const html = renderToStaticMarkup(await OverviewPage())
    expect(html).toContain('Not available')
    expect(html).not.toContain('0 accounts')
  })
  it('success shows the numbers', async () => {
    m.stats.mockResolvedValue({ ...base, total_members: 7, total_units: 40, total_vendors: 3 })
    m.tenants.mockResolvedValue([])
    const html = renderToStaticMarkup(await OverviewPage())
    expect(html).toContain('7 accounts')
    expect(html).not.toContain('Not available')
  })
})
