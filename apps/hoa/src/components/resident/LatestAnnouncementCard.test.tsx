import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LatestAnnouncementCard } from './LatestAnnouncementCard'

;(globalThis as { React?: typeof React }).React = React

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('LatestAnnouncementCard', () => {
  it('shows title, date, first line, a link to it and See all', () => {
    const out = html(
      <LatestAnnouncementCard
        failed={false}
        announcement={{ id: 'c1', subject: 'Pool news', preview: 'Pool closes Friday.', sentAt: '2026-10-01T15:00:00Z' }}
      />,
    )
    expect(out).toContain('Pool news')
    expect(out).toContain('Pool closes Friday.')
    expect(out).toContain('Oct 1, 2026')
    expect(out).toContain('href="/resident/announcements#c1"')
    expect(out).toContain('See all')
  })
  it('empty state when there are no announcements', () => {
    const out = html(<LatestAnnouncementCard failed={false} announcement={null} />)
    expect(out).toContain('No announcements yet')
    expect(out).not.toContain('See all')
  })
  it('says the read failed rather than claiming there is nothing', () => {
    const out = html(<LatestAnnouncementCard failed announcement={null} />)
    expect(out).not.toContain('No announcements yet')
  })
})
