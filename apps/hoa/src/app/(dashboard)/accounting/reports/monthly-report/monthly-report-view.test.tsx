import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emptyMonthFixture, reportFixture } from '@/lib/monthly-report/fixtures'
import { MonthlyReportView } from './MonthlyReportView'

;(globalThis as { React?: typeof React }).React = React

const html = (d = reportFixture()) => renderToStaticMarkup(<MonthlyReportView data={d} />)

describe('MonthlyReportView', () => {
  it('shows the summary first, then the figures from the data', () => {
    const out = html()
    expect(out.indexOf('In brief')).toBeLessThan(out.indexOf('Cash as of'))
    for (const v of ['$48,210.50', '$27,450.00', '$6,420.00', '$3,559.88', '$121,480.40', '$2,350 over budget']) expect(out).toContain(v)
    expect(out).toContain('5 approvals waiting for the board.')
  })

  it('is print-ready: its own masthead, no wide tables, cards stay whole', () => {
    const out = html()
    expect(out).toContain('print:flex')
    expect(out).toContain('print:break-inside-avoid')
    expect(out).not.toContain('<table')
  })

  it('a failed section says so and shows no number for it', () => {
    const out = html(reportFixture({ cash: { ok: false } }))
    expect(out).toContain('We couldn’t load the balance sheet')
    expect(out).toContain('Not available')
    expect(out).not.toContain('$48,210.50')
  })

  it('an empty month reads as intentional, not as broken zeros', () => {
    const out = html(emptyMonthFixture())
    expect(out).toContain('No activity was recorded in September 2026.')
    expect(out).toContain('Nothing was posted this month.')
    expect(out).not.toContain('Worth a look')
    expect(out).not.toContain('Billed')
  })

  it('copy has no em dashes', () => {
    expect(html() + html(emptyMonthFixture())).not.toContain('—')
  })
})
