import { describe, expect, it, vi } from 'vitest'

const ID = '11111111-2222-4333-8444-555555555555'
const LONG = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of the notice.`).join('\n')

const h = vi.hoisted(() => ({
  role: 'board' as string | null,
  row: null as unknown,
  queried: 0,
}))

class NotFound extends Error {}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('notFound')
  },
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA' } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => {
      h.queried += 1
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => ({ data: h.row, error: null }),
      }
      return chain
    },
  })),
}))
vi.mock('@/lib/primary-association', () => ({
  getPrimaryAssociationResult: vi.fn(async () => ({ ok: true, data: { id: 'a1', name: 'Peachtree Fixture HOA', timeZone: 'America/New_York' }, count: null })),
}))
vi.mock('@/lib/violations/letter-print-actions', () => ({ recordViolationLetterPrinted: vi.fn(async () => ({ ok: true })) }))

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastProvider } from '@homeowner-portal/ui'
;(globalThis as { React?: unknown }).React = React
import Page from './page'
import { PrintNoticeLink } from '../PrintNoticeLink'

async function render() {
  const el = await Page({ params: Promise.resolve({ id: ID }) })
  return renderToStaticMarkup(<ToastProvider>{el}</ToastProvider>)
}

describe('violation letter print view', () => {
  it('shows the letterhead, date, owner, standard address and the whole letter to the board', async () => {
    h.role = 'board'
    h.row = {
      id: ID,
      notice_sent_at: '2026-11-02T15:00:00Z',
      approved_at: '2026-11-01T15:00:00Z',
      approved_letter: LONG,
      property: { address: '1234 PEACHTREE STREET NORTHEAST, ATLANTA, GA 30309', unit_number: '5', owner_name: 'Jane Owner' },
    }
    const html = await render()
    expect(html).toContain('Peachtree Fixture HOA')
    expect(html).toContain('src="/brand-site/logo-full.svg"')
    expect(html).toContain('alt="HomeownerHub"')
    expect(html).toContain('print-color-adjust:exact')
    expect(html).toContain('Nov 2, 2026')
    expect(html).toContain('Jane Owner')
    expect(html).toContain('1234 Peachtree St NE')
    expect(html).not.toContain('PEACHTREE')
    expect(html).toContain('Atlanta, GA 30309')
    expect(html).toContain('Line 1 of the notice.')
    expect(html).toContain('Line 120 of the notice.')
    // Not clipped by a scroll box.
    expect(html).not.toContain('max-h-')
    expect(html).not.toContain('overflow-y-auto')
    expect(html).toContain('Print / Save as PDF')
    expect(html).toContain('min-h-12')
    expect(html).toContain('print:hidden')
  })

  it('also serves an admin', async () => {
    h.role = 'admin'
    expect(await render()).toContain('Line 1 of the notice.')
  })

  it.each(['resident', 'vendor', null])('is not found for %s, before any query', async (role) => {
    h.role = role
    h.queried = 0
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBeInstanceOf(NotFound)
    expect(h.queried).toBe(0)
  })

  it('is not found when the violation has no approved letter', async () => {
    h.role = 'board'
    h.row = { id: ID, notice_sent_at: null, approved_at: null, approved_letter: null, property: null }
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBeInstanceOf(NotFound)
  })
})

describe('PrintNoticeLink', () => {
  it('links to the print view with a 48px target', () => {
    const html = renderToStaticMarkup(<PrintNoticeLink violationId={ID} />)
    expect(html).toContain(`href="/violations/${ID}/letter"`)
    expect(html).toContain('Print / Save as PDF')
    expect(html).toContain('min-h-12')
  })
})
