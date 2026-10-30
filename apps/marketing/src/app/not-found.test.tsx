import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('../components/site/nav', () => ({ Nav: () => <header data-testid="nav" /> }))
vi.mock('../components/site/footer', () => ({ Footer: () => <footer data-testid="footer" /> }))

import NotFound, { metadata } from './not-found'

describe('marketing not-found', () => {
  const html = renderToStaticMarkup(<NotFound />)
  it('is noindex', () => {
    expect(metadata.robots).toEqual({ index: false })
  })
  it('wraps the page in Nav and Footer', () => {
    expect(html).toContain('data-testid="nav"')
    expect(html).toContain('data-testid="footer"')
  })
  it('has the heading and no em dashes', () => {
    expect(html).toContain('We couldn&#x27;t find that page.')
    expect(html).not.toContain('—')
  })
  it.each(['/', '/guides', '/templates', '/pricing', '/states', '/demo'])('links to %s', (href) => {
    expect(html).toContain(`href="${href}"`)
  })
})
