import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Settings → Vendors (BL-083 / BL-084): component tests for every state,
// plus static HTML previews at 375 and 1440, light and dark, and the
// vendor's reminder email. Rendered from fixtures; no browser, no
// database. Writes files only when VENDOR_SETTINGS_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   VENDOR_SETTINGS_PREVIEW_DIR=.ui-shots/vendor-settings pnpm exec vitest run 'apps/hoa/src/app/(dashboard)/settings/vendors/vendor-settings-previews.test.tsx'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/settings/vendors',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/vendor-insurance-settings', () => ({ saveVendorInsuranceSettings: vi.fn() }))

const Link = (await import('next/link')).default
const { ToastProvider, ConfirmProvider, Page, Alert } = await import('@homeowner-portal/ui')
const { VendorInsuranceForm, toValues } = await import('./VendorInsuranceForm')
const { SettingsTabs } = await import('@/components/settings/SettingsTabs')
const { renderVendorReminder, renderBoardNotice } = await import('@homeowner-portal/jobs/vendor-coi-reminders')
const { DEFAULT_VENDOR_INSURANCE_SETTINGS, insuranceRequirementLines } = await import('@homeowner-portal/workflows/vendor-insurance')
type Settings = import('@homeowner-portal/workflows/vendor-insurance').VendorInsuranceSettings

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </ToastProvider>,
  ).replace(/<!-- -->/g, '')
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const SAVED: Settings = {
  coiRemindersEnabled: true,
  minimums: { glPerOccurrenceMin: 1_000_000, glAggregateMin: 2_000_000, workersCompRequired: true, autoLiabilityMin: 1_000_000 },
}
const OFF: Settings = { ...SAVED, coiRemindersEnabled: false }

function Screen({ children, role = 'board' as const }: { children: React.ReactNode; role?: 'board' | 'admin' }) {
  return (
    <Page
      width="narrow"
      title="Vendors"
      description="Set the insurance every vendor must carry, and whether vendors are reminded before their certificate expires."
      tabs={<SettingsTabs current="/settings/vendors" role={role} />}
      linkAs={Link}
    >
      {children}
    </Page>
  )
}

describe('VendorInsuranceForm (rendered)', () => {
  it('nothing saved: blank minimums, reminders on, and it says what blank means', () => {
    const out = html(<VendorInsuranceForm initial={DEFAULT_VENDOR_INSURANCE_SETTINGS} configured={false} updatedAt={null} />)
    const text = strip(out)
    expect(text).toContain('Insurance minimums')
    expect(text).toContain('Leave an amount blank for no minimum')
    expect(text).toContain('On — vendors are reminded')
    expect(text).not.toContain('Last saved')
    expect(out).toMatch(/type="checkbox"[^>]*checked/)
  })

  it('saved values show as dollars, with when they were saved', () => {
    const text = strip(html(<VendorInsuranceForm initial={SAVED} configured updatedAt="2026-10-18T14:00:00Z" />))
    expect(text).toContain('Last saved')
    expect(toValues(SAVED)).toMatchObject({ glPerOccurrenceMin: '1,000,000', glAggregateMin: '2,000,000', autoLiabilityMin: '1,000,000' })
  })

  it('reminders off: says the board is still notified', () => {
    const text = strip(html(<VendorInsuranceForm initial={OFF} configured updatedAt="2026-10-18T14:00:00Z" />))
    expect(text).toContain('Off — only the board is notified')
    expect(text).toContain('Board notifications continue either way')
  })

  it('field errors show under their field', () => {
    const text = strip(
      html(
        <VendorInsuranceForm
          initial={SAVED}
          configured
          updatedAt={null}
          initialFieldErrors={{ glAggregateMin: 'The aggregate must be at least the per-occurrence amount.' }}
        />,
      ),
    )
    expect(text).toContain('The aggregate must be at least the per-occurrence amount.')
  })

  it('the Vendors tab is in the settings tabs for a board member', () => {
    const out = html(<SettingsTabs current="/settings/vendors" role="board" />)
    expect(out).toContain('href="/settings/vendors"')
    expect(out).toMatch(/aria-current="page"[^>]*>Vendors|>Vendors</)
  })
})

