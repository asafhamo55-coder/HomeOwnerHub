import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, onClick: _onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

const { HelpDrawer } = await import('./HelpDrawer')

const data = { audience: 'board', routeIndex: {}, articles: {}, startHere: [] } as unknown as Parameters<typeof HelpDrawer>[0]['data']

function trigger(firstName?: string | null): string {
  return renderToStaticMarkup(<HelpDrawer data={data} firstName={firstName} />)
}

describe('HelpDrawer board trigger label', () => {
  it('greets by first name and the aria-label contains the visible label (WCAG 2.5.3)', () => {
    const html = trigger('Asaf')
    expect(html).toContain('Hello Asaf')
    expect(html).toContain('aria-label="Hello Asaf, help for this page"')
    expect(html).toContain('truncate')
  })

  it('falls back to Help when the name is absent or blank', () => {
    for (const name of [undefined, null, '', '   ']) {
      const html = trigger(name)
      expect(html).toContain('>Help<')
      expect(html).toContain('aria-label="Help for this page"')
      expect(html).not.toContain('Hello')
    }
  })
})
