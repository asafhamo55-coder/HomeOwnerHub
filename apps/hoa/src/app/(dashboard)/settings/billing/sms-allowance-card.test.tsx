import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { smsAllowanceStatus } from '@homeowner-portal/billing'
import { SmsAllowanceCard } from './SmsAllowanceCard'

// BL-104 §4: Settings → Billing's text-message card (rendered only after
// PRICING_V2, for new-plan orgs).

;(globalThis as { React?: typeof React }).React = React
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('SmsAllowanceCard', () => {
  it('under 80%: usage, no warning', () => {
    const out = html(<SmsAllowanceCard status={smsAllowanceStatus('essentials', 40, 10)} />)
    expect(out).toContain('Essentials includes 100 text message segments a month')
    expect(out).toContain('20</span> of 100 segments used (20%)')
    expect(out).not.toContain('role="alert"')
  })

  it('80%: the soft warning', () => {
    const out = html(<SmsAllowanceCard status={smsAllowanceStatus('complete', 50, 85)} />)
    expect(out).toContain('You’ve used 85% of this month’s texts')
  })

  it('100%: texts paused, email and the portal still go', () => {
    const out = html(<SmsAllowanceCard status={smsAllowanceStatus('complete', 50, 120)} />)
    expect(out).toContain('Text messages are paused until the 1st')
    expect(out).toContain('email and the resident portal still go')
    expect(out).toContain('aria-valuenow="100"')
  })
})
