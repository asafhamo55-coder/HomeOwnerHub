import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, onClick: _onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { FirstWeekCard } = await import('./FirstWeekCard')
const { BoardFirstWeek, ResidentFirstWeek } = await import('./FirstWeekGate')
const { BOARD_FIRST_WEEK_STEPS, RESIDENT_FIRST_WEEK_STEPS } = await import('@/lib/guide/first-week')

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!)
}

describe('FirstWeekCard', () => {
  it('board: a titled section with every step linking to its guide article and its page', () => {
    const html = renderToStaticMarkup(<FirstWeekCard variant="board" onDismiss={() => {}} />)
    expect(html).toContain('Your first week on the board')
    expect(html).toMatch(/<section[^>]*aria-labelledby="first-week-heading"/)
    expect(html).toMatch(/<h2[^>]*id="first-week-heading"/)
    const links = hrefs(html)
    for (const s of BOARD_FIRST_WEEK_STEPS) {
      expect(links).toContain(s.href)
      expect(links).toContain(s.secondary.href)
      expect(html).toContain(s.title)
    }
    // An ordered list of steps, one <li> each.
    expect(html.match(/<li/g)).toHaveLength(BOARD_FIRST_WEEK_STEPS.length)
  })

  it('resident: steps go to the portal pages and each has a guide link', () => {
    const html = renderToStaticMarkup(<FirstWeekCard variant="resident" onDismiss={() => {}} />)
    expect(html).toContain('New here?')
    const links = hrefs(html)
    for (const s of RESIDENT_FIRST_WEEK_STEPS) {
      expect(links).toContain(s.href)
      expect(links).toContain(s.secondary.href)
    }
  })

  it('has a labelled Dismiss button only when it can be dismissed', () => {
    const withDismiss = renderToStaticMarkup(<FirstWeekCard variant="board" onDismiss={() => {}} />)
    expect(withDismiss).toMatch(/<button[^>]*type="button"[^>]*aria-label="Dismiss: Your first week on the board"/)
    const without = renderToStaticMarkup(<FirstWeekCard variant="board" />)
    expect(without).not.toContain('<button')
  })

  it('uses design-system tokens only (no palette classes, no dark: variants)', () => {
    for (const variant of ['board', 'resident'] as const) {
      const html = renderToStaticMarkup(<FirstWeekCard variant={variant} onDismiss={() => {}} />)
      expect(html).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|emerald|amber|indigo|blue|red|green)-\d/)
      expect(html).not.toMatch(/\bdark:/)
    }
  })
})

describe('FirstWeekGate (server render)', () => {
  // Storage is read after mount, so the server HTML (and the first client
  // render) never show a card someone already dismissed.
  it('renders nothing on the server, whatever the org age', () => {
    expect(renderToStaticMarkup(<BoardFirstWeek orgId="org-1" orgCreatedAt={new Date().toISOString()} />)).toBe('')
    expect(renderToStaticMarkup(<ResidentFirstWeek scope="org-1" />)).toBe('')
  })
})

describe('FirstWeekCard welcome variant', () => {
  it('titles the card with the HOA name and shows only the first 3 board steps', () => {
    const html = renderToStaticMarkup(<FirstWeekCard variant="board" welcomeFor="Oak Hollow HOA" onDismiss={() => {}} />)
    expect(html).toContain('Welcome to Oak Hollow HOA. Here’s what to do first')
    expect(html.match(/<li/g)).toHaveLength(3)
    for (const s of BOARD_FIRST_WEEK_STEPS.slice(0, 3)) expect(html).toContain(s.title)
    expect(html).not.toContain(BOARD_FIRST_WEEK_STEPS[3]!.title)
  })
})
