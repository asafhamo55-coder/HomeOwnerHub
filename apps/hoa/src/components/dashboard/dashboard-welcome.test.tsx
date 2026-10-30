import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { DashboardWelcome } from './DashboardWelcome'

describe('DashboardWelcome', () => {
  const html = renderToStaticMarkup(
    <DashboardWelcome name="Dana" associationName="Madison Park HOA" fallbackDate="Friday, October 30" />,
  )

  it('shows the association name, the greeting name and the date', () => {
    expect(html).toContain('Madison Park HOA')
    expect(html).toContain('Dana')
    expect(html).toContain('Friday, October 30')
  })

  it('renders exactly one h1 and a primary action to the approvals list', () => {
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('href="#approvals"')
    expect(html).toContain('Review approvals')
  })
})
