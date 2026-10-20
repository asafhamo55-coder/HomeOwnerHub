import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children),
}))

const { ReserveSnapshotCard } = await import('./ReserveSnapshotCard')

const snapshot = {
  funds: [{ id: 'fund-res', name: 'Reserve Fund' }],
  asOf: '2026-06-30',
  year: { start: '2026-01-01', end: '2026-12-31' },
  balance: 97_150.25,
  contributionsYtd: 4_000,
  interestYtd: 150.25,
  drawsYtd: 7_000,
  budget: { annual: 24_000, ytd: 11_901.37, source: 'reserve_fund' as const },
  behindBudget: true,
}

describe('ReserveSnapshotCard (BL-120)', () => {
  it('shows balance, contributions against budget, draws and the behind-budget warning', () => {
    const html = renderToStaticMarkup(<ReserveSnapshotCard result={{ kind: 'ready', snapshot }} />)
    expect(html).toContain('$97,150')
    expect(html).toContain('$4,000')
    expect(html).toContain('of $11,901 budgeted')
    expect(html).toContain('$7,000')
    expect(html).toContain('Behind budget')
    expect(html).toContain('more than 10%')
  })

  it('no reserve fund: a set-up prompt linking to the funds, not zeros', () => {
    const html = renderToStaticMarkup(<ReserveSnapshotCard result={{ kind: 'no_reserve_fund' }} />)
    expect(html).toContain('Set up a reserve fund')
    expect(html).toContain('href="/accounting/coa#funds"')
    expect(html).not.toContain('$0')
  })

  it('a failed read says so', () => {
    const html = renderToStaticMarkup(<ReserveSnapshotCard result={null} />)
    expect(html).toContain('Couldn’t load the reserve fund')
  })

  it('shows a state hint only when given', () => {
    const html = renderToStaticMarkup(
      <ReserveSnapshotCard result={{ kind: 'ready', snapshot: { ...snapshot, behindBudget: false } }} hint={{ cite: 'Cal. Civ. Code § 5300(b)(2)', text: 'x' }} />,
    )
    expect(html).toContain('Cal. Civ. Code § 5300(b)(2)')
    expect(html).not.toContain('Behind budget')
  })
})
