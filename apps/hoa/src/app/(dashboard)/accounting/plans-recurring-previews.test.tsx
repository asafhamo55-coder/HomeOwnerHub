import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-080 (payment plans: Behind / On track / Completed) and BL-081
// (recurring entries: Active / Paused / Stopped, row actions, the edit
// form). Component tests plus static HTML previews rendered from fixtures
// — no browser, no database. Writes files only when
// PLANS_RECURRING_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   PLANS_RECURRING_PREVIEW_DIR=.ui-shots/bl-080-081 pnpm exec vitest run "apps/hoa/src/app/(dashboard)/accounting/plans-recurring-previews.test.tsx"
//
// Each preview is an index page with 375px and 1440px iframes, light and
// dark. Addresses and amounts are invented.

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/accounting/recurring',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/recurring-entries', () => ({ changeRecurringEntryState: vi.fn(), updateRecurringEntry: vi.fn() }))

const { ToastProvider, ConfirmProvider, DataTable, Page, Alert } = await import('@homeowner-portal/ui')
const { paymentPlanColumns, behindCount } = await import('./payment-plans/columns')
const { recurringColumns } = await import('./recurring/columns')
const { RecurringEntryForm } = await import('./recurring/RecurringEntryForm')

type PlanRow = import('@/lib/accounting/queries').PaymentPlanRow
type Standing = import('@/lib/money/plan-standing').PlanStandingView
type Rule = import('./recurring/model').RecurringRuleView
type Options = import('./recurring/model').RecurringOptions

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </ToastProvider>,
  ).replace(/<!-- -->/g, '')

// ─── BL-080 fixtures ────────────────────────────────────────────────

const plan = (id: string, address: string, status: string, over: Partial<PlanRow> = {}): PlanRow => ({
  id,
  unit_id: `u-${id}`,
  total_amount: 1800,
  installment_amount: 300,
  installment_count: 6,
  start_date: '2026-06-01',
  status,
  unit: { address_line1: address, unit_number: null },
  ...over,
})

const PLANS: PlanRow[] = [
  plan('p1', '412 Alder Way', 'active'),
  plan('p2', '18 Birch Ct', 'active', { installment_count: 4, installment_amount: 250, total_amount: 1000, start_date: '2026-09-15' }),
  plan('p3', '77 Cedar Ln', 'completed', { start_date: '2026-03-01' }),
  plan('p4', '9 Dogwood Dr', 'active', { installment_count: 2, installment_amount: 400, total_amount: 800, start_date: '2026-08-01' }),
]
const STANDINGS: Record<string, Standing> = {
  p1: { standing: 'behind', found: 6, settled: 3, overdue: 2, nextDueDate: '2026-09-01', completedOn: null },
  p2: { standing: 'on_track', found: 4, settled: 1, overdue: 0, nextDueDate: '2026-10-15', completedOn: null },
  p3: { standing: null, found: 0, settled: 0, overdue: 0, nextDueDate: null, completedOn: '2026-08-02' },
  p4: { standing: 'paid_off', found: 2, settled: 2, overdue: 0, nextDueDate: null, completedOn: null },
}

function PlansScreen({ standings }: { standings: Record<string, Standing> | null }) {
  const behind = behindCount(standings)
  return (
    <Page title="Payment plans" description="Spread a balance an owner can’t pay at once into monthly installments. Each installment becomes its own charge on the owner’s account.">
      {behind > 0 ? (
        <Alert variant="warning" title={behind === 1 ? '1 plan is behind' : `${behind} plans are behind`} className="mb-4">
          An installment is past its due date and not paid. Automatic dues reminders don’t go to a home on an active plan, so follow up with the owner yourself.
        </Alert>
      ) : null}
      <DataTable caption="Payment plans" mobile="cards" columns={paymentPlanColumns(standings)} rows={PLANS} rowKey={(p) => p.id} />
    </Page>
  )
}

