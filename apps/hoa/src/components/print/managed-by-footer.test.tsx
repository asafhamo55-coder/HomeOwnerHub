import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ManagedByFooter } from './ManagedByFooter'
import { JoinNotice } from '@/app/(dashboard)/people/join-notice/JoinNotice'

;(globalThis as { React?: typeof React }).React = React

describe('ManagedByFooter', () => {
  it('prints the escaped line', () => {
    const html = renderToStaticMarkup(<ManagedByFooter line={'Managed by Homeside & Sons <script>x</script>'} />)
    expect(html).toContain('data-managed-by')
    expect(html).toContain('Managed by Homeside &amp; Sons')
    expect(html).not.toContain('<script')
  })
  it('renders nothing for an empty line', () => {
    for (const line of [undefined, null, '', '  ']) expect(renderToStaticMarkup(<ManagedByFooter line={line} />)).toBe('')
  })
  it('appears at the foot of the join notice, and only when set', () => {
    const props = { associationName: 'Madison Park', joinUrl: 'https://x.test/join', welcomeUrl: 'https://x.test/welcome', qrSvg: '<svg></svg>', contacts: [] }
    expect(renderToStaticMarkup(<JoinNotice {...props} managedBy="Managed by Homeside, (404) 555-0100" />)).toContain('Managed by Homeside, (404) 555-0100')
    expect(renderToStaticMarkup(<JoinNotice {...props} />)).not.toContain('data-managed-by')
  })
})
