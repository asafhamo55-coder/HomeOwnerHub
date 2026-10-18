import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Component tests and static HTML previews of the Properties P2 screens:
// the full-width list (table + phone cards) and the property 360 page,
// rendered from fixtures — no browser, no database. Always renders and
// asserts (so a broken component fails here); writes files only when
// PROPERTIES_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   PROPERTIES_PREVIEW_DIR=.ui-shots/properties-p2 pnpm exec vitest run "apps/hoa/src/app/(dashboard)/properties/properties-previews.test.tsx"
//
// Each preview is an index page with 375px and 1440px iframes in light
// and dark. Iframes, not sized divs: Tailwind's md:/lg: are viewport
// queries, and an iframe's viewport is its own width, so the 375 frame
// really is a phone layout. Fixture names and addresses are invented.

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/properties',
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error('redirect')
  },
  notFound: () => {
    throw new Error('notFound')
  },
  unstable_rethrow: () => {},
}))

const { ToastProvider, ConfirmProvider } = await import('@homeowner-portal/ui')
const { PropertyList } = await import('./PropertyList')
const { PropertyListFilters } = await import('./PropertyListFilters')
const { PropertiesHeader } = await import('./PropertiesHeader')
const { PropertyDetailView } = await import('./[id]/PropertyDetailView')
const { default: PropertyLoading } = await import('./[id]/loading')
const { parsePropertyListParams } = await import('@/lib/properties/list-params')
type Row = import('@/lib/properties/list').PropertyListRow
type Data = import('@/lib/properties/property-360').Property360

const NOW = new Date('2026-10-17T15:00:00Z')
const TODAY = '2026-10-17'
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

// ─── List fixtures ───────────────────────────────────────────────────

const STREETS = ['Alder Way', 'Birch Ct', 'Cedar Ln', 'Dogwood Dr', 'Elm St', 'Fir Pl', 'Ginkgo Rd']
const listRow = (i: number, over: Partial<Row> = {}): Row => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  address: `${100 + i * 7} ${STREETS[i % STREETS.length]}, Demo, FL 33000`,
  unitNumber: i % 5 === 0 ? `Unit ${i}` : null,
  ownerName: i % 9 === 4 ? null : `Owner ${String.fromCharCode(65 + (i % 26))}. Example`,
  ownerEmail: i % 3 === 0 ? null : `owner${i}@example.test`,
  ownerPhone: i % 2 === 0 ? `(555) 010-${String(1000 + i).slice(-4)}` : null,
  tenure: i % 4 === 0 ? 'leased' : i % 7 === 3 ? null : 'owner_occupied',
  unitId: `u${i}`,
  balance: i % 4 === 1 ? 180 + i * 35 : 0,
  oldestDueDate: null,
  daysOverdue: i % 8 === 1 ? 64 : i % 4 === 1 ? 12 : 0,
  openViolations: i % 6 === 2 ? 2 : i % 5 === 3 ? 1 : 0,
  violationsPastCure: i % 6 === 2 ? 1 : 0,
  threadsNeedingReply: i % 7 === 5 ? 1 : 0,
  hasOwner: i % 9 !== 4,
  hasTenure: !(i % 7 === 3),
  hasUnitLink: true,
  severityRank: i % 6 === 2 ? 1 : i % 4 === 1 ? 2 : i % 5 === 3 ? 3 : 6,
  needsAttention: i % 6 === 2 || i % 4 === 1 || i % 5 === 3,
  isIncomplete: i % 9 === 4 || i % 7 === 3,
  onWaitingList: i === 6,
  openArc: i % 5 === 1 ? 1 : 0,
  lastActivityAt: i % 10 === 9 ? null : daysAgo(i * 3 + 1),
  lastActivityKind: (['payment', 'violation', 'mail', 'arc', 'history'] as const)[i % 5],
  ...over,
})
const ROWS = Array.from({ length: 22 }, (_, i) => listRow(i + 1))
const counts = { all: 57, attention: 19, incomplete: 6, waiting: 1, owner_occupied: 41, leased: 12, unknown: 4 }

