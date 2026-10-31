import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/auth/HashSessionHandler', () => ({ HashSessionHandler: () => null }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('./LoginMethods', () => ({
  LoginMethods: ({ linkError }: { linkError?: string }) => <i data-link-error={linkError ?? ''} />,
}))
vi.mock('@/components/auth/AuthShell', () => ({ AuthHeader: () => null }))

const { parseLinkError } = await import('./link-error')
const { LoginView } = await import('./LoginView')
const { default: LoginPage } = await import('./page')

async function render(error?: string) {
  const el = await LoginPage({ searchParams: Promise.resolve({ error }) })
  return renderToStaticMarkup(el as React.ReactElement)
}

describe('login ?error=', () => {
  it.each(['missing_code', 'exchange_failed', 'link_expired'])('hands %s to the login methods', async (code) => {
    const html = await render(code)
    expect(html).toContain(`data-link-error="${code}"`)
  })

  it('shows nothing for an unknown code and never echoes it', async () => {
    const html = await render('<script>alert(1)</script>')
    expect(html).toContain('data-link-error=""')
    expect(html).not.toContain('script')
    expect(parseLinkError('nope')).toBeUndefined()
    expect(parseLinkError(undefined)).toBeUndefined()
  })

  it('LoginView renders no alert without a link error', () => {
    expect(renderToStaticMarkup(<LoginView />)).toContain('data-link-error=""')
  })
})
