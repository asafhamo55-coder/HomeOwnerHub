import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { DoNextCard } = await import('./DoNextCard')

describe('DoNextCard', () => {
  it('shows one sentence and one button for an item', () => {
    const html = renderToStaticMarkup(
      <DoNextCard
        next={{ kind: 'item', key: 'approvals', message: '3 requests are waiting for your approval.', cta: 'Review them', href: '#approvals' }}
      />,
    )
    expect(html).toContain('Do this next')
    expect(html).toContain('3 requests are waiting for your approval.')
    expect(html).toContain('href="#approvals"')
    expect(html).toContain('Review them')
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it('caught up has a calm message and no button', () => {
    const html = renderToStaticMarkup(<DoNextCard next={{ kind: 'caught_up', message: 'You’re all caught up. Nothing needs you right now.' }} />)
    expect(html).toContain('all caught up')
    expect(html).not.toContain('<a ')
  })

  it('unsure says so and offers a retry, never "caught up"', () => {
    const html = renderToStaticMarkup(
      <DoNextCard next={{ kind: 'unsure', message: 'We couldn’t check everything. Try again.', cta: 'Try again', href: '/' }} />,
    )
    expect(html).toContain('couldn’t check everything')
    expect(html).not.toContain('caught up')
    expect(html).toContain('Try again')
  })
})
