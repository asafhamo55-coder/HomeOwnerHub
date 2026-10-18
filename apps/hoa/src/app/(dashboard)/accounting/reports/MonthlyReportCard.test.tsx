import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Classic JSX runtime under the root vitest config — needs a global React.
;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('./SendReportNowButton', () => ({
  SendReportNowButton: ({ disabled, label }: { disabled: boolean; label: string }) =>
    React.createElement('button', { 'data-send-now': label, disabled }, 'Send now'),
}))

const { MonthlyReportCard } = await import('./MonthlyReportCard')

const render = (props: Parameters<typeof MonthlyReportCard>[0]) => renderToStaticMarkup(React.createElement(MonthlyReportCard, props))

const sent = {
  last: { label: 'September 2026', status: 'sent', sentOn: 'Oct 1, 2026' },
  pendingLabel: 'September 2026',
  pendingDone: true,
}

describe('MonthlyReportCard (BL-073)', () => {
  it('shows the last month sent and links to the preview', () => {
    const html = render({ status: sent, canSend: true })
    expect(html).toContain('Monthly board report')
    expect(html).toContain('September 2026')
    expect(html).toContain('on Oct 1, 2026')
    expect(html).toContain('href="/accounting/reports/monthly-report"')
    expect(html).toContain('href="/settings/notifications"')
  })

  it('offers Send now to admins, disabled once the month has gone out', () => {
    const html = render({ status: sent, canSend: true })
    expect(html).toMatch(/<button[^>]*data-send-now="September 2026"[^>]*disabled/)
    const due = render({ status: { last: null, pendingLabel: 'September 2026', pendingDone: false }, canSend: true })
    expect(due).toContain('Not sent yet')
    expect(due).toContain('September 2026, due now')
    expect(due).not.toMatch(/data-send-now="September 2026"[^>]*disabled/)
  })

  it('board members get Preview but no Send now', () => {
    const html = render({ status: sent, canSend: false })
    expect(html).not.toContain('data-send-now')
    expect(html).toContain('Preview')
  })

  it('says it could not load the history — never "not sent yet" — when the read failed', () => {
    const html = render({ status: null, canSend: true })
    expect(html).toContain('Couldn’t load the report’s send history')
    expect(html).not.toContain('Not sent yet')
    expect(html).not.toContain('data-send-now')
  })

  it('flags a report nobody received', () => {
    const html = render({ status: { ...sent, last: { ...sent.last, status: 'failed' } }, canSend: false })
    expect(html).toContain('Not delivered')
  })
})
