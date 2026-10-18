import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children),
}))

const { WhatsNewEntries } = await import('./WhatsNewEntries')
const { AppVersion } = await import('../layout/AppVersion')

const entries = [
  { id: 'n#1', note: 'n', date: '2026-10-17', title: 'A Help centre', body: 'Open Help from the sidebar.', roles: ['admin' as const], article: 'start-board-admin', label: 'new' as const },
  { id: 'n#2', note: 'n', date: '2026-10-17', title: 'Fixed a thing', body: 'It works now.', roles: ['board' as const], article: null, label: 'fix' as const },
]
const version = { label: 'v2026.10.17 · c56061f', title: 'Version c56061f' } as Parameters<typeof AppVersion>[0]['version']

describe('WhatsNewEntries', () => {
  it('label pill, title, body, and Learn how only when there is an article', () => {
    const html = renderToStaticMarkup(<WhatsNewEntries entries={entries} showDate />)
    expect(html).toContain('>New<')
    expect(html).toContain('>Fixed<')
    expect(html).toContain('A Help centre')
    expect(html).toContain('Open Help from the sidebar.')
    expect(html.match(/Learn how/g)).toHaveLength(1)
    expect(html).toContain('href="/help/start-board-admin"')
    expect(html).toContain('dateTime="2026-10-17"')
  })
})

describe('AppVersion unread dot', () => {
  it('no dot by default (the existing link is unchanged)', () => {
    const html = renderToStaticMarkup(<AppVersion version={version} href="/whats-new" compact />)
    expect(html).toContain('href="/whats-new"')
    expect(html).not.toContain('data-whats-new-dot')
    expect(html).not.toContain('new updates')
  })

  it('a dot plus screen-reader text when unread', () => {
    const html = renderToStaticMarkup(<AppVersion version={version} href="/whats-new" compact unread />)
    expect(html).toContain('data-whats-new-dot')
    expect(html).toContain('(new updates)')
  })
})
