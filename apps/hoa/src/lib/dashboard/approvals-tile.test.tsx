import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Kpi } from '@homeowner-portal/ui'
import { APPROVAL_SOURCES, type SourceCounts } from '@/lib/approvals-inbox/model'
import { summarizeWaiting } from '@/lib/approvals-inbox/waiting'
import { approvalsTile } from './approvals-tile'

;(globalThis as { React?: typeof React }).React = React

const counts = (over: Partial<SourceCounts>): SourceCounts =>
  ({ ...Object.fromEntries(APPROVAL_SOURCES.map((s) => [s, 0])), ...over }) as SourceCounts

const Anchor = ({ children, ...p }: React.ComponentProps<'a'>) => <a {...p}>{children}</a>

function render(c: SourceCounts) {
  const t = approvalsTile(summarizeWaiting(c))
  const html = renderToStaticMarkup(
    <Kpi label="Approvals" value={t.value} hint={t.hint} href="/approvals" linkAs={Anchor} state={t.state} />,
  )
  return { t, html }
}

describe('Approvals tile states', () => {
  it('inbox zero: every source loaded and empty', () => {
    const { t, html } = render(counts({}))
    expect(t).toMatchObject({ value: '0', hint: 'Inbox zero', state: 'ready' })
    expect(html).toContain('Inbox zero')
    expect(html).toContain('href="/approvals"')
  })

  it('failed with nothing known is the failed state, never Inbox zero', () => {
    const { t, html } = render(counts({ join: null }))
    expect(t.state).toBe('failed')
    expect(html).not.toContain('Inbox zero')
  })

  it('partial: a known count with one source failed says some items could not be counted', () => {
    const { t, html } = render(counts({ amenity: 2, join: null }))
    expect(t).toMatchObject({ value: '2', state: 'ready' })
    expect(html).toContain('Some items could not be counted. Open the list to see them.')
    expect(html).not.toContain('Inbox zero')
  })

  it('ready: shows the total as waiting on you', () => {
    expect(render(counts({ amenity: 1, join: 1 })).t).toMatchObject({ value: '2', hint: 'waiting on you' })
  })
})