function ListPage({ rows, raw = {}, signalsOk = true }: { rows: Row[]; raw?: Record<string, string>; signalsOk?: boolean }) {
  const params = parsePropertyListParams(raw)
  return (
    <div className="space-y-6">
      <PropertiesHeader orgName="Demo Court HOA" filter={params.filter} total={57} allCount={57} search={params.search} />
      <PropertyListFilters params={params} counts={counts} />
      <PropertyList rows={rows} params={params} signalsOk={signalsOk} allMatches={57} footer={<p className="px-4 py-2 text-xs text-muted">Showing 1–{rows.length} of 57 homes</p>} />
    </div>
  )
}

// ─── 360 fixtures ────────────────────────────────────────────────────

const PID = '11111111-1111-4111-8111-111111111111'
const ok = <T,>(data: T) => ({ ok: true as const, data })
const FAILED = { ok: false as const }

function busyHome(): Data {
  return {
    property: { id: PID, address: '412 Alder Way, Demo, FL 33000', unit_number: null, owner_name: 'Robin Example', owner_email: 'robin@example.test', owner_phone: '(555) 010-0142', notes: null, tenure: 'leased', tenure_updated_at: daysAgo(200), created_at: '2021-03-01T00:00:00Z' },
    unit: ok({ unitId: 'u1' as never, unitIds: ['u1' as never], unitCount: 1, duplicate: false }),
    residents: ok([
      { id: 'r1', property_id: PID, full_name: 'Jordan Tenant', email: 'jordan@example.test', phone: '(555) 010-0177', role: 'tenant', is_primary: true, moved_in_at: '2026-02-01', moved_out_at: null, notes: null, created_at: '2026-02-01T00:00:00Z' },
      { id: 'r2', property_id: PID, full_name: 'Casey Tenant', email: null, phone: null, role: 'family_member', is_primary: false, moved_in_at: '2026-02-01', moved_out_at: null, notes: null, created_at: '2026-02-01T00:00:00Z' },
      { id: 'r3', property_id: PID, full_name: 'Former Renter', email: null, phone: null, role: 'tenant', is_primary: false, moved_in_at: '2024-01-01', moved_out_at: '2025-12-31', notes: null, created_at: '2024-01-01T00:00:00Z' },
    ]),
    events: ok([
      { id: 'e1', property_id: PID, occurred_at: daysAgo(2), kind: 'note', payload: {}, notes: 'Owner called: will pay the balance by the 30th.', created_by: null },
      { id: 'e2', property_id: PID, occurred_at: daysAgo(200), kind: 'tenure_changed', payload: { from: 'owner_occupied', to: 'leased' }, notes: null, created_by: null },
    ]),
    stats: ok({ balance: 742.5, daysOverdue: 77, openViolations: 2, violationsPastCure: 1, threadsNeedingReply: 1 }),
    violations: ok([
      { id: 'v1', description: 'Trash cans visible from the street', status: 'notice_sent', severity: 'minor', created_at: daysAgo(40), notice_sent_at: daysAgo(30), cure_period_days: 14, resolved_at: null },
      { id: 'v2', description: 'Unapproved fence color', status: 'notice_sent', severity: 'moderate', created_at: daysAgo(6), notice_sent_at: daysAgo(5), cure_period_days: 30, resolved_at: null },
      { id: 'v3', description: 'Overgrown lawn', status: 'resolved', severity: 'minor', created_at: daysAgo(120), notice_sent_at: daysAgo(118), cure_period_days: 14, resolved_at: daysAgo(100) },
    ]),
    waitingQueue: ok([]),
    openAssessments: ok([
      { id: 'a1', due_date: '2026-08-01', amount: 325, status: 'open', assessment_type: 'regular', payments: [] },
      { id: 'a2', due_date: '2026-09-01', amount: 325, status: 'partial', assessment_type: 'regular', payments: [{ amount: 232.5 }] },
      { id: 'a3', due_date: '2026-10-01', amount: 325, status: 'open', assessment_type: 'regular', payments: [] },
    ]),
    ledger: ok({
      rows: [
        { id: 'a3', due_date: '2026-10-01', amount: 325, status: 'open', assessment_type: 'regular' },
        { id: 'a2', due_date: '2026-09-01', amount: 325, status: 'partial', assessment_type: 'regular' },
        { id: 'a1', due_date: '2026-08-01', amount: 325, status: 'open', assessment_type: 'regular' },
        { id: 'a0', due_date: '2026-07-01', amount: 325, status: 'paid', assessment_type: 'regular' },
      ],
      total: 31,
    }),
    payments: ok([{ id: 'pm1', amount: 232.5, paid_at: daysAgo(40), payment_method: 'check' }]),
    plans: ok([]),
    collections: ok({ openCase: { id: 'c1', unitId: 'u1', status: 'collection_letter', attorneyFirm: null, attorneyReference: null, openedOn: '2026-09-20', closedOn: null, closedReason: null }, events: [], closed: [] }),
    arc: ok([{ id: 'arc1', summary: 'Replace the back fence', category: 'fence', status: 'submitted', submitted_at: daysAgo(9), board_response_at: null }]),
    threads: ok([{ id: 't1', subject: 'Question about the October charge', status: 'needs_review', lastMessageAt: daysAgo(1) }]),
    notices: ok([{ id: 'n1', communicationId: 'm1', subject: 'Pool closes for the season', category: 'announcement', channel: 'email', deliveryStatus: 'delivered', at: daysAgo(12) }]),
    tenancies: ok([{ id: 'l1', tenant_name: 'Jordan Tenant', tenant_email: 'jordan@example.test', tenant_phone: null, tenant_user_id: null, lease_start: '2026-02-01', lease_end: '2027-01-31', status: 'active' }]),
    ownerships: ok([
      { id: 'o1', owner_name: 'Robin Example', owner_email: 'robin@example.test', owner_phone: '(555) 010-0142', owner_user_id: 'user-1', ownership_pct: 50, valid_from: '2021-03-01', valid_to: null },
      { id: 'o2', owner_name: 'Sam Example', owner_email: 'sam@example.test', owner_phone: null, owner_user_id: null, ownership_pct: 50, valid_from: '2021-03-01', valid_to: null },
      { id: 'o0', owner_name: 'Prior Seller', owner_email: null, owner_phone: null, owner_user_id: null, ownership_pct: null, valid_from: '2015-01-01', valid_to: '2021-02-28' },
    ]),
  } as Data
}

