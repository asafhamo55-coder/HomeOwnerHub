import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Component tests and static HTML previews of Properties P3 "Record a
// sale": the form (empty, several buyers with errors, the tenants
// question), the recorded step with Invite to portal, and the property
// page after a sale (ownership history, the action bar). Rendered from
// fixtures — no browser, no database. Writes files only when
// PROPERTIES_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   PROPERTIES_PREVIEW_DIR=.ui-shots/properties-p3 pnpm exec vitest run "apps/hoa/src/app/(dashboard)/properties/[id]/record-sale-previews.test.tsx"
//
// The dialog itself portals (nothing to render server-side), so its body
// is previewed in a dialog-shaped frame. Fixture names are invented.

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/properties/x',
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error('redirect')
  },
  notFound: () => {
    throw new Error('notFound')
  },
  unstable_rethrow: () => {},
}))
// Never reached from a static render; mocked so no server module loads.
const { invite } = vi.hoisted(() => ({ invite: vi.fn() }))
vi.mock('@/lib/members', () => ({ inviteMember: invite }))
vi.mock('@/lib/properties/sale-actions', () => ({ recordPropertySale: vi.fn() }))

const { ToastProvider, ConfirmProvider } = await import('@homeowner-portal/ui')
const { RecordSaleForm } = await import('./RecordSaleForm')
const { SaleRecorded } = await import('./SaleRecorded')
const { PropertyDetailView } = await import('./PropertyDetailView')
const { addBuyer, emptySaleDraft, updateBuyer } = await import('@/lib/properties/sale-form')
type Draft = import('@/lib/properties/sale-form').SaleDraft
type Data = import('@/lib/properties/property-360').Property360

const TODAY = '2026-10-17'
const NOW = new Date('2026-10-17T15:00:00Z')
const PID = '22222222-2222-4222-8222-222222222222'

const wrap = (el: React.ReactElement) => (
  <ToastProvider>
    <ConfirmProvider>{el}</ConfirmProvider>
  </ToastProvider>
)
const html = (el: React.ReactElement) => renderToStaticMarkup(wrap(el))

/** The dialog's chrome, for a static preview of its body. */
function DialogFrame({ title, description, footer, children }: { title: string; description?: string; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-xl">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
    </div>
  )
}

const btn = (label: string, primary = false) => (
  <span className={primary ? 'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground' : 'rounded-md px-3 py-2 text-sm text-foreground'}>{label}</span>
)

function Form({ draft, errors = {}, error = null, sellers = ['Robin Example', 'Sam Example'], balance = 742.5, tenantCount = 0 }: {
  draft: Draft
  errors?: Record<string, string>
  error?: string | null
  sellers?: string[]
  balance?: number | null
  tenantCount?: number
}) {
  return (
    <DialogFrame title="Record a sale" description="Moves this home to its new owners in one step. The sellers’ history is kept." footer={<>{btn('Cancel')}{btn('Record sale', true)}</>}>
      <RecordSaleForm
        formId="f"
        draft={draft}
        onChange={() => {}}
        onSubmit={() => {}}
        today={TODAY}
        sellers={sellers}
        balance={balance}
        tenantCount={tenantCount}
        fieldErrors={errors}
        error={error}
        pending={false}
      />
    </DialogFrame>
  )
}

const oneBuyer = (): Draft => {
  const d = emptySaleDraft(TODAY, false)
  return updateBuyer(d, d.buyers[0]!.key, { name: 'Jamie Buyer', email: 'jamie@example.test' })
}
const twoBuyersWithErrors = (): Draft => {
  let d = addBuyer(emptySaleDraft(TODAY, true))
  d = updateBuyer(d, d.buyers[0]!.key, { name: 'Jamie Buyer', email: 'jamie@example', pct: '60' })
  d = updateBuyer(d, d.buyers[1]!.key, { name: '', pct: '30', mailingAddress: '9 Elsewhere Rd, Far, CA 90000' })
  return { ...d, settlementDate: '2026-10-15' }
}

const DONE = {
  buyers: [
    { name: 'Jamie Buyer', email: 'jamie@example.test', listed: true },
    { name: 'Alex Buyer', email: null, listed: true },
  ],
  movedOut: 3,
  leasesEnded: 1,
  tenureReset: true,
}

