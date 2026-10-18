import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-076 "Open next fiscal year" on Fiscal periods: component tests and
// static HTML previews — before (admin sees the action), after (next year
// listed as open, "Starts Jan 1, 2027", no Close button, this year still
// current), and the budget draft's "not open yet" state with the action.
// Rendered from fixtures; no browser, no database. Writes files only when
// FISCAL_YEAR_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   FISCAL_YEAR_PREVIEW_DIR=.ui-shots/open-next-fiscal-year pnpm exec vitest run "apps/hoa/src/app/(dashboard)/accounting/periods/periods-previews.test.tsx"

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/accounting/periods',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/accounting/fiscal-year-actions', () => ({ openNextFiscalYear: vi.fn() }))
vi.mock('@/lib/periods', () => ({ closePeriod: vi.fn() }))
vi.mock('@/lib/budget-draft-actions', () => ({ saveDraftBudget: vi.fn(), summarizeDraftBudget: vi.fn() }))
vi.mock('@/lib/association-setup-actions', () => ({ openBooks: vi.fn(), setUpAssociation: vi.fn() }))

const { ToastProvider, ConfirmProvider, DataTable, Page } = await import('@homeowner-portal/ui')
const { periodColumns } = await import('./columns')
const { OpenNextFiscalYearButton } = await import('../_components/OpenNextFiscalYearButton')
const { BudgetDraftEditor } = await import('../budget/draft/BudgetDraftEditor')
const { nextFiscalYearOffer } = await import('@/lib/accounting/open-next-fiscal-year')

type Period = Parameters<ReturnType<typeof periodColumns>[number]['cell']>[0]

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </ToastProvider>,
  ).replace(/<!-- -->/g, '')

const period = (id: string, start: string, end: string, status = 'open', closedAt: string | null = null): Period =>
  ({ id, organization_id: 'org-1', association_id: 'a1', start_date: start, end_date: end, status, closed_at: closedAt, closed_by: null }) as Period

const TODAY = '2026-10-18'
const FY25 = period('fy25', '2025-01-01', '2025-12-31', 'closed', '2026-01-20T15:00:00Z')
const FY26 = period('fy26', '2026-01-01', '2026-12-31')
const FY27 = period('fy27', '2027-01-01', '2027-12-31')

function PeriodsScreen({ rows, admin }: { rows: Period[]; admin: boolean }) {
  const offer = admin ? nextFiscalYearOffer(rows, TODAY) : null
  return (
    <Page
      title="Fiscal periods"
      description="Closing a period moves its income and expenses into each fund’s balance and locks it. Closed periods still accept reversing entries. The board packet is a PDF of the period’s statements."
      actions={offer ? <OpenNextFiscalYearButton {...offer} /> : undefined}
    >
      <DataTable caption="Fiscal periods" mobile="cards" columns={periodColumns(TODAY, 'fy26')} rows={rows} rowKey={(p) => p.id} />
    </Page>
  )
}

const DRAFT_SOURCE = {
  accounts: [
    { id: 'a1', number: '4000', name: 'Assessment Income', type: 'income' as const },
    { id: 'a3', number: '5000', name: 'Landscaping', type: 'expense' as const },
  ],
  priorBudget: { a1: 120_000, a3: 24_000 },
  actuals: { a1: 118_500, a3: 26_100 },
  actualMonths: 12,
  reserveAccountIds: [],
}
const DRAFT_NOT_OPEN = {
  funds: [{ id: 'f-op', name: 'Operating Fund' }],
  fundId: 'f-op',
  fundName: 'Operating Fund',
  targets: [],
  targetId: null,
  yearLabel: 'FY 2027',
  nextYearMissingLabel: 'FY 2027',
  sourceLabel: 'FY 2026 budget (approved)',
  windowLabel: 'Oct 19, 2025 – Oct 18, 2026',
  source: DRAFT_SOURCE,
}