function planHome(kind: 'behind' | 'completed'): Data {
  const d = busyHome()
  const plan = { id: 'pp1', unit_id: 'u1', status: kind === 'behind' ? 'active' : 'completed', installment_amount: 150, installment_count: 6, total_amount: 900, start_date: '2026-05-01', created_at: '2026-04-20T00:00:00Z' }
  return {
    ...d,
    plans: ok([plan]),
    planStandings: ok({
      pp1:
        kind === 'behind'
          ? { standing: 'behind' as const, found: 6, settled: 2, overdue: 1, nextDueDate: '2026-07-01', completedOn: null }
          : { standing: null, found: 0, settled: 0, overdue: 0, nextDueDate: null, completedOn: '2026-10-02' },
    }),
  }
}

function quietHome(): Data {
  const d = busyHome()
  return {
    ...d,
    property: { ...d.property, address: '18 Birch Ct, Demo, FL 33000', tenure: 'owner_occupied', owner_name: 'Pat Example', owner_email: 'pat@example.test' },
    stats: ok({ balance: 0, daysOverdue: 0, openViolations: 0, violationsPastCure: 0, threadsNeedingReply: 0 }),
    violations: ok([]),
    openAssessments: ok([]),
    ledger: ok({ rows: [], total: 0 }),
    payments: ok([]),
    collections: ok({ openCase: null, events: [], closed: [] }),
    arc: ok([]),
    threads: ok([]),
    notices: ok([]),
    tenancies: ok([]),
    ownerships: ok([]),
    residents: ok([]),
    events: ok([]),
  }
}

