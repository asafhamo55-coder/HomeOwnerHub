import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isValidAccent } from '@/lib/email/palette'
import { REPORT_ACCENT, renderMonthlyReportEmail } from './render'
import { reportFixture } from './fixtures'

const links = { appUrl: (p: string) => `https://app.example.test${p}` }

describe('renderMonthlyReportEmail', () => {
  it('leads with the headline numbers in plain language', () => {
    const { subject, html, text } = renderMonthlyReportEmail(reportFixture(), links)
    expect(subject).toBe('Maple Creek HOA: September 2026 board report')
    for (const out of [html, text]) {
      expect(out).toContain('$48,210.50') // operating cash
      expect(out).toContain('$27,450.00 (92% of billed)')
      expect(out).toContain('$6,420.00 across 7 units')
      expect(out).toContain('$2,100.00') // 90+ days
      expect(out).toContain('$2,350 over budget ($14,350 of $12,000)')
      expect(out).toContain('$1,200 more than budgeted')
      expect(out).toContain('2 at month end') // past cure
      expect(out).toContain('3 (2 approved, 1 denied)')
      expect(out).toContain('5 items')
      expect(out).toContain('Oct 14, 2026')
    }
  })

  it('links to the board packet for the next meeting', () => {
    const { html, text } = renderMonthlyReportEmail(reportFixture(), links)
    expect(html).toContain('href="https://app.example.test/meetings/mtg-1/packet"')
    expect(text).toContain('Open the full board packet: https://app.example.test/meetings/mtg-1/packet')
  })

  it('falls back to /accounting/reports when no meeting is scheduled', () => {
    const { html } = renderMonthlyReportEmail(reportFixture({ meeting: { ok: true, data: null } }), links)
    expect(html).toContain('None scheduled yet')
    expect(html).toContain('href="https://app.example.test/accounting/reports"')
  })

  it('says "couldn\'t load" for a failed section and never shows its numbers as zeros', () => {
    const { html, text } = renderMonthlyReportEmail(
      reportFixture({ cash: { ok: false }, delinquency: { ok: false }, approvals: { ok: false } }),
      links,
    )
    for (const out of [html, text]) {
      expect(out).toContain('We couldn’t load the balance sheet')
      expect(out).toContain('We couldn’t load overdue charges')
      expect(out).toContain('We couldn’t count the approvals')
      expect(out).not.toContain('Operating cash')
      expect(out).not.toContain('Approvals waiting now')
      expect(out).not.toContain('Nothing overdue')
    }
    // The sections that did load still print.
    expect(html).toContain('$27,450.00')
  })

  it('every section can fail on its own and the email still renders', () => {
    const failed = { ok: false } as const
    const { html } = renderMonthlyReportEmail(
      reportFixture({
        cash: failed,
        reserves: failed,
        income: failed,
        collections: failed,
        delinquency: failed,
        budget: failed,
        violations: failed,
        arc: failed,
        approvals: failed,
        meeting: failed,
        compliance: failed,
      }),
      links,
    )
    expect(html.match(/We couldn’t/g)).toHaveLength(11)
    expect(html).not.toMatch(/\$0\.00/)
  })

  describe('reserves (BL-120)', () => {
    const ready = reportFixture().reserves
    if (!ready.ok || ready.data.result.kind !== 'ready') throw new Error('fixture')
    const snap = ready.data.result.snapshot

    it('shows the balance, contributions against the budget so far, and draws', () => {
      const { html, text } = renderMonthlyReportEmail(reportFixture(), links)
      expect(html).toContain('Reserves as of Sep 30, 2026')
      expect(text).toContain('RESERVES AS OF SEP 30, 2026')
      for (const out of [html, text]) {
        expect(out).toContain('$121,480.40')
        expect(out).toContain('$13,500.00 of $17,950.68 budgeted so far')
        expect(out).toContain('Contributions trail the budget by more than 10%')
        expect(out).toContain('$210.40') // interest
        expect(out).toContain('$6,000.00') // drawn
        expect(out).toContain('runs from Jan 1, 2026')
      }
      expect(text).toContain('Open the balance sheet: https://app.example.test/accounting/reports/balance-sheet')
    })

    it('no warning when contributions are on track, and says when nothing is budgeted', () => {
      const onTrack = renderMonthlyReportEmail(
        reportFixture({ reserves: { ok: true, data: { result: { kind: 'ready', snapshot: { ...snap, behindBudget: false } }, hint: null } } }),
        links,
      ).text
      expect(onTrack).not.toContain('Behind budget')
      const unbudgeted = renderMonthlyReportEmail(
        reportFixture({
          reserves: { ok: true, data: { result: { kind: 'ready', snapshot: { ...snap, budget: null, behindBudget: false } }, hint: null } },
        }),
        links,
      ).text
      expect(unbudgeted).toContain('$13,500.00 (no contribution budgeted)')
    })

    it('no reserve fund: a gentle set-up prompt, not zeros', () => {
      const { html, text } = renderMonthlyReportEmail(
        reportFixture({ reserves: { ok: true, data: { result: { kind: 'no_reserve_fund' }, hint: null } } }),
        links,
      )
      expect(text).toContain('No reserve fund is set up yet')
      expect(text).toContain('Set up a reserve fund: https://app.example.test/accounting/coa#funds')
      expect(html).toContain('href="https://app.example.test/accounting/coa#funds"')
      expect(text).not.toContain('Reserve balance')
    })

    it('a state hint only when one is given, with its citation', () => {
      const fl = renderMonthlyReportEmail(
        reportFixture({
          reserves: {
            ok: true,
            data: { result: { kind: 'ready', snapshot: snap }, hint: { cite: 'Fla. Stat. § 720.303(6)(h)', text: 'Reserve funds stay in the reserve account.' } },
          },
        }),
        links,
      ).text
      expect(fl).toContain('Fla. Stat. § 720.303(6)(h): Reserve funds stay in the reserve account.')
      expect(renderMonthlyReportEmail(reportFixture(), links).text).not.toContain('Stat.')
    })
  })

  it('says "no budget" and "nothing overdue" in words when that is the truth', () => {
    const { html } = renderMonthlyReportEmail(
      reportFixture({
        budget: { ok: true, data: { hasBudget: false, top: [] } },
        delinquency: { ok: true, data: { total: 0, units: 0, over90: 0 } },
      }),
      links,
    )
    expect(html).toContain('No budget covers this month')
    expect(html).toContain('Nothing overdue')
  })

  it('escapes the association name and carries the opt-out link', () => {
    const { html, text } = renderMonthlyReportEmail(reportFixture({ associationName: 'Oak & <Elm>' }), links)
    expect(html).toContain('Oak &amp; &lt;Elm&gt;')
    expect(html).not.toContain('<Elm>')
    expect(html).toContain('https://app.example.test/settings/notifications')
    expect(text).toContain('Turn off the monthly board report: https://app.example.test/settings/notifications')
  })

  it('carries no resident contact details', () => {
    const { html, text } = renderMonthlyReportEmail(reportFixture(), links)
    expect(`${html}${text}`).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
    expect(`${html}${text}`).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/)
  })

  it('is mobile-friendly: the card shrinks to the screen', () => {
    expect(renderMonthlyReportEmail(reportFixture(), links).html).toContain('max-width:600px')
  })

  it('uses a dark-mode-safe accent', () => {
    expect(isValidAccent(REPORT_ACCENT)).toBe(true)
  })

  // `MONTHLY_REPORT_PREVIEW=1 pnpm vitest run apps/hoa/src/lib/monthly-report/render.test.ts`
  // writes the rendered fixtures to .ui-shots/ (gitignored) for a human look.
  it.runIf(process.env.MONTHLY_REPORT_PREVIEW === '1')('writes preview files', () => {
    const dir = resolve(__dirname, '../../../../../.ui-shots')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'monthly-report-email.html'), renderMonthlyReportEmail(reportFixture(), links).html)
    writeFileSync(
      resolve(dir, 'monthly-report-email-failed-sections.html'),
      renderMonthlyReportEmail(reportFixture({ cash: { ok: false }, delinquency: { ok: false }, approvals: { ok: false } }), links).html,
    )
  })

  describe('state law compliance (BL-145)', () => {
    it('counts, the most pressing obligation, and a link to /compliance', () => {
      const { html, text } = renderMonthlyReportEmail(reportFixture(), links)
      expect(text).toContain('STATE LAW COMPLIANCE')
      expect(text).toContain('Overdue: None — on track')
      expect(text).toContain('Coming up: 2 obligations')
      expect(text).toContain('Most pressing: Register with the Georgia Secretary of State — Takes effect in 92 days (Jan 1, 2027)')
      expect(html).toContain('/compliance')
    })

    it('BL-151: a director elections line from the election planner, and none when no election applies', () => {
      const { text } = renderMonthlyReportEmail(reportFixture(), links)
      expect(text).toContain('Director elections: Send the annual meeting notice by Dec 25, 2026')
      const none = renderMonthlyReportEmail(
        reportFixture({ compliance: { ok: true, data: { open: 0, overdue: 0, done: 0, next: null, nothingTracked: false, election: null } } }),
        links,
      )
      expect(none.text).not.toContain('Director elections')
    })

    it('overdue obligations read in red; nothing loaded says so in words', () => {
      const overdue = renderMonthlyReportEmail(
        reportFixture({
          compliance: {
            ok: true,
            data: { open: 1, overdue: 1, done: 0, next: { title: 'Hold the annual members’ meeting, with 21 days’ notice', label: 'No annual meeting since Mar 3, 2025', associationName: 'X' }, nothingTracked: false, election: null },
          },
        }),
        links,
      )
      expect(overdue.text).toContain('Overdue: 1 obligation')
      expect(overdue.html).toContain('#B42318')
      const none = renderMonthlyReportEmail(
        reportFixture({ compliance: { ok: true, data: { open: 0, overdue: 0, done: 0, next: null, nothingTracked: true, election: null } } }),
        links,
      )
      expect(none.text).toContain('None loaded for your state — check your governing documents')
    })
  })
})
