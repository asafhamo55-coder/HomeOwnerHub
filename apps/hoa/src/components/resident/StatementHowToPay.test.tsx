import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatementHowToPay } from './StatementHowToPay'
import type { PayLine, ZelleReadResult } from '@/lib/pay-by-zelle'

;(globalThis as { React?: typeof React }).React = React
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

const checks = { payableTo: 'Maple Court HOA', mailTo: 'PO Box 12', dropOff: 'Clubhouse office' }
const line: PayLine = { assessmentId: 'a', label: 'Regular dues', dueDate: '2026-11-01', amount: 325, memoCode: null, autoMatch: false }
const zelle = { recipient: 'pay@maple.example', recipientName: null, instructions: null, updatedAt: 'x' }

describe('StatementHowToPay', () => {
  it('checks only: prints payable to, mail to and drop off, and no Zelle block', () => {
    const read: ZelleReadResult = { state: 'checks_only', settings: { recipientName: null, instructions: null, checks, updatedAt: 'x' } }
    const out = html(<StatementHowToPay read={read} payLines={[line]} />)
    expect(out).toContain('Make checks payable to')
    expect(out).toContain('Maple Court HOA')
    expect(out).toContain('Mail to:')
    expect(out).toContain('PO Box 12')
    expect(out).toContain('Or drop off at:')
    expect(out).not.toContain('Zelle')
    expect(out).not.toContain('—')
  })

  it('Zelle only: the Zelle block, no check lines', () => {
    const out = html(<StatementHowToPay read={{ state: 'configured', settings: zelle }} payLines={[line]} />)
    expect(out).toContain('Zelle')
    expect(out).toContain('pay@maple.example')
    expect(out).not.toContain('payable to')
    expect(out).not.toContain('—')
  })

  it('both: prints both', () => {
    const out = html(<StatementHowToPay read={{ state: 'configured', settings: { ...zelle, checks } }} payLines={[line]} />)
    expect(out).toContain('payable to')
    expect(out).toContain('pay@maple.example')
  })

  it('renders nothing for not set up, or Zelle with nothing to pay', () => {
    expect(html(<StatementHowToPay read={{ state: 'not_configured' }} payLines={[line]} />)).toBe('')
    expect(html(<StatementHowToPay read={null} payLines={[]} />)).toBe('')
    expect(html(<StatementHowToPay read={{ state: 'configured', settings: zelle }} payLines={[]} />)).toBe('')
  })
})
