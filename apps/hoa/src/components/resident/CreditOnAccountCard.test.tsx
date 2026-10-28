import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CreditOnAccountCard } from './CreditOnAccountCard'

;(globalThis as { React?: typeof React }).React = React

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('CreditOnAccountCard', () => {
  it('shows the credit with an explanation', () => {
    const out = html(<CreditOnAccountCard credit={{ total: 125.5, unitIds: ['u1'] }} />)
    expect(out).toContain('Credit on account: ')
    expect(out).toContain('$125.50')
    expect(out).toContain('applies this credit')
  })
  it('pay variant says the amount is not reduced and the resident can pay the rest', () => {
    const out = html(<CreditOnAccountCard credit={{ total: 20, unitIds: ['u1'] }} variant="pay" />)
    expect(out).toContain('not taken off the amount above')
    expect(out).toContain('pay the remaining balance')
  })
  it('renders nothing when the credit is null (zero, M7 off or failed read)', () => {
    expect(html(<CreditOnAccountCard credit={null} />)).toBe('')
    expect(html(<CreditOnAccountCard credit={{ total: 0, unitIds: [] }} />)).toBe('')
  })
})
