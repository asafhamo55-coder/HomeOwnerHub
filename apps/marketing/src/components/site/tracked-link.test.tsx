import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

// Marks what next/link rendered, so a plain <a> is distinguishable.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-next-link="">
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/lib/analytics', () => ({ pageLabel: () => 'home', trackEvent: async () => {} }))

const { TrackedLink } = await import('./tracked-link')

describe('TrackedLink', () => {
  it('links to the app (an absolute URL) with a plain <a>, never next/link', () => {
    // next/link prefetches a same-origin URL; in UI shots the app URL is this
    // site's own origin and the /signup prefetch never settled.
    const html = renderToStaticMarkup(
      <TrackedLink href="http://localhost:3103/signup" event="pilot_cta_click" position="hero">
        Start free trial
      </TrackedLink>,
    )
    expect(html).toBe('<a href="http://localhost:3103/signup">Start free trial</a>')
  })

  it('keeps next/link for this site’s own pages', () => {
    const html = renderToStaticMarkup(
      <TrackedLink href="/demo" event="demo_cta_click" position="hero">
        Book a demo
      </TrackedLink>,
    )
    expect(html).toContain('data-next-link')
  })
})