function unlinkedHome(): Data {
  const d = quietHome()
  return {
    ...d,
    property: { ...d.property, address: '7 Cedar Ln, Demo, FL 33000', owner_name: null, owner_email: null, owner_phone: null, tenure: 'unknown' },
    unit: ok({ unitId: null, unitIds: [], unitCount: 0, duplicate: false }),
    openAssessments: null,
    ledger: null,
    payments: null,
    plans: null,
    collections: null,
    arc: null,
    threads: null,
    notices: null,
    tenancies: null,
    ownerships: null,
  }
}

function failingHome(): Data {
  const d = busyHome()
  return { ...d, stats: FAILED, arc: FAILED, payments: FAILED, threads: FAILED, residents: FAILED, openAssessments: FAILED }
}

const view = (data: Data, section: 'people' | 'money' | 'compliance' | 'leases' | 'communications' | 'activity' = 'people') => (
  <PropertyDetailView data={data} now={NOW} today={TODAY} isAdmin capInPlace section={section} listHref="/properties?sort=balance" listQuery="sort=balance" />
)

const wrap = (el: React.ReactElement) => (
  <ToastProvider>
    <ConfirmProvider>{el}</ConfirmProvider>
  </ToastProvider>
)
const html = (el: React.ReactElement) => renderToStaticMarkup(wrap(el))

// ─── Assertions ──────────────────────────────────────────────────────

describe('properties list (rendered)', () => {
  it('desktop table + phone cards, with every column sortable', () => {
    const out = html(<ListPage rows={ROWS} />)
    expect(out).toContain('<table')
    expect(out.match(/<th /g)?.length).toBe(8)
    expect(out).toContain('aria-label="Properties"') // the phone card list
    expect(out).toContain('What needs action comes first.')
  })
})

describe('property 360 (rendered)', () => {
  it('a busy home: header, action bar, needs-action strip, every section', () => {
    const out = html(view(busyHome()))
    expect(out).toContain('412 Alder Way')
    expect(out).toContain('aria-label="Property actions"')
    for (const label of ['Message household', 'Record payment', 'New violation', 'Log note']) expect(out).toContain(label)
    expect(out).toContain(`href="/communications/new?property=${PID}"`)
    expect(out).toContain(`href="/dues?property=${PID}"`)
    expect(out).toContain(`href="/violations/new?property=${PID}"`)
    expect(out).toContain('Needs action')
    expect(out).toContain('1 violation past the cure date')
    expect(out).toContain('$742.50 overdue')
    expect(out).toContain('Oldest charge 61–90 days late · Collections: Collection letter sent')
    expect(out).toContain('1 ARC request awaiting a decision')
    expect(out).toContain('1 email awaiting a reply')
    for (const id of ['people', 'money', 'compliance', 'leases', 'communications', 'activity']) expect(out).toContain(`id="${id}"`)
    // The anchor nav (desktop) and the tabs (phone) both exist.
    expect(out).toContain('aria-label="On this page"')
    expect(out).toContain('aria-label="Property sections"')
    // People: co-owners from the lot record, primary first, portal status.
    expect(out).toContain('Robin Example')
    expect(out).toContain('Sam Example')
    expect(out).toContain('Portal account')
    expect(out).toContain('1 previous owner')
    // Money: aging and the latest-of-N note.
    expect(out).toContain('Latest 4 of 31 charges')
    // Leases and activity.
    expect(out).toContain('Current lease')
    expect(out).toContain('Owner called: will pay the balance by the 30th.')
  })

  it('a quiet home has no needs-action strip and says each section is empty', () => {
    const out = html(view(quietHome()))
    expect(out).not.toContain('Needs action')
    expect(out).toContain('No violations')
    expect(out).toContain('No ARC requests from this home.')
    expect(out).toContain('No email from this household yet.')
    expect(out).toContain('Nothing recorded yet')
    expect(out).toContain('Nobody listed as living here')
    // No residents → the household composer would dead-end; email the owner instead.
    expect(out).toContain('Email owner')
    expect(out).not.toContain('Message household')
  })

  it('a home with no unit linked says so — not "couldn’t load", not empty', () => {
    const out = html(view(unlinkedHome()))
    expect(out).toContain('isn’t linked to a unit record')
    expect(out).toContain('ARC requests attach to the unit')
    expect(out).toContain('No owner on file')
    expect(out).not.toContain('Couldn’t load')
  })

  it('failed reads show Couldn’t load in their section only, and the strip says what it couldn’t check', () => {
    const out = html(view(failingHome()))
    expect(out).toContain('Couldn’t check the balance')
    expect(out).toContain('Couldn’t check ARC requests')
    expect(out).toContain('Couldn’t check the mailbox')
    expect(out).toContain('Some activity couldn’t load')
    expect(out).toContain('Not shown: ARC, payments, email.')
    // Violations still loaded: still listed.
    expect(out).toContain('Trash cans visible from the street')
  })

  it('on a phone only the chosen section shows; the others are hidden below lg', () => {
    const out = html(view(busyHome(), 'money'))
    expect(out).toMatch(/<section id="money"[^>]*class="scroll-mt-20 space-y-3"/)
    expect(out).toMatch(/<section id="people"[^>]*class="[^"]*hidden lg:block/)
    expect(out).toContain('aria-current="page"')
  })

  // BL-080: the Payment plan tile says how the plan is going.
  it('a plan that is behind reads "Behind on plan" with the overdue count, and links to Payment plans', () => {
    const out = html(view(planHome('behind'), 'money'))
    expect(out).toContain('Behind on plan')
    expect(out).toContain('1 installment overdue · 2 of 6 paid')
    expect(out).toContain('href="/accounting/payment-plans"')
  })

  it('a completed plan shows its completion day; an unread standing falls back to the schedule', () => {
    expect(html(view(planHome('completed'), 'money'))).toContain('Paid in full · completed Oct 2, 2026')
    const unread = html(view({ ...planHome('behind'), planStandings: FAILED }, 'money'))
    expect(unread).not.toContain('Behind on plan')
    expect(unread).toContain('6 × $150.00 from May 1, 2026')
  })

  it('the loading skeleton names the sections', () => {
    const out = renderToStaticMarkup(<PropertyLoading />)
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain('People')
  })
})

