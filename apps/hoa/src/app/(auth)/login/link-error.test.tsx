import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('./LoginMethods', () => ({ LoginMethods: () => null }))
vi.mock('@/components/auth/AuthShell', () => ({ AuthHeader: () => null }))

const { parseLinkError } = await import('./link-error')
const { LoginView } = await import('./LoginView')
const { default: LoginPage } = await import('./page')

async function render(error?: string) {
  const el = await LoginPage({ searchParams: Promise.resolve({ error }) })
  return renderToStaticMarkup(el as React.ReactElement)
}

describe('login ?error=', () => {
  it.each(['missing_code', 'exchange_failed'])('shows the expired-link message for %s', async (code) => {
    const html = await render(code)
    expect(html).toContain('That link has expired or was already used')
    expect(html).toContain('href="/forgot-password"')
    expect(html).toContain('Send a new reset link')
    expect(html).toContain('href="/signup"')
    expect(html).toContain('Create account')
  })

  it('shows nothing for an unknown code and never echoes it', async () => {
    const html = await render('<script>alert(1)</script>')
    expect(html).not.toContain('expired')
    expect(html).not.toContain('script')
    expect(parseLinkError('nope')).toBeUndefined()
    expect(parseLinkError(undefined)).toBeUndefined()
  })

  it('LoginView renders no alert without a link error', () => {
    expect(renderToStaticMarkup(<LoginView />)).not.toContain('expired')
  })
})