describe('Payment plans — progress (rendered)', () => {
  it('says which plans are behind, on track, paid in full, and when one completed', () => {
    const out = html(<PlansScreen standings={STANDINGS} />)
    expect(out).toContain('1 plan is behind')
    expect(out).toContain('Behind on plan')
    expect(out).toContain('2 installments overdue · 3 of 6 paid')
    expect(out).toContain('On track')
    expect(out).toContain('1 of 4 paid · next due Oct 15, 2026')
    expect(out).toContain('Paid in full · completed Aug 2, 2026')
    expect(out).toContain('Moves to Completed with the next payment check')
  })

  it('a failed progress read says so for active and completed plans, never "On track"', () => {
    const out = html(<PlansScreen standings={null} />)
    expect(out).toContain('Couldn’t load')
    expect(out).not.toContain('On track')
    expect(out).not.toContain('plan is behind')
  })
})

// ─── BL-081 fixtures ────────────────────────────────────────────────

const OPTIONS: Options = {
  today: '2026-10-18',
  accounts: [
    { id: 'cash-op', label: '1010 · Operating Cash', fundId: 'f-op' },
    { id: 'cash-res', label: '1020 · Reserve Cash', fundId: 'f-res' },
    { id: 'mgmt', label: '6100 · Management Fees', fundId: null },
    { id: 'land', label: '6200 · Landscaping', fundId: null },
  ],
  funds: [
    { id: 'f-op', label: 'Operating Fund' },
    { id: 'f-res', label: 'Reserve Fund' },
  ],
  editable: true,
}

const line = (accountId: string, fundId: string, debit: number, credit: number) => ({ accountId, fundId, debit, credit })
const RULES: Rule[] = [
  {
    id: 'r1',
    cadence: 'monthly',
    nextRunDate: '2026-11-01',
    state: 'active',
    template: { id: 'je1', entryNumber: 'JE-2026-00041', memo: 'Monthly management fee', edited: false, lines: [line('mgmt', 'f-op', 1250, 0), line('cash-op', 'f-op', 0, 1250)] },
  },
  {
    id: 'r2',
    cadence: 'quarterly',
    nextRunDate: '2026-10-01',
    state: 'paused',
    template: { id: 'je2', entryNumber: 'TPL-r2-abc', memo: 'Reserve contribution', edited: true, lines: [line('cash-res', 'f-res', 3000, 0), line('cash-op', 'f-op', 0, 3000)] },
  },
  {
    id: 'r3',
    cadence: 'monthly',
    nextRunDate: '2026-07-01',
    state: 'stopped',
    template: { id: 'je3', entryNumber: 'JE-2026-00007', memo: 'Old landscaping contract', edited: false, lines: [line('land', 'f-op', 900, 0), line('cash-op', 'f-op', 0, 900)] },
  },
]

function RecurringScreen({ rules, options = OPTIONS }: { rules: Rule[]; options?: Options }) {
  return (
    <Page title="Recurring entries" description="Entries that post themselves on a schedule — a fresh copy of the template’s lines each run. Edit, pause or stop one from its row.">
      <DataTable caption="Recurring entries" mobile="cards" columns={recurringColumns(options)} rows={rules} rowKey={(r) => r.id} />
    </Page>
  )
}

const FORM_INITIAL = { memo: 'Monthly management fee', cadence: 'monthly', nextRunDate: '2026-11-01', lines: RULES[0].template!.lines }

function EditScreen({ errors = {}, lines = FORM_INITIAL.lines }: { errors?: Record<string, string>; lines?: typeof FORM_INITIAL.lines }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Edit recurring entry</h2>
      <p className="mb-4 text-sm text-muted">Change the amounts, accounts, description or schedule of future copies.</p>
      <RecurringEntryForm
        formId="preview"
        initial={{ ...FORM_INITIAL, lines }}
        accounts={OPTIONS.accounts}
        funds={OPTIONS.funds}
        today={OPTIONS.today}
        errors={errors}
        pending={false}
        onSubmit={() => {}}
      />
    </div>
  )
}