// ─── Previews ────────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'list': { title: 'Properties list — table (≥768) and cards (phone)', body: () => <ListPage rows={ROWS} /> },
  'list-sorted-balance': { title: 'Properties list — sorted by balance', body: () => <ListPage rows={[...ROWS].sort((a, b) => b.balance - a.balance)} raw={{ sort: 'balance' }} /> },
  'list-signals-failed': { title: 'Properties list — ARC / last activity couldn’t load', body: () => <ListPage rows={ROWS.slice(0, 8).map((r) => ({ ...r, openArc: null, lastActivityAt: null }))} signalsOk={false} /> },
  'list-empty-search': { title: 'Properties list — search with no match', body: () => <ListPage rows={[]} raw={{ q: 'maple' }} /> },
  'detail-busy': { title: 'Property 360 — busy home (People tab on phone)', body: () => view(busyHome()) },
  'detail-busy-money': { title: 'Property 360 — busy home (Money tab on phone)', body: () => view(busyHome(), 'money') },
  'detail-plan-behind': { title: 'Property 360 — payment plan behind (BL-080)', body: () => view(planHome('behind'), 'money') },
  'detail-plan-completed': { title: 'Property 360 — payment plan completed (BL-080)', body: () => view(planHome('completed'), 'money') },
  'detail-quiet': { title: 'Property 360 — quiet home (no strip)', body: () => view(quietHome()) },
  'detail-unlinked': { title: 'Property 360 — no unit linked', body: () => view(unlinkedHome()) },
  'detail-failed': { title: 'Property 360 — failed sections', body: () => view(failingHome(), 'activity') },
  'detail-loading': { title: 'Property 360 — loading skeleton', body: () => <PropertyLoading /> },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1400 : 1100}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('properties P2 previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.PROPERTIES_PREVIEW_DIR
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
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Properties P2 previews</title><ul>${index.join('')}</ul>`)
  })
})
