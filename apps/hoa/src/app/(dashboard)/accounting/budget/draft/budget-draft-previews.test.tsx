import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-029 "Draft next year's budget": component tests and static HTML
// previews of the review screen — a full draft, the reserve floor, a blank
// template (no prior data), and next year not open in the books. Rendered
// from fixtures; no browser, no database. Writes files only when
// BUDGET_DRAFT_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   BUDGET_DRAFT_PREVIEW_DIR=.ui-shots/budget-draft pnpm exec vitest run "apps/hoa/src/app/(dashboard)/accounting/budget/draft/budget-draft-previews.test.tsx"

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/accounting/budget/draft',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/budget-draft-actions', () => ({ saveDraftBudget: vi.fn(), summarizeDraftBudget: vi.fn() }))

const { ToastProvider, ConfirmProvider } = await import('@homeowner-portal/ui')
const { BudgetDraftEditor } = await import('./BudgetDraftEditor')
type Props = React.ComponentProps<typeof BudgetDraftEditor>
type Source = Props['source']

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </ToastProvider>,
  ).replace(/<!-- -->/g, '')

const id = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`
const acct = (n: number, number: string, name: string, type: 'income' | 'expense') => ({ id: id(n), number, name, type })

const SOURCE: Source = {
  accounts: [
    acct(1, '4000', 'Assessment Income', 'income'),
    acct(2, '4100', 'Late Fee Income', 'income'),
    acct(3, '5000', 'Landscaping', 'expense'),
    acct(4, '5020', 'Insurance', 'expense'),
    acct(5, '5050', 'Professional Fees (Legal/Accounting)', 'expense'),
    acct(6, '5800', 'Reserve Contribution', 'expense'),
    acct(7, '5900', 'Bank Fees', 'expense'),
  ],
  priorBudget: { [id(1)]: 120_000, [id(3)]: 24_000, [id(4)]: 10_000, [id(5)]: 2_000, [id(6)]: 15_000 },
  actuals: { [id(1)]: 118_500, [id(2)]: 640, [id(3)]: 26_100, [id(4)]: 9_400, [id(6)]: 9_000 },
  actualMonths: 12,
  reserveAccountIds: [id(6)],
}

const BASE: Props = {
  funds: [
    { id: 'f-op', name: 'Operating Fund' },
    { id: 'f-res', name: 'Reserve Fund' },
  ],
  fundId: 'f-op',
  fundName: 'Operating Fund',
  targets: [{ id: 'fy27', label: 'FY 2027' }],
  targetId: 'fy27',
  yearLabel: 'FY 2027',
  nextYearMissingLabel: null,
  sourceLabel: 'FY 2026 budget (approved)',
  windowLabel: 'Oct 19, 2025 – Oct 18, 2026',
  source: SOURCE,
}

const BLANK: Props = { ...BASE, sourceLabel: null, source: { ...SOURCE, priorBudget: {}, actuals: {}, actualMonths: 0 } }
const NOT_OPEN: Props = { ...BASE, targets: [], targetId: null, nextYearMissingLabel: 'FY 2027' }

describe('BudgetDraftEditor (rendered)', () => {
  it('every line shows last year, the actuals, the suggestion and its reason, in an editable amount', () => {
    const out = html(<BudgetDraftEditor {...BASE} />)
    expect(out).toContain('Last year budget $24,000, actual $26,100, +3%')
    expect(out).toContain('value="26883"')
    expect(out).toContain('aria-label="Amount for 5000 Landscaping"')
    expect(out).toContain('No budget last year, actual $640, +3%')
    expect(out).toContain('No budget or activity last year — enter an amount')
    expect(out).toContain('value="3"') // the inflation input, default 3%
    expect(out).toContain('FY 2026 budget (approved)')
    expect(out).toContain('Oct 19, 2025 – Oct 18, 2026')
  })

  it('flags the reserve floor on its line', () => {
    const out = html(<BudgetDraftEditor {...BASE} />)
    expect(out).toContain('kept at last year’s $15,000 (reserve contributions don’t go down in a draft)')
    expect(out).toContain('Reserve floor')
  })

  it('totals and the main changes are computed from the amounts on screen', () => {
    const out = html(<BudgetDraftEditor {...BASE} />)
    expect(out).toContain('$122,714') // income 122,055 + 659
    expect(out).toContain('$53,625')
    expect(out).toContain('Main changes vs last year')
    expect(out).toContain('Landscaping')
    expect(out).toContain('+$2,883')
    expect(out).toContain('Write a summary with AI')
  })

  it('saving is a confirmed step that makes a DRAFT', () => {
    const out = html(<BudgetDraftEditor {...BASE} />)
    expect(out).toContain('Save as draft budget')
    expect(out).toContain('Nothing is saved until you select Save as draft budget')
  })

  it('no prior data: says why every line is blank and still lets the board fill it in', () => {
    const out = html(<BudgetDraftEditor {...BLANK} />)
    expect(out).toContain('Nothing to start from yet')
    expect(out).toContain('no earlier budget for Operating Fund and no posted activity in the last 12 months')
    expect(out).toContain('Save as draft budget')
    expect(out).not.toContain('Main changes vs last year</')
  })

  it('next year not open in the books: explains, and Save is off', () => {
    const out = html(<BudgetDraftEditor {...NOT_OPEN} />)
    expect(out).toContain('FY 2027 isn’t open in the books yet')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>.*Save as draft budget/s)
  })

  it('a short history says it was annualized', () => {
    const short = { ...BASE, source: { ...SOURCE, actualMonths: 6, actuals: { [id(3)]: 13_000 } } }
    const out = html(<BudgetDraftEditor {...short} />)
    expect(out).toContain('actual $13,000 over 6 months (about $26,000 a year)')
    expect(out).toContain('Your books cover 6 of the last 12 months')
  })
})

// ─── Previews ────────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'draft-full': { title: 'Draft next year’s budget — from FY 2026 budget + actuals', body: () => <BudgetDraftEditor {...BASE} /> },
  'draft-blank': { title: 'Draft — no prior year data (blank template)', body: () => <BudgetDraftEditor {...BLANK} /> },
  'draft-next-year-missing': { title: 'Draft — next fiscal year not open yet', body: () => <BudgetDraftEditor {...NOT_OPEN} /> },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8"><h1 class="text-2xl font-semibold">Draft next year’s budget</h1>${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 2600 : 1700}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('budget draft previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.BUDGET_DRAFT_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../../../../.next/static/css')
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
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Budget draft previews</title><ul>${index.join('')}</ul>`)
  })
})
