import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// PR-10 "My contact details": component tests for every state, plus static
// HTML previews at 375 and 1440, light and dark — the resident card and
// form, the board's Approvals card and the property page's "Updated by
// owner on …". Rendered from fixtures; no browser, no database. Writes
// files only when CONTACT_PREVIEW_DIR is set:
//
//   rtk pnpm build    # for the compiled CSS
//   CONTACT_PREVIEW_DIR=.ui-shots/contact pnpm exec vitest run apps/hoa/src/app/resident/account/contact-previews.test.tsx

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/resident/account',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/contact-updates/actions', () => ({ requestContactUpdate: vi.fn() }))
vi.mock('@/lib/property-residents', () => ({ updateResident: vi.fn() }))
vi.mock('@/app/(dashboard)/properties/[id]/ResidentActions', () => ({ ResidentActions: () => null }))
vi.mock('@/app/(dashboard)/properties/[id]/EnterPortalButton', () => ({ EnterPortalButton: () => null }))

const { ToastProvider, ConfirmProvider, Card, CardHeader, CardTitle, CardDescription } = await import('@homeowner-portal/ui')
const { MyContactDetails } = await import('./MyContactDetails')
const { ContactDetails } = await import('@/app/(dashboard)/approvals/ContactDetails')
const { ResidentRow } = await import('@/app/(dashboard)/properties/[id]/ResidentRow')
const { HELD_REASON } = await import('@/lib/contact-updates/model')
type Home = import('@/lib/contact-updates/model').MyContact

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </ToastProvider>,
  ).replace(/<!-- -->/g, '')

const HOME: Home = {
  unitId: 'u1',
  propertyId: 'p1',
  label: '12 Oak Street',
  current: { phone: '(555) 010-0128', email: 'pat.example@example.test', mailing: null },
  editable: ['phone', 'email', 'mailing'],
  emailLocked: false,
  mailingUnknown: false,
  pending: null,
}
const PENDING: Home = {
  ...HOME,
  pending: {
    ticketId: 'tk1',
    createdAt: '2026-10-17T14:00:00Z',
    request: { signInEmail: 'pat.example@example.test', changes: { phone: '(555) 010-0199', mailing: 'PO Box 12, Springfield, FL 32000' } },
  },
}
const SIGN_IN = 'pat.example@example.test'

const resident = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  property_id: 'p1',
  full_name: 'Pat Example',
  email: 'notices@example.test',
  phone: '(555) 010-0199',
  role: 'owner' as const,
  is_primary: true,
  moved_in_at: '2021-04-01',
  moved_out_at: null,
  notes: null,
  created_at: '2021-04-01T00:00:00Z',
  ...over,
})

const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('My contact details (rendered)', () => {
  it('shows what is on file, the sign-in email, and the change button', () => {
    const out = strip(html(<MyContactDetails homes={[HOME]} signInEmail={SIGN_IN} />))
    for (const s of ['My contact details', '(555) 010-0128', 'pat.example@example.test', 'Same as the home', 'Change my details', 'You sign in with']) {
      expect(out).toContain(s)
    }
  })

  it('a waiting request says so, lists it, and offers no second change', () => {
    const out = strip(html(<MyContactDetails homes={[PENDING]} signInEmail={SIGN_IN} />))
    expect(out).toContain('Waiting for the board since')
    expect(out).toContain('Phone: (555) 010-0199')
    expect(out).toContain('Nothing changes on file until the board approves it.')
    expect(out).not.toContain('Change my details')
  })

  it('a locked email is explained, and the form disables it', () => {
    const locked = { ...HOME, editable: ['phone', 'mailing'] as Home['editable'], emailLocked: true }
    expect(strip(html(<MyContactDetails homes={[locked]} signInEmail={SIGN_IN} />))).toContain('can’t be changed here')
    const form = html(<MyContactDetails homes={[locked]} signInEmail={SIGN_IN} initialEditing="u1" />)
    expect(form).toMatch(/type="email"[^>]*disabled/)
  })

  it('the form shows field errors and sends to the board, never "saved"', () => {
    const out = html(
      <MyContactDetails homes={[HOME]} signInEmail={SIGN_IN} initialEditing="u1" initialErrors={{ phone: 'Enter a 10-digit US phone number, like (555) 123-4567.' }} />,
    )
    expect(strip(out)).toContain('Enter a 10-digit US phone number')
    expect(strip(out)).toContain('Send to the board')
    expect(strip(out)).not.toMatch(/\bSaved\b/)
  })

  it('a failed load says so — never blank fields', () => {
    const out = strip(html(<MyContactDetails homes={null} signInEmail={SIGN_IN} />))
    expect(out).toContain('Couldn’t load your contact details')
    expect(out).not.toContain('None on file')
  })

  it('read-only while an admin views as the resident', () => {
    expect(strip(html(<MyContactDetails homes={[HOME]} signInEmail={SIGN_IN} readOnly />))).not.toContain('Change my details')
  })

  it('a mailing address it cannot read is not shown as "same as the home"', () => {
    const out = strip(html(<MyContactDetails homes={[{ ...HOME, mailingUnknown: true, editable: ['phone', 'email'] }]} signInEmail={SIGN_IN} />))
    expect(out).toContain('Not shown here')
    expect(out).not.toContain('Same as the home')
  })
})