describe('Fiscal periods — Open next fiscal year (rendered)', () => {
  it('an admin is offered next year, named in the confirm', () => {
    expect(nextFiscalYearOffer([FY25, FY26], TODAY)).toEqual({ label: 'FY 2027', range: 'Jan 1 – Dec 31, 2027', currentLabel: 'FY 2026' })
    const out = html(<PeriodsScreen rows={[FY26, FY25]} admin />)
    expect(out).toContain('Open next fiscal year')
  })

  it('a board member is not offered the action', () => {
    expect(html(<PeriodsScreen rows={[FY26, FY25]} admin={false} />)).not.toContain('Open next fiscal year')
  })

  it('once open: next year is listed as open and starting Jan 1, cannot be closed yet, and this year is still current', () => {
    expect(nextFiscalYearOffer([FY25, FY26, FY27], TODAY)).toBeNull()
    const out = html(<PeriodsScreen rows={[FY27, FY26, FY25]} admin />)
    expect(out).not.toContain('Open next fiscal year')
    expect(out).toContain('FY 2027')
    expect(out).toContain('Starts Jan 1, 2027')
    expect(out).toContain('Current period')
    // Only FY 2026 can be closed: FY 2027 hasn't started, FY 2025 is closed.
    // (DataTable renders a table and mobile cards, so compare with FY 2026 alone.)
    const closes = (s: string) => s.match(/Close period/g)?.length ?? 0
    expect(closes(out)).toBe(closes(html(<PeriodsScreen rows={[FY26]} admin={false} />)))
    expect(closes(html(<PeriodsScreen rows={[FY27]} admin={false} />))).toBe(0)
  })
})

describe('Budget draft — next year not open (rendered)', () => {
  it('an admin gets the action inside the warning', () => {
    const offer = nextFiscalYearOffer([FY25, FY26], TODAY)
    const out = html(<BudgetDraftEditor {...DRAFT_NOT_OPEN} openNextYear={offer} />)
    expect(out).toContain('FY 2027 isn’t open in the books yet')
    expect(out).toContain('Open next fiscal year')
    expect(out).toContain('FY 2026 stays the current year until FY 2027 starts')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>.*Save as draft budget/s)
  })

  it('a board member is pointed to an admin, with no action', () => {
    const out = html(<BudgetDraftEditor {...DRAFT_NOT_OPEN} openNextYear={null} />)
    expect(out).not.toContain('Open next fiscal year')
    expect(out).toContain('An admin of your HOA can open it from Accounting › Fiscal periods.')
  })

  it('after opening: FY 2027 is the target and Save is on', () => {
    const out = html(<BudgetDraftEditor {...DRAFT_NOT_OPEN} nextYearMissingLabel={null} targets={[{ id: 'fy27', label: 'FY 2027' }]} targetId="fy27" />)
    expect(out).not.toContain('isn’t open in the books yet')
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>.*Save as draft budget/s)
  })
})

// ─── Previews ────────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'periods-before': { title: 'Fiscal periods — admin, next year not open', body: () => <PeriodsScreen rows={[FY26, FY25]} admin /> },
  'periods-after': { title: 'Fiscal periods — FY 2027 opened, FY 2026 still current', body: () => <PeriodsScreen rows={[FY27, FY26, FY25]} admin /> },
  'draft-open-next-year': {
    title: 'Budget draft — next year not open, admin can open it',
    body: () => <BudgetDraftEditor {...DRAFT_NOT_OPEN} openNextYear={nextFiscalYearOffer([FY25, FY26], TODAY)} />,
  },
  'draft-board-not-open': { title: 'Budget draft — next year not open, board member', body: () => <BudgetDraftEditor {...DRAFT_NOT_OPEN} /> },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1400 : 900}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('open next fiscal year previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.FISCAL_YEAR_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../../../.next/static/css')
    if (!existsSync(cssDir)) throw new Error('build apps/hoa first (rtk pnpm build) for the stylesheet')
    const css = readdirSync(cssDir).filter((f) => f.endsWith('.css'))
    for (const f of css) copyFileSync(join(cssDir, f), join(dir, f))
    const index: string[] = []
    for (const [name, p] of Object.entries(PREVIEWS)) {
      const inner = html(p.body())
      writeFileSync(join(dir, `${name}.light.html`), frameDoc(inner, css, false))
      writeFileSync(join(dir, `${name}.dark.html`), frameDoc(inner, css, true))
      writeFileSync(join(dir, `${name}.html`), indexDoc(p.title, name))
      index.push(`<li><a href="${name}.html">${p.title}</a></li>`)
    }
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Open next fiscal year previews</title><ul>${index.join('')}</ul>`)
  })
})
