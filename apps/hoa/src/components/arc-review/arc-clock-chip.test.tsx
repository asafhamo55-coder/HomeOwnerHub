import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { arcClock, type ArcClockSettings } from '@/lib/arc-review/clock'
import { ArcClockChip, ArcOverdueBanner } from './ArcClockChip'

// BL-113: the days-left chip on /arc and /arc/[id], and the overdue banner.

;(globalThis as { React?: typeof React }).React = React
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

const CAL30: ArcClockSettings = { days: 30, dayKind: 'calendar' }
const now = '2026-10-20T16:00:00.000Z'
const clockFor = (submitted: string, status = 'submitted') =>
  arcClock({ status, submittedAt: `${submitted}T16:00:00.000Z`, settings: CAL30, now })

describe('ArcClockChip', () => {
  it('neutral with days left', () => {
    const out = html(<ArcClockChip clock={clockFor('2026-10-10')} />)
    expect(out).toContain('data-tone="ok"')
    expect(out).toContain('20 days left')
    expect(out).toContain('text-foreground-secondary')
  })

  it('amber at 7 days or fewer', () => {
    const out = html(<ArcClockChip clock={clockFor('2026-09-27')} />)
    expect(out).toContain('data-tone="soon"')
    expect(out).toContain('7 days left')
    expect(out).toContain('text-warning')
  })

  it('red when overdue, with the due date in the title', () => {
    const out = html(<ArcClockChip clock={clockFor('2026-09-15')} />)
    expect(out).toContain('data-tone="overdue"')
    expect(out).toContain('5 days overdue')
    expect(out).toContain('text-danger')
    expect(out).toContain('title="Decide by Oct 15, 2026"')
  })

  it('renders nothing once decided', () => {
    expect(html(<ArcClockChip clock={clockFor('2026-09-15', 'approved')} />)).toBe('')
  })
})

describe('ArcOverdueBanner', () => {
  it('explains deemed approval without citing a statute we do not hold', () => {
    const out = html(<ArcOverdueBanner clock={clockFor('2026-09-15')} state="TX" />)
    expect(out).toContain('Decision overdue — was due Oct 15, 2026')
    expect(out).toContain('Some declarations treat an application as approved')
    expect(out).toContain('Check your declaration')
    expect(out).not.toContain('§')
  })

  it('adds the Florida written-denial note for a Florida association', () => {
    const out = html(<ArcOverdueBanner clock={clockFor('2026-09-15')} state="FL" />)
    expect(out).toContain('720.3035(4)(a)')
  })

  it('shows nothing before the deadline', () => {
    expect(html(<ArcOverdueBanner clock={clockFor('2026-09-27')} state="FL" />)).toBe('')
    expect(html(<ArcOverdueBanner clock={null} state="FL" />)).toBe('')
  })
})