function soldHome(): Data {
  const ok = <T,>(data: T) => ({ ok: true as const, data })
  return {
    property: { id: PID, address: '412 Alder Way, Demo, FL 33000', unit_number: null, owner_name: 'Jamie Buyer', owner_email: 'jamie@example.test', owner_phone: null, notes: null, tenure: 'unknown', tenure_updated_at: '2026-10-17T14:00:00Z', created_at: '2021-03-01T00:00:00Z' },
    unit: ok({ unitId: 'u1' as never, unitIds: ['u1' as never], unitCount: 1, duplicate: false }),
    residents: ok([
      { id: 'r9', property_id: PID, full_name: 'Jamie Buyer', email: 'jamie@example.test', phone: null, role: 'owner', is_primary: true, moved_in_at: TODAY, moved_out_at: null, notes: null, created_at: '2026-10-17T14:00:00Z' },
      { id: 'r1', property_id: PID, full_name: 'Robin Example', email: 'robin@example.test', phone: null, role: 'owner', is_primary: true, moved_in_at: '2021-03-01', moved_out_at: TODAY, notes: null, created_at: '2021-03-01T00:00:00Z' },
    ]),
    events: ok([{ id: 'e1', property_id: PID, occurred_at: '2026-10-17T14:00:00Z', kind: 'ownership_changed', payload: { reason: 'sale', settlement_date: TODAY, buyers: 1 }, notes: null, created_by: null }]),
    stats: ok({ balance: 742.5, daysOverdue: 77, openViolations: 0, violationsPastCure: 0, threadsNeedingReply: 0 }),
    violations: ok([]),
    waitingQueue: ok([]),
    openAssessments: ok([{ id: 'a1', due_date: '2026-08-01', amount: 742.5, status: 'open', assessment_type: 'regular', payments: [] }]),
    ledger: ok({ rows: [{ id: 'a1', due_date: '2026-08-01', amount: 742.5, status: 'open', assessment_type: 'regular' }], total: 1 }),
    payments: ok([]),
    plans: ok([]),
    collections: ok({ openCase: null, events: [], closed: [] }),
    arc: ok([]),
    threads: ok([]),
    notices: ok([]),
    tenancies: ok([]),
    ownerships: ok([
      { id: 'o9', owner_name: 'Jamie Buyer', owner_email: 'jamie@example.test', owner_phone: null, owner_user_id: null, ownership_pct: 100, valid_from: TODAY, valid_to: null },
      { id: 'o1', owner_name: 'Robin Example', owner_email: 'robin@example.test', owner_phone: null, owner_user_id: 'user-1', ownership_pct: 50, valid_from: '2021-03-01', valid_to: TODAY },
      { id: 'o2', owner_name: 'Sam Example', owner_email: null, owner_phone: null, owner_user_id: null, ownership_pct: 50, valid_from: '2021-03-01', valid_to: TODAY },
      { id: 'o0', owner_name: 'Prior Seller', owner_email: null, owner_phone: null, owner_user_id: null, ownership_pct: 100, valid_from: '2015-01-01', valid_to: '2021-03-01' },
    ]),
  } as Data
}

const page = (data: Data, canManage = true) => (
  <PropertyDetailView data={data} now={NOW} today={TODAY} isAdmin={false} canManage={canManage} capInPlace={false} section="people" listHref="/properties" listQuery="" />
)

// ─── Assertions ──────────────────────────────────────────────────────

describe('Record a sale form (rendered)', () => {
  it('one buyer: date capped at today, no share field, the consequences spelled out', () => {
    const out = html(<Form draft={oneBuyer()} />)
    expect(out).toContain('type="date"')
    expect(out).toContain(`max="${TODAY}"`)
    expect(out).toContain('Primary — notices and dues go here')
    expect(out).not.toContain('>Share<')
    expect(out).toContain('Robin Example and Sam Example become previous owners on Oct 17, 2026, and their portal access to this home ends.')
    expect(out).toContain('The $742.50 balance stays with the home — it isn’t cleared or moved.')
    expect(out).toContain('The buyer’s portal shows charges from the settlement date on')
    expect(out).toContain('No email is sent now.')
    // No tenants on file → no tenants question.
    expect(out).not.toContain('Do the tenants stay?')
  })

  it('several buyers with errors: each lands under its field, shares total shown in red, tenants asked', () => {
    const out = html(
      <Form
        draft={twoBuyersWithErrors()}
        tenantCount={2}
        error="Fix the highlighted fields."
        errors={{
          'buyers.0.email': 'Enter a valid email, like name@example.com.',
          'buyers.1.name': 'Enter the buyer’s name.',
          buyers: 'The buyers’ shares add up to 90%. They need to add up to 100%.',
          carryTenants: 'Choose whether the tenants stay.',
        }}
      />,
    )
    expect(out).toContain('Buyers (2)')
    expect(out).toContain('Shares add up to 90%')
    expect(out).toContain('text-danger')
    expect(out).toContain('Enter a valid email, like name@example.com.')
    expect(out).toContain('Enter the buyer’s name.')
    expect(out).toContain('Do the tenants stay? (2 on file)')
    expect(out).toContain('Choose whether the tenants stay.')
    expect(out).toContain('aria-invalid="true"')
    expect(out).toContain('Couldn’t record the sale')
    expect(out).toContain('aria-label="Remove buyer 2"')
  })

  it('a balance that couldn’t load is not claimed to be zero', () => {
    const out = html(<Form draft={oneBuyer()} balance={null} sellers={[]} />)
    expect(out).toContain('The current owner becomes a previous owner')
    expect(out).toContain('The balance stays with the home.')
    expect(out).not.toContain('$0.00')
  })
})