describe('board side (rendered)', () => {
  it('Approvals card: each change from → to, and the email hold in words', () => {
    const out = strip(
      html(
        <ContactDetails
          contact={{
            ticketId: 'tk1',
            home: '12 Oak Street',
            names: ['Pat Example'],
            changes: [
              { label: 'Phone', from: '(555) 010-0128', to: '(555) 010-0199' },
              { label: 'Email for notices', from: 'pat.example@example.test', to: 'notices@example.test' },
            ],
            held: [HELD_REASON.email],
            problem: null,
          }}
        />,
      ),
    )
    expect(out).toContain('(555) 010-0128')
    expect(out).toContain('(555) 010-0199')
    expect(out).toContain('signs in to the portal with the email on file')
  })

  it('People section: "Updated by owner on <date>" only when they did', () => {
    expect(strip(html(<ul><ResidentRow resident={resident()} selfUpdatedAt="2026-10-18T09:00:00Z" /></ul>))).toMatch(/Updated by owner on Oct 18, 2026/)
    expect(strip(html(<ul><ResidentRow resident={resident({ role: 'tenant' })} selfUpdatedAt="2026-10-18T09:00:00Z" /></ul>))).toContain('Updated by resident on')
    expect(strip(html(<ul><ResidentRow resident={resident()} /></ul>))).not.toContain('Updated by')
  })
})

// ─── previews ───────────────────────────────────────────────────────

function Account({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account</h1>
      {children}
    </div>
  )
}

const PREVIEWS: Record<string, { title: string; body: () => React.ReactElement }> = {
  'contact-on-file': { title: 'Account — My contact details on file', body: () => <Account><MyContactDetails homes={[HOME]} signInEmail={SIGN_IN} /></Account> },
  'contact-form': {
    title: 'Account — changing my details (with a field error)',
    body: () => (
      <Account>
        <MyContactDetails homes={[HOME]} signInEmail={SIGN_IN} initialEditing="u1" initialErrors={{ phone: 'Enter a 10-digit US phone number, like (555) 123-4567.' }} />
      </Account>
    ),
  },
  'contact-pending': { title: 'Account — a change waiting for the board', body: () => <Account><MyContactDetails homes={[PENDING]} signInEmail={SIGN_IN} /></Account> },
  'contact-locked': {
    title: 'Account — two homes; email matched to sign-in',
    body: () => (
      <Account>
        <MyContactDetails
          homes={[
            { ...HOME, editable: ['phone', 'mailing'], emailLocked: true },
            { ...HOME, unitId: 'u2', label: '301 Lakeview Drive · Unit 2B', current: { phone: null, email: 'pat.example@example.test', mailing: 'PO Box 12, Springfield, FL 32000' } },
          ]}
          signInEmail={SIGN_IN}
        />
      </Account>
    ),
  },
  'contact-failed': { title: 'Account — details failed to load', body: () => <Account><MyContactDetails homes={null} signInEmail={SIGN_IN} /></Account> },
  'contact-approvals-card': {
    title: 'Approvals — a contact update (email held)',
    body: () => (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle as="h2">Contact updates</CardTitle>
          <CardDescription>Owners and residents asked to change their own phone, notice email or mailing address.</CardDescription>
        </CardHeader>
        <div className="space-y-1 border-t border-border px-5 py-4">
          <p className="font-medium text-foreground">Contact details — 12 Oak Street</p>
          <p className="text-xs text-foreground-secondary">From Pat Example</p>
          <ContactDetails
            contact={{
              ticketId: 'tk1',
              home: '12 Oak Street',
              names: ['Pat Example'],
              changes: [
                { label: 'Phone', from: '(555) 010-0128', to: '(555) 010-0199' },
                { label: 'Email for notices', from: 'pat.example@example.test', to: 'notices@example.test' },
                { label: 'Mailing address', from: null, to: 'PO Box 12, Springfield, FL 32000' },
              ],
              held: [HELD_REASON.email],
              problem: null,
            }}
          />
        </div>
      </Card>
    ),
  },
  'contact-people-updated': {
    title: 'Property page — People: Updated by owner on …',
    body: () => (
      <Card>
        <CardHeader>
          <CardTitle as="h3">Residents and tenants</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-border">
          <ResidentRow resident={resident()} selfUpdatedAt="2026-10-18T09:00:00Z" />
          <ResidentRow resident={resident({ id: 'r2', full_name: 'Sam Example', role: 'family_member', is_primary: false, email: 'sam@example.test', phone: null })} />
        </ul>
      </Card>
    ),
  },
}

function frameDoc(inner: string, css: string[], dark: boolean): string {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css
    .map((c) => `<link rel="stylesheet" href="${c}">`)
    .join('')}</head><body class="bg-background text-foreground"><main class="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8">${inner}</main></body></html>`
}

function indexDoc(title: string, name: string): string {
  const frame = (w: number, mode: 'light' | 'dark') =>
    `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#666;margin:0 0 6px">${w}px · ${mode}</figcaption><iframe src="${name}.${mode}.html" style="width:${w}px;height:${w < 800 ? 1200 : 800}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;padding:24px;background:#e9e9ec;font:14px system-ui">
<h1 style="font:600 16px system-ui;margin:0 0 16px">${title}</h1>
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${frame(375, 'light')}${frame(375, 'dark')}</div>
<div style="display:flex;flex-direction:column;gap:24px;margin-top:24px">${frame(1440, 'light')}${frame(1440, 'dark')}</div>
</body></html>`
}

describe('contact details previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body()).length, name).toBeGreaterThan(200)
  })

  const out = process.env.CONTACT_PREVIEW_DIR
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
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Contact details previews</title><ul>${index.join('')}</ul>`)
  })
})
