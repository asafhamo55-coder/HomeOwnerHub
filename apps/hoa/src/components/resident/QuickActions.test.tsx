import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuickActions } from './QuickActions'

;(globalThis as { React?: typeof React }).React = React

describe('QuickActions', () => {
  it('links every tile, including meetings and announcements', () => {
    const html = renderToStaticMarkup(<QuickActions newAnnouncements={0} />)
    for (const href of [
      '/resident/tickets/new',
      '/resident/ask',
      '/resident/documents',
      '/resident/arc/new',
      '/resident/report-violation',
      '/resident/dues',
      '/resident/meetings',
      '/resident/announcements',
    ]) {
      expect(html).toContain(`href="${href}"`)
    }
    expect(html).toContain('Meetings')
    expect(html).toContain('Announcements')
  })

  it('shows the new count when above 0 and hides it at 0', () => {
    expect(renderToStaticMarkup(<QuickActions newAnnouncements={3} />)).toContain('3 new')
    expect(renderToStaticMarkup(<QuickActions newAnnouncements={0} />)).not.toContain(' new')
  })
})
