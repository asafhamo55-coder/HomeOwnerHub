import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@homeowner-portal/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AuthPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AuthHeader: ({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
}))

import NotFound from './not-found'

describe('app-wide not-found', () => {
  const html = renderToStaticMarkup(<NotFound />)
  it('names the problem and explains expired links', () => {
    expect(html).toContain('We couldn&#x27;t find that page.')
    expect(html).toContain('ask your board to send a new one')
  })
  it.each(['/login', '/', '/help'])('links to %s', (href) => {
    expect(html).toContain(`href="${href}"`)
  })
  it('uses no em dashes', () => {
    expect(html).not.toContain('—')
  })
})
