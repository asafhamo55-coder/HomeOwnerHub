import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/lib/periods', () => ({ closePeriod: vi.fn() }))

const { ToastProvider, ConfirmProvider } = await import('@homeowner-portal/ui')
const { ClosePeriodDescription } = await import('./ClosePeriodButton')
const { periodColumns } = await import('./columns')
const { periodHasEnded, unreconciledAccounts, COULD_NOT_CHECK_DRAFTS } = await import('./close-checks-shared')

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </ToastProvider>,
  ).replace(/<!-- -->/g, '').replace(/&#x27;/g, "'")

describe('close dialog warnings', () => {
  it('renders each warning with its count', () => {
    const out = html(
      <ClosePeriodDescription
        endDate="2026-09-30"
        checks={{
          drafts: { ok: true, n: 3 },
          proposals: { ok: true, n: 2 },
          unreconciled: { ok: true, accounts: ['Operating Checking'] },
        }}
      />,
    )
    expect(out).toContain('3 draft journal entries are dated in this period. They won’t be included.')
    expect(out).toContain('2 bank proposals are waiting for review.')
    expect(out).toContain('Operating Checking isn’t reconciled through Sep 30, 2026.')
  })

  it('shows nothing extra when every check is clear', () => {
    const out = html(
      <ClosePeriodDescription
        endDate="2026-09-30"
        checks={{ drafts: { ok: true, n: 0 }, proposals: { ok: true, n: 0 }, unreconciled: { ok: true, accounts: [] } }}
      />,
    )
    expect(out).not.toContain('Before you close')
  })

  it('a failed count read says it could not check, never a zero', () => {
    const out = html(
      <ClosePeriodDescription
        endDate="2026-09-30"
        checks={{ drafts: { ok: false }, proposals: { ok: true, n: 0 }, unreconciled: { ok: true, accounts: [] } }}
      />,
    )
    expect(out).toContain(COULD_NOT_CHECK_DRAFTS)
    expect(out).not.toMatch(/0 draft/)
  })
})

describe('end-date rule', () => {
  it('is ended only after the end date, not on it', () => {
    expect(periodHasEnded('2026-09-30', '2026-09-30')).toBe(false)
    expect(periodHasEnded('2026-09-30', '2026-10-01')).toBe(true)
  })

  it('flags accounts never reconciled or reconciled before the end', () => {
    const last = new Map([
      ['a', '2026-09-30T12:00:00Z'],
      ['b', '2026-09-10T12:00:00Z'],
    ])
    const accts = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    expect(unreconciledAccounts(accts, last, '2026-09-30')).toEqual(['B', 'C'])
  })

  it('the close button shows a reason until the period has ended', () => {
    const cols = periodColumns('2026-09-30', null)
    const actions = cols.find((c) => c.key === 'actions')!
    const p = { id: 'p', start_date: '2026-09-01', end_date: '2026-09-30', status: 'open', closed_at: null } as never
    expect(html(<>{actions.cell(p)}</>)).toContain('Can close after Sep 30, 2026')
    const after = periodColumns('2026-10-01', null).find((c) => c.key === 'actions')!
    expect(html(<>{after.cell(p)}</>)).not.toContain('Can close after')
  })
})
