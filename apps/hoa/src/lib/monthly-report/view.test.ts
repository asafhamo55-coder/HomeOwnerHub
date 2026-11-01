import { describe, expect, it } from 'vitest'
import { usd } from '@/lib/money/format'
import { buildReportView, unavailableSentence } from './view'
import { renderMonthlyReportEmail } from './render'
import { emptyMonthFixture, reportFixture } from './fixtures'

const links = { appUrl: (p: string) => `https://app.example.test${p}` }

describe('buildReportView summary', () => {
  it('headline figures equal the inputs', () => {
    const d = reportFixture()
    const { figures } = buildReportView(d, links).summary
    expect(figures.map((f) => f.value)).toEqual([usd(48_210.5), usd(27_450), usd(6_420), usd(3_559.88)])
    expect(figures[1]!.sub).toBe(`of ${usd(30_000)} billed (92%)`)
    expect(figures[2]!.sub).toBe('across 7 units')
  })

  it('sentences are templates over the data', () => {
    const { sentences, attention, headline, tone } = buildReportView(reportFixture(), links).summary
    expect(sentences).toContain('Income was $31,500.00 and expenses were $27,940.12, leaving $3,559.88 more income than expenses.')
    expect(sentences).toContain('$6,420.00 is overdue across 7 units, and $2,100.00 of it is more than 90 days late.')
    expect(sentences).toContain('The line furthest from budget is Landscaping, $2,350 over budget.')
    expect(attention.map((a) => a.text)).toContain('5 approvals waiting for the board.')
    expect(attention.map((a) => a.text)).toContain('2 violations past the cure deadline at month end.')
    expect(tone).toBe('attention')
    expect(headline).toBe('September 2026: 5 items to look at.')
  })

  it('never claims anything about a section that failed', () => {
    const f = { ok: false } as const
    const { summary } = buildReportView(reportFixture({ income: f, collections: f, delinquency: f, cash: f, approvals: f, violations: f }), links)
    const all = [...summary.sentences, ...summary.attention.map((a) => a.text)].join(' ')
    expect(all).not.toMatch(/Income was|Payments received|overdue|Operating cash|waiting for the board|violation/)
    expect(summary.figures.filter((x) => x.unavailable)).toHaveLength(4)
    expect(summary.figures.map((x) => x.value)).not.toContain('$0.00')
    expect(summary.unavailable).toContain('cash')
    expect(unavailableSentence(['cash', 'overdue dues'])).toBe('We couldn’t load cash and overdue dues, so those sections are left out below.')
  })

  it('a clean month is not called flagged when something is missing', () => {
    const d = reportFixture({
      reserves: { ok: true, data: { result: { kind: 'no_reserve_fund' }, hint: null } },
      violations: { ok: true, data: { opened: 1, closed: 1, pastCure: 0 } },
      approvals: { ok: true, data: 0 },
      delinquency: { ok: true, data: { total: 0, units: 0, over90: 0 } },
      budget: { ok: true, data: { hasBudget: true, top: [] } },
    })
    expect(buildReportView(d, links).summary.headline).toBe('September 2026: nothing in this report is flagged.')
    const partial = buildReportView({ ...d, arc: { ok: false } }, links).summary
    expect(partial.tone).toBe('partial')
    expect(partial.headline).toContain('in the sections that loaded')
  })

  it('an empty month is said in words, with no zero rows', () => {
    const view = buildReportView(emptyMonthFixture(), links)
    expect(view.summary.tone).toBe('quiet')
    expect(view.summary.headline).toBe('No activity was recorded in September 2026.')
    expect(view.summary.attention).toEqual([])
    const lines = view.sections.flatMap((b) => b.lines ?? [])
    expect(lines.map((l) => l.value)).toContain('No charges came due and no payments were received')
    expect(lines.map((l) => l.value)).toContain('Nothing was posted this month')
    expect(lines.map((l) => l.label)).not.toContain('Billed')
    expect(lines.map((l) => l.label)).not.toContain('Opened')
    const { html, text } = renderMonthlyReportEmail(emptyMonthFixture(), links)
    expect(html).toContain('No activity was recorded in September 2026.')
    expect(text).toContain('No activity was recorded in September 2026.')
    expect(html).not.toContain('Billed')
  })

  it('copy has no em dashes', () => {
    for (const d of [reportFixture(), emptyMonthFixture()]) {
      const { html, text } = renderMonthlyReportEmail(d, links)
      expect(html + text).not.toContain('—')
    }
  })
})