describe('reminder copy', () => {
  const lines = insuranceRequirementLines(SAVED.minimums)
  it('the vendor email asks for a renewed certificate and lists the minimums', () => {
    const e = renderVendorReminder({
      associationName: 'Maple Court HOA',
      vendorName: 'Acme Roofing LLC',
      expiresOn: '2026-11-17',
      milestone: 'd30',
      daysLeft: 30,
      requirementLines: lines,
    })
    expect(e.subject).toBe('Your certificate of insurance with Maple Court HOA expires in 30 days')
    expect(e.text).toContain('expires on November 17, 2026')
    expect(e.text).toContain('- Auto liability: $1,000,000')
  })

  it('an expired certificate says it expired, on the right calendar date', () => {
    const e = renderVendorReminder({
      associationName: 'Maple Court HOA',
      vendorName: 'Acme <Roofing>',
      expiresOn: '2026-10-15',
      milestone: 'expired',
      daysLeft: -3,
      requirementLines: [],
    })
    expect(e.subject).toBe('Your certificate of insurance with Maple Court HOA has expired')
    expect(e.text).toContain('expired on October 15, 2026')
    expect(e.html).toContain('Acme &lt;Roofing&gt;')
    expect(e.html).not.toContain('must show at least')
  })

  it('the board notice says what happened with the vendor', () => {
    expect(renderBoardNotice({ vendorName: 'Acme', expiresOn: '2026-10-25', milestone: 'd7', daysLeft: 7, outcome: 'emailed' })).toEqual({
      title: 'Acme: insurance expires in 7 days',
      body: 'Certificate of insurance expires October 25, 2026. We emailed the vendor for a renewed certificate.',
    })
  })
})

// ─── previews ───────────────────────────────────────────────────────

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'vendor-settings-default': {
    title: 'Settings → Vendors — nothing saved yet',
    body: () => (
      <Screen>
        <VendorInsuranceForm initial={DEFAULT_VENDOR_INSURANCE_SETTINGS} configured={false} updatedAt={null} />
      </Screen>
    ),
  },
  'vendor-settings-saved': {
    title: 'Settings → Vendors — minimums saved, reminders on',
    body: () => (
      <Screen>
        <VendorInsuranceForm initial={SAVED} configured updatedAt="2026-10-18T14:00:00Z" />
      </Screen>
    ),
  },
  'vendor-settings-off-errors': {
    title: 'Settings → Vendors — reminders off, with a field error',
    body: () => (
      <Screen role="admin">
        <VendorInsuranceForm
          initial={OFF}
          configured
          updatedAt="2026-10-18T14:00:00Z"
          initialFieldErrors={{ glAggregateMin: 'The aggregate must be at least the per-occurrence amount.' }}
        />
      </Screen>
    ),
  },
  'vendor-settings-unverified': {
    title: 'Settings → Vendors — saved value changed outside the screen',
    body: () => (
      <Screen>
        <Alert variant="warning" title="Your saved vendor settings aren’t in use">
          They were changed outside this screen, so the defaults below apply and vendor reminders stay on. Check them and
          save again.
        </Alert>
        <VendorInsuranceForm initial={DEFAULT_VENDOR_INSURANCE_SETTINGS} configured={false} updatedAt={null} />
      </Screen>
    ),
  },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string, modes: Array<'light' | 'dark'> = ['light', 'dark']): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1400 : 900}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${modes.map((m) => frame(375, m)).join('')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${modes.map((m) => frame(1440, m)).join('')}</div>
</body></html>`
}

describe('vendor settings previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.VENDOR_SETTINGS_PREVIEW_DIR
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
    // The vendor's email is its own document (inline styles, light only).
    const email = renderVendorReminder({
      associationName: 'Maple Court HOA',
      vendorName: 'Acme Roofing LLC',
      expiresOn: '2026-10-25',
      milestone: 'd7',
      daysLeft: 7,
      requirementLines: insuranceRequirementLines(SAVED.minimums),
    })
    writeFileSync(join(dir, 'vendor-coi-email.light.html'), email.html)
    writeFileSync(join(dir, 'vendor-coi-email.html'), indexDoc('Vendor COI reminder email — 7 days out', 'vendor-coi-email', ['light']))
    index.push('<li><a href="vendor-coi-email.html">Vendor COI reminder email — 7 days out</a></li>')
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Vendor settings previews</title><ul>${index.join('')}</ul>`)
  })
})