describe('Sale recorded (rendered)', () => {
  it('says what changed, offers Invite to portal per buyer with an email, and has sent nothing', () => {
    const out = html(<SaleRecorded propertyId={PID} settlementDate={TODAY} done={DONE} />)
    expect(out).toContain('Sale recorded, settled Oct 17, 2026')
    expect(out).toContain('3 people moved out of the household list; 1 lease ended')
    expect(out).toContain('No email has been sent. Each invite goes out only when you click it.')
    expect(out.match(/Invite to portal/g)?.length).toBe(1)
    expect(out).toContain('No email on file')
    expect(out).toContain('Set how the home is used')
    expect(invite).not.toHaveBeenCalled()
  })

  it('no buyer email: nobody to invite, and it says so', () => {
    const out = html(<SaleRecorded propertyId={PID} settlementDate={TODAY} done={{ ...DONE, buyers: [{ name: 'Alex Buyer', email: null, listed: false }], tenureReset: false }} />)
    expect(out).toContain('there’s no one to invite yet')
    expect(out).not.toContain('Invite to portal')
    expect(out).not.toContain('Set how the home is used')
  })
})

describe('the property page after a sale (rendered)', () => {
  it('the buyer is the owner; the sellers are in the ownership history with their dates', () => {
    const out = html(page(soldHome()))
    expect(out).toContain('Ownership history · 3 previous owners')
    expect(out).toContain('Robin Example')
    expect(out).toContain('Oct 17, 2026')
    expect(out).toContain('Sale recorded, settled Oct 17, 2026')
    // The buyer has no portal account yet → Invite to portal on the owner row.
    expect(out).toContain('Invite to portal')
  })

  it('board/admin get Record a sale in the action bar; others do not', () => {
    expect(html(page(soldHome(), true))).toContain('Record a sale')
    const out = html(page(soldHome(), false))
    expect(out).not.toContain('Record a sale')
    expect(out).not.toContain('Invite to portal')
  })

  it('no unit linked → no Record a sale (there is no ownership to transfer)', () => {
    const d = soldHome()
    const out = html(page({ ...d, unit: { ok: true, data: { unitId: null, unitIds: [], unitCount: 0, duplicate: false } } as Data['unit'] }))
    expect(out).not.toContain('Record a sale')
  })
})

// ─── Previews ────────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'sale-form': { title: 'Record a sale — one buyer', body: () => <Form draft={oneBuyer()} /> },
  'sale-form-errors': {
    title: 'Record a sale — two buyers, errors, tenants question',
    body: () => (
      <Form
        draft={twoBuyersWithErrors()}
        tenantCount={2}
        error="Fix the highlighted fields."
        errors={{
          'buyers.0.email': 'Enter a valid email, like name@example.com.',
          'buyers.1.name': 'Enter the buyer’s name.',
          'buyers.1.mailingAddress': 'A mailing address is kept on the buyer’s household entry. Turn on “Add the buyers to the household list”, or leave it blank.',
          buyers: 'The buyers’ shares add up to 90%. They need to add up to 100%.',
          carryTenants: 'Choose whether the tenants stay.',
        }}
      />
    ),
  },
  'sale-form-server-error': {
    title: 'Record a sale — server refusal (no raw DB text)',
    body: () => <Form draft={oneBuyer()} balance={0} sellers={['Pat Example']} error="Couldn’t record the sale. Nothing was changed. Try again." />,
  },
  'sale-recorded': {
    title: 'Sale recorded — invite the new owners',
    body: () => (
      <DialogFrame title="Sale recorded" footer={btn('Done', true)}>
        <SaleRecorded propertyId={PID} settlementDate={TODAY} done={DONE} />
      </DialogFrame>
    ),
  },
  'detail-after-sale': { title: 'Property page after a sale — People (ownership history open)', body: () => page(soldHome()) },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1500 : 1100}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('properties P3 previews', () => {
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
      // The history <details> opens in the preview so it can be seen.
      const inner = html(p.body()).replace('<details class="rounded-lg bg-subtle px-3.5 py-2 text-sm">', '<details open class="rounded-lg bg-subtle px-3.5 py-2 text-sm">')
      writeFileSync(join(dir, `${name}.light.html`), frameDoc(inner, css, false))
      writeFileSync(join(dir, `${name}.dark.html`), frameDoc(inner, css, true))
      writeFileSync(join(dir, `${name}.html`), indexDoc(p.title, name))
      index.push(`<li><a href="${name}.html">${p.title}</a></li>`)
    }
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Properties P3 previews</title><ul>${index.join('')}</ul>`)
  })
})
