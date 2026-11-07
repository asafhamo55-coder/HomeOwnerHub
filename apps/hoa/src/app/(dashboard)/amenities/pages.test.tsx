import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

const requireBoardOrAdmin = vi.fn()
const loadAmenities = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const assocQuery = { data: [{ id: 'x1', name: 'North' }], error: null as null | { code: string } }

vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: () => requireBoardOrAdmin() }))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@homeowner-portal/db/m11', () => ({ M11_APPLIED: true }))
vi.mock('@/lib/amenities/queries', () => ({ loadAmenities: (...a: unknown[]) => loadAmenities(...a) }))
vi.mock('./AmenityForm', () => ({ AmenityForm: () => null }))
vi.mock('@homeowner-portal/db', () => {
  const chain: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'order']) chain[k] = vi.fn(() => chain)
  chain.range = vi.fn(async () => assocQuery)
  chain.eqCalls = chain.eq
  return { createAdminClient: () => ({ from: () => chain }) }
})

const NewPage = (await import('./new/page')).default
const EditPage = (await import('./[id]/edit/page')).default

const mine = { id: 'a1', name: 'Clubhouse', retiredAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  requireBoardOrAdmin.mockResolvedValue({ role: 'board', org: { id: 'org-1' } })
  assocQuery.error = null
})

type El = { props: Record<string, unknown> }
function findForm(node: unknown): El | null {
  const el = node as { type?: { name?: string } | string; props?: { children?: unknown } } | null
  if (!el || typeof el !== 'object') return null
  if (typeof el.type === 'function' && el.type.name === 'AmenityForm') return el as unknown as El
  const kids = React.Children.toArray(el.props?.children as React.ReactNode)
  for (const k of kids) {
    const f = findForm(k)
    if (f) return f
  }
  return null
}

describe('/amenities/new', () => {
  it('is gated to board or admin before anything is read', async () => {
    requireBoardOrAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(NewPage()).rejects.toThrow('NEXT_REDIRECT')
  })

  it('renders the standard Page with breadcrumbs and the empty form', async () => {
    const page = (await NewPage()) as unknown as El
    expect(page.props.title).toBe('Add an amenity')
    expect(page.props.width).toBe('narrow')
    expect(page.props.breadcrumbs).toEqual([{ label: 'Amenities', href: '/amenities' }, { label: 'Add an amenity' }])
    const form = findForm(page)!
    expect(form.props.amenity).toBeNull()
    expect(form.props.associations).toEqual([{ id: 'x1', name: 'North' }])
  })
})

describe('/amenities/[id]/edit', () => {
  it('is gated to board or admin', async () => {
    requireBoardOrAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(EditPage({ params: Promise.resolve({ id: 'a1' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(loadAmenities).not.toHaveBeenCalled()
  })

  it("loads only the user's organization and passes the amenity to the form", async () => {
    loadAmenities.mockResolvedValue([mine])
    const page = (await EditPage({ params: Promise.resolve({ id: 'a1' }) })) as unknown as El
    expect(loadAmenities.mock.calls[0][1]).toBe('org-1')
    expect(page.props.breadcrumbs).toEqual([{ label: 'Amenities', href: '/amenities' }, { label: 'Clubhouse' }, { label: 'Edit' }])
    expect(findForm(page)!.props.amenity).toBe(mine)
  })

  it("does not find another organization's amenity", async () => {
    loadAmenities.mockResolvedValue([mine]) // the org-scoped read never returns the other org's row
    await expect(EditPage({ params: Promise.resolve({ id: 'other-orgs-id' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('does not open a retired amenity', async () => {
    loadAmenities.mockResolvedValue([{ ...mine, retiredAt: '2026-01-01' }])
    await expect(EditPage({ params: Promise.resolve({ id: 'a1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
