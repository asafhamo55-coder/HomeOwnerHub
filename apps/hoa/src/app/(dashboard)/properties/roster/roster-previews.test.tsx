import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Component tests and static HTML previews of Properties P5, the
// statutory owner roster and voter list: the chooser, a Florida owner
// roster (co-owners, a home-record owner, no owner, a mailing address on
// file), a Florida voter list with flagged homes and the quorum figure,
// a California voter list (no flag), and the Properties header's ⋯ menu.
// Rendered from fixtures — no browser, no database. Writes files only
// when PROPERTIES_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   PROPERTIES_PREVIEW_DIR=.ui-shots/properties-p5 pnpm exec vitest run "apps/hoa/src/app/(dashboard)/properties/roster/roster-previews.test.tsx"
//
// Fixture names, addresses and contact details are invented.

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { Page } = await import('@homeowner-portal/ui')
const { RosterChooser } = await import('./RosterChooser')
const { RosterReportView } = await import('./RosterReportView')
const { PropertiesHeader } = await import('../PropertiesHeader')
const { LegalDisclaimer } = await import('@/components/knowledge/LegalDisclaimer')
const { VERIFY_DISCLAIMER } = await import('@/lib/properties/statutory-roster/law')
const { buildReport } = await import('@/lib/properties/statutory-roster/model')
type Input = import('@/lib/properties/statutory-roster/model').RosterInput
type Home = import('@/lib/properties/statutory-roster/model').RosterHome

const TODAY = '2026-10-18'
const html = (el: React.ReactElement) => renderToStaticMarkup(el)

function home(i: number, over: Partial<Home> = {}): Home {
  return {
    propertyId: `p${i}`,
    address: `${100 + i * 4} Example Way`,
    unitNumber: null,
    unitId: `u${i}`,
    unitIds: [`u${i}`],
    lotNumber: String(i),
    unitNotes: null,
    state: 'FL',
    recordOwner: null,
    ...over,
  }
}

function fixture(state: 'FL' | 'CA'): Input {
  const own = (i: number, name: string, pct: number | null, from = '2019-04-01', extra: Partial<Input['ownerships'][number]> = {}) => ({
    unitId: `u${i}`,
    ownerName: name,
    ownerEmail: `${name.split(' ')[0].toLowerCase()}@example.test`,
    ownerPhone: '(555) 010-0' + String(i).padStart(3, '0'),
    ownershipPct: pct,
    validFrom: from,
    validTo: null,
    ...extra,
  })
  return {
    homes: [
      home(1, { state }),
      home(2, { state, unitNumber: '2B' }),
      home(3, { state, unitId: null, unitIds: [], recordOwner: { name: 'Robin Recordkeeper', email: 'robin@example.test', phone: null } }),
      home(4, { state }),
      home(5, { state, unitNotes: 'single family · Mailing address: PO Box 412, Ocala FL 34470' }),
    ],
    ownerships: [
      own(1, 'Alex Sample', null),
      own(2, 'Jordan Coowner', 60, '2021-06-15'),
      own(2, 'Casey Coowner', 40, '2021-06-15', { ownerPhone: null }),
      own(4, 'Former Seller', null, '2010-01-01', { validTo: '2026-11-01' }),
      own(4, 'Future Buyer', null, '2026-11-01'),
      own(5, 'Morgan Away', null, '2015-03-01'),
    ],
    residents: [],
    charges: [
      { id: 'c1', unitId: 'u1', amount: 325, dueDate: '2026-06-01', status: 'open' },
      { id: 'c2', unitId: 'u1', amount: 325, dueDate: '2026-07-01', status: 'open' },
      { id: 'c4', unitId: 'u4', amount: 325, dueDate: '2026-09-01', status: 'open' },
      { id: 'c5', unitId: 'u5', amount: 325, dueDate: '2026-01-01', status: 'partial' },
    ],
    payments: [{ assessmentId: 'c5', unitId: 'u5', amount: 100, paidAt: '2026-02-01T15:00:00Z' }],
    timeZone: state === 'FL' ? 'America/New_York' : 'America/Los_Angeles',
  }
}

function page(body: React.ReactNode) {
  return (
    <Page width="wide" title="Owner roster & voter list" description="The member roster and voter list your state’s records rules ask for, as of any date." breadcrumbs={[{ label: 'Properties', href: '/properties' }, { label: 'Roster & voter list' }]}>
      {body}
    </Page>
  )
}

function view(kind: 'owners' | 'voters' | 'records', state: 'FL' | 'CA') {
  const report = buildReport(kind, fixture(state), TODAY)
  return page(
    <>
      <RosterChooser kind={kind} asOf={TODAY} today={TODAY} dateError={null} />
      <RosterReportView report={report} associationName="Example Grove HOA" states={[state]} generatedOn={TODAY} />
      <LegalDisclaimer>{VERIFY_DISCLAIMER}</LegalDisclaimer>
    </>,
  )
}

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  chooser: {
    title: 'Roster — chooser',
    body: () =>
      page(
        <>
          <RosterChooser kind={null} asOf={TODAY} today={TODAY} dateError={null} />
          <LegalDisclaimer>{VERIFY_DISCLAIMER}</LegalDisclaimer>
        </>,
      ),
  },
  'owners-fl': { title: 'Owner roster — Florida', body: () => view('owners', 'FL') },
  'voters-fl': { title: 'Voter list — Florida (flagged homes, quorum)', body: () => view('voters', 'FL') },
  'voters-ca': { title: 'Voter list — California (no suspension flag)', body: () => view('voters', 'CA') },
  'records-fl': { title: 'Records-request copy — Florida (no email, no phone)', body: () => view('records', 'FL') },
  'records-ca': { title: 'Records-request copy — California (opt-out check)', body: () => view('records', 'CA') },
  header: { title: 'Properties header with the ⋯ menu', body: () => <PropertiesHeader orgName="Example Grove HOA" filter="all" total={5} allCount={5} search="" /> },
}

