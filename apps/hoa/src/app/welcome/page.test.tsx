import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import WelcomePage from './page'

;(globalThis as { React?: typeof React }).React = React

describe('/welcome page', () => {
  const html = renderToStaticMarkup(<WelcomePage />)

  it('plays the video inline with a poster and a captions track', () => {
    expect(html).toContain('src="/welcome/welcome.mp4"')
    expect(html).toContain('poster="/welcome/poster.jpg"')
    expect(html).toContain('kind="captions"')
    expect(html).toContain('src="/welcome/welcome.vtt"')
    expect(html).toMatch(/playsinline/i)
  })

  it('lists the steps in words and offers a sign-in button', () => {
    expect(html).toContain('Add to Home Screen')
    expect(html).toContain('Install app')
    expect(html).toContain('href="/login"')
    expect(html).toContain('Sign in')
  })

  it('stays generic: no community name', () => {
    expect(html).not.toContain('Madison Park')
  })
})
