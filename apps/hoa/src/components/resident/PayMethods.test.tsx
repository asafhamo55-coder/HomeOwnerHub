import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PayMethods, payMethodsLabel } from './PayMethods'
import type { PayLine, ZelleReadResult } from '@/lib/pay-by-zelle'

;(globalThis as { React?: typeof React }).React = React

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

const checks = { payableTo: 'Maple Court HOA', mailTo: 'PO Box 12, Macon, GA 31201', dropOff: 'Clubhouse office' }
const line: PayLine = {
  assessmentId: 'a1',
  label: 'Regular dues',
  dueDate: '2026-11-01',
  amount: 325,
  memoCode: null,
  autoMatch: false,
}
const zelle: ZelleReadResult = {
  state: 'configured',
  settings: { recipient: 'pay@maple.example', recipientName: 'Maple Court HOA', instructions: null, updatedAt: 'x' },
}
const both: ZelleReadResult = {
  state: 'configured',
  settings: { recipient: 'pay@maple.example', recipientName: null, instructions: null, checks, updatedAt: 'x' },
}
const checksOnly: ZelleReadResult = {
  state: 'checks_only',
  settings: { recipientName: null, instructions: 'Questions? Call Pat.', checks, updatedAt: 'x' },
}
const render = (read: ZelleReadResult, contacts: React.ComponentProps<typeof PayMethods>['contacts'] = []) =>
  html(<PayMethods read={read} lines={[line]} amountDue={325} contacts={contacts} />)

describe('PayMethods (resident Pay screen)', () => {
  it('Zelle only: shows Zelle, no check card', () => {
    const out = render(zelle)
    expect(out).toContain('pay@maple.example')
    expect(out).not.toContain('Pay by check')
    expect(payMethodsLabel(zelle)).toBe('Send with Zelle')
  })

  it('checks only: shows payable to, mail to, drop off, the reminder and the amount', () => {
    const out = render(checksOnly)
    expect(out).toContain('Pay by check')
    expect(out).toContain('Make checks payable to')
    expect(out).toContain('Maple Court HOA')
    expect(out).toContain('PO Box 12, Macon, GA 31201')
    expect(out).toContain('Or drop off at')
    expect(out).toContain('Clubhouse office')
    expect(out).toContain('Write your home address or account number on the check.')
    expect(out).toContain('$325.00')
    expect(out).toContain('Questions? Call Pat.')
    expect(out).not.toContain('Zelle')
    expect(payMethodsLabel(checksOnly)).toBe('Pay by check')
  })

  it('leaves out the drop-off line when there is none', () => {
    const out = render({ ...checksOnly, settings: { ...checksOnly.settings, checks: { ...checks, dropOff: null } } } as ZelleReadResult)
    expect(out).not.toContain('Or drop off at')
  })

  it('both: shows Zelle and the check card', () => {
    const out = render(both)
    expect(out).toContain('pay@maple.example')
    expect(out).toContain('Pay by check')
    expect(out).toContain('Maple Court HOA')
    expect(payMethodsLabel(both)).toBe('How to pay')
  })

  it('neither: tells the resident to contact the board and shows the board contact', () => {
    const out = render(
      { state: 'not_configured' },
      [{ label: 'Treasurer', name: 'Pat Example', phone: '(555) 010-0100', email: 'pat@example.org', emergencyLine: '' }],
    )
    expect(out).toContain('contact your board')
    expect(out).toContain('Message your board')
    expect(out).toContain('Treasurer: Pat Example')
    expect(out).toContain('href="tel:5550100100"')
    expect(out).toContain('href="mailto:pat@example.org"')
    expect(out).not.toContain('Pay by check')
  })

  it('neither and an unverified record: same message, no contact block without contacts', () => {
    for (const read of [{ state: 'not_configured' }, { state: 'unverified' }] as ZelleReadResult[]) {
      const out = render(read)
      expect(out).toContain('contact your board')
      expect(out).not.toContain('tel:')
    }
  })

  it('never uses em dashes', () => {
    for (const read of [checksOnly,{ state: 'not_configured' } as ZelleReadResult]) {
      expect(render(read)).not.toContain('—')
    }
  })
})