describe('statutory roster — components', () => {
  it('the chooser is a GET form to /properties/roster with both kinds and an as-of date, never printed', () => {
    const out = html(<RosterChooser kind="voters" asOf="2026-03-01" today={TODAY} dateError={null} />)
    expect(out).toContain('method="get"')
    expect(out).toContain('action="/properties/roster"')
    expect(out).toMatch(/value="owners"/)
    expect(out).toMatch(/value="voters"[^>]*checked|checked[^>]*value="voters"/)
    expect(out).toContain('name="asOf"')
    expect(out).toContain('value="2026-03-01"')
    expect(out).toContain('print:hidden')
  })

  it('a bad date shows on the field', () => {
    expect(html(<RosterChooser kind="owners" asOf={TODAY} today={TODAY} dateError="That date does not exist. Showing today instead." />)).toContain('That date does not exist')
  })

  it('owner roster: contact warning, co-owner shares, the fallbacks named, CSV link, actions not printed', () => {
    const out = html(view('owners', 'FL'))
    expect(out).toContain('Board only: personal contact information')
    expect(out).toContain('It must not be shared with residents unless state law requires it.')
    expect(out).toMatch(/class="[^"]*print:hidden[^"]*"[^>]*>\s*<a[^>]*href="\/properties\/roster\/export/)
  })

  it('owner roster: the details', () => {
    const out = html(view('owners', 'FL'))
    expect(out).toContain('Jordan Coowner')
    expect(out).toContain('(60%)')
    expect(out).toContain('(40%)')
    expect(out).toContain('From the home’s record (no ownership dates)')
    expect(out).toContain('PO Box 412, Ocala FL 34470')
    expect(out).toContain('Property address (no other mailing address on file)')
    // The sale closes 1 Nov: on 18 Oct the seller still owns.
    expect(out).toContain('Former Seller')
    expect(out).not.toContain('Future Buyer')
    expect(out).toContain('href="/properties/roster/export?kind=owners&amp;asOf=2026-10-18"')
    expect(out).toContain('§ 720.303(4)(a)7')
    expect(out).toContain('§ 720.303(5)')
    expect(out).toContain('Verify against your governing documents')
  })

  it('voter list FL: one vote per home, no stored rule said, flags only, quorum math', () => {
    const out = html(view('voters', 'FL'))
    expect(out).toContain('one per home')
    expect(out).toContain('no voting rule stored here')
    expect(out).toContain('May be suspended')
    expect(out).toContain('Only if the board voted it (§ 720.305(5))')
    expect(out).toContain('Nothing is suspended here.')
    // Home 1 (139 days) and home 5 (290 days) flagged; home 4 (47 days) not.
    // DataTable renders each row twice: the table and the phone card.
    expect(out.match(/May be suspended/g)).toHaveLength(2 * 2)
    expect(out).toContain('Quorum (Florida default, 30%):')
    expect(out).toMatch(/2<!-- --> of <!-- -->5<!-- --> votes|2 of 5 votes/)
    expect(out).toContain('§ 720.305(4)')
    expect(out).toContain('Board only: past-due balances')
  })

  it('voter list CA: no flag, and why', () => {
    const out = html(view('voters', 'CA'))
    expect(out).not.toContain('May be suspended')
    expect(out).toContain('No homes are flagged for late dues.')
    expect(out).toContain('Civ. Code § 5100 et seq.')
    expect(out).not.toContain('Quorum (Florida default')
  })

  it('records copy FL: names and addresses only — no phone, email, share or balance', () => {
    const out = html(view('records', 'FL'))
    expect(out).toContain('Copy for an owner’s records request')
    expect(out).toContain('Jordan Coowner')
    expect(out).toContain('PO Box 412, Ocala FL 34470')
    expect(out).not.toMatch(/\(555\)|@example\.test|\(60%\)|\$325|Past due/)
    expect(out).toContain('Not shared')
    expect(out).toContain('href="/properties/roster/export?kind=records&amp;asOf=2026-10-18"')
    expect(out).toContain('§ 720.303(4)(a)7')
    // No § 5220 check outside California.
    expect(out).not.toContain('Check California opt-outs')
  })

  it('records copy CA: the opt-out check is shown (never printed) and no email goes out', () => {
    const out = html(view('records', 'CA'))
    expect(out).toContain('Check California opt-outs before you release this')
    expect(out).toContain('§ 5200(a)(9)')
    expect(out).toContain('§ 5220')
    expect(out).not.toMatch(/@example\.test|\(555\)/)
  })

  it('the chooser offers the records-request copy', () => {
    const out = html(<RosterChooser kind="records" asOf={TODAY} today={TODAY} dateError={null} />)
    expect(out).toMatch(/value="records"[^>]*checked|checked[^>]*value="records"/)
    expect(out).toContain('Copy for an owner’s records request')
  })

  it('the Properties header has a ⋯ menu trigger', () => {
    expect(html(PREVIEWS.header.body())).toContain('aria-label="More property actions"')
  })

  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.PROPERTIES_PREVIEW_DIR
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
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Properties P5 previews</title><ul>${index.join('')}</ul>`)
  })
})

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1800 : 1300}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}
