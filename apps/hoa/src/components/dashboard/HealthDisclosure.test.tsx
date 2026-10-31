import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HealthDisclosure } from './HealthDisclosure'

;(globalThis as { React?: typeof React }).React = React

describe('HealthDisclosure', () => {
  it('collapsed by default: a real button, aria-expanded false, panel hidden but present', () => {
    const html = renderToStaticMarkup(
      <HealthDisclosure orgId="o1" defaultOpen={false}>
        <p>charts</p>
      </HealthDisclosure>,
    )
    expect(html).toMatch(/<button[^>]*type="button"/)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Show more numbers')
    expect(html).toMatch(/aria-controls="([^"]+)"/)
    expect(html).toMatch(/<div id="[^"]+" hidden=""/)
    expect(html).toContain('charts')
  })

  it('open by default: expanded, panel visible, button offers to hide', () => {
    const html = renderToStaticMarkup(
      <HealthDisclosure orgId="o1" defaultOpen>
        <p>charts</p>
      </HealthDisclosure>,
    )
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Hide numbers')
    expect(html).not.toContain('hidden=""')
  })
})
