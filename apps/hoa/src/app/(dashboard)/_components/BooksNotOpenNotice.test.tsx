import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-072: the inline "books aren't open" state for a ledger-posting form.

;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))
// The server action module: never called by a static render.
vi.mock('@/lib/association-setup-actions', () => ({ openBooks: vi.fn() }))

const { BooksNotOpenNotice } = await import('./BooksNotOpenNotice')

describe('BooksNotOpenNotice (BL-072)', () => {
  it('offers an admin "Open the books", returning to the form', () => {
    const html = renderToStaticMarkup(h(BooksNotOpenNotice, { canOpenBooks: true, returnTo: '/dues/new' }))
    expect(html).toContain('The books aren’t open yet')
    expect(html).toContain('Open the books')
    expect(html).toMatch(/name="return_to" value="\/dues\/new"/)
    expect(html).toContain('Operating and Reserve funds')
    expect(html).not.toMatch(/pnpm|seed:/i)
  })

  it('sends a board member to the admins instead', () => {
    const html = renderToStaticMarkup(h(BooksNotOpenNotice, { canOpenBooks: false, returnTo: '/dues' }))
    expect(html).toContain('Only an admin of your HOA can open the books')
    expect(html).toContain('href="/settings/members"')
    expect(html).not.toContain('return_to')
  })
})
