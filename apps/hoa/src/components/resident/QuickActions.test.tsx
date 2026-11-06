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

  it('has one Community tile instead of three, linking the simple Community page', () => {
    const html = renderToStaticMarkup(<QuickActions newAnnouncements={0} />)
    expect(html).toContain('href="/resident/community"')
    expect(html).toContain('>Community<')
    expect(html).toContain('Polls, book a space, talk with neighbors')
    for (const href of ['/resident/polls', '/resident/amenities', '/resident/board']) {
      expect(html).not.toContain(`href="${href}"`)
    }
  })

  it('keeps the home to a short list of tiles', () => {
    const html = renderToStaticMarkup(<QuickActions newAnnouncements={0} />)
    expect((html.match(/<a /g) ?? []).length).toBeLessThanOrEqual(10)
  })

  it('shows the new count when above 0 and hides it at 0', () => {
    expect(renderToStaticMarkup(<QuickActions newAnnouncements={3} />)).toContain('3 new')
    expect(renderToStaticMarkup(<QuickActions newAnnouncements={0} />)).not.toContain(' new')
  })

  it('badges the Community tile with the polls to answer, in text and in its accessible name', () => {
    const html = renderToStaticMarkup(<QuickActions newAnnouncements={0} pollsToAnswer={2} />)
    expect(html).toContain('2 polls to answer')
    expect(html).toContain('aria-label="Community, 2 polls to answer. Polls, book a space, talk with neighbors"')
    expect(renderToStaticMarkup(<QuickActions newAnnouncements={0} pollsToAnswer={1} />)).toContain('1 poll to answer')
  })

  it('shows no poll badge at 0', () => {
    const html = renderToStaticMarkup(<QuickActions newAnnouncements={0} pollsToAnswer={0} />)
    expect(html).not.toContain('to answer')
    expect(html).not.toContain('aria-label="Community')
  })
})