describe('Recurring entries — state and actions (rendered)', () => {
  it('shows Active / Paused / Stopped with the amount, and the edited template label', () => {
    const out = html(<RecurringScreen rules={RULES} />)
    expect(out).toContain('Active')
    expect(out).toContain('Paused')
    expect(out).toContain('Stopped')
    expect(out).toContain('$1,250.00')
    expect(out).toContain('Edited template')
    expect(out).toContain('Copies JE-2026-00041')
  })

  it('active and paused rows offer Edit and more actions; a stopped row offers nothing', () => {
    const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0
    const one = (r: Rule) => html(<RecurringScreen rules={[r]} />)
    expect(count(one(RULES[0]), />Edit</g)).toBeGreaterThan(0)
    expect(one(RULES[1])).toContain('More actions for Reserve contribution')
    expect(count(one(RULES[2]), />Edit</g)).toBe(0)
    expect(one(RULES[2])).not.toContain('More actions for')
  })

  it('without the account list, Edit is not offered but Pause/Stop still are', () => {
    const out = html(<RecurringScreen rules={[RULES[0]]} options={{ ...OPTIONS, editable: false }} />)
    expect(out).not.toMatch(/>Edit</)
    expect(out).toContain('More actions for Monthly management fee')
  })
})

describe('Recurring entries — edit form (rendered)', () => {
  it('shows every field, the fund picker (two funds), the balance line and the posted-entries note', () => {
    const out = html(<EditScreen />)
    for (const label of ['Description', 'Repeats', 'Next run', 'Account', 'Fund', 'Debit', 'Credit']) expect(out).toContain(label)
    expect(out).toContain('min="2026-10-18"')
    expect(out).toContain('Debits $1,250.00 · Credits $1,250.00')
    expect(out).not.toContain('Out of balance')
    expect(out).toContain('Entries already posted don’t change')
  })

  it('out of balance says by how much; server field errors sit on their fields', () => {
    const out = html(
      <EditScreen
        lines={[line('mgmt', 'f-op', 1300, 0), line('cash-op', 'f-op', 0, 1250)]}
        errors={{ nextRunDate: 'Pick today or a later date.', 'lines.0.account': 'Choose an account in this association’s chart of accounts.' }}
      />,
    )
    expect(out).toContain('Out of balance by $50.00')
    expect(out).toContain('Pick today or a later date.')
    expect(out).toContain('Choose an account in this association’s chart of accounts.')
    expect(out).toContain('aria-invalid="true"')
  })
})

// ─── Previews ────────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'plans-progress': { title: 'Payment plans — behind, on track, paid in full, completed (BL-080)', body: () => <PlansScreen standings={STANDINGS} /> },
  'plans-progress-failed': { title: 'Payment plans — progress couldn’t load (BL-080)', body: () => <PlansScreen standings={null} /> },
  'recurring-states': { title: 'Recurring entries — active, paused, stopped (BL-081)', body: () => <RecurringScreen rules={RULES} /> },
  'recurring-edit': { title: 'Recurring entries — edit form (BL-081)', body: () => <EditScreen /> },
  'recurring-edit-errors': {
    title: 'Recurring entries — edit form, out of balance with errors (BL-081)',
    body: () => (
      <EditScreen
        lines={[line('mgmt', 'f-op', 1300, 0), line('cash-op', 'f-op', 0, 1250)]}
        errors={{ nextRunDate: 'Pick today or a later date.', lines: 'Debits (1300.00) and credits (1250.00) must be equal.' }}
      />
    ),
  },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
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

describe('payment plan + recurring previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.PLANS_RECURRING_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../../.next/static/css')
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
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>BL-080 / BL-081 previews</title><ul>${index.join('')}</ul>`)
  })
})
