import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLedger, statementBetween, statementWindow } from '@/lib/resident-ledger'

;(globalThis as { React?: typeof React }).React = React

const PID ='11111111-1111-4111-8111-111111111111'

const role = vi.hoisted(() => ({ value: null as unknown }))
const client = vi.hoisted(() => vi.fn())
const loader = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  unstable_rethrow: () => {},
}))
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRole: async () => role.value }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: client }))
vi.mock('@/lib/properties/statement/load', () => ({ loadOwnerStatement: loader }))
const preview = vi.hoisted(() => vi.fn())
vi.mock('@/lib/resident-notify/statement-store', () => ({ loadStatementRecipientPreview: preview }))
vi.mock('@/components/statement/EmailStatementButton', () => ({
  EmailStatementButton: (p: { maskedRecipients: string[]; from: string; to: string }) => (
    <button data-from={p.from} data-to={p.to}>Email to owner {p.maskedRecipients.join(',')}</button>
  ),
}))
vi.mock('@/components/resident/PrintStatementButton', () => ({ PrintStatementButton: () => <button>Print or save PDF</button> }))

import OwnerStatementPage from './page'

const ledger = buildLedger(
  [
    { id: 'a1', unit_id: 'u1', amount: 100, due_date: '2025-01-01', status: 'paid', assessment_type: 'regular', memo_code: null },
    { id: 'a2', unit_id: 'u1', amount: 100, due_date: '2025-06-01', status: 'open', assessment_type: 'regular', memo_code: null },
    { id: 'a3', unit_id: 'u1', amount: 250.5, due_date: '2025-09-01', status: 'open', assessment_type: 'special', memo_code: null },
  ],
  [{ id: 'p1', unit_id: 'u1', assessment_id: 'a1', amount: 100, paid_at: '2025-01-05T15:00:00Z', payment_method: 'check' }],
  'America/New_York',
)

const data = {
  ledger,
  truncated: false,
  today: '2025-10-01',
  associationName: 'Maple HOA',
  ownerName: 'Pat Owner',
  home: '12 · 12 Maple Ln',
  hasUnit: true,
}

const call = (sp: { from?: string; to?: string } = {}) =>
  OwnerStatementPage({ params: Promise.resolve({ id: PID }), searchParams: Promise.resolve(sp) })

const html = async (sp?: { from?: string; to?: string }) => renderToStaticMarkup(await call(sp))

beforeEach(() => {
  role.value = { role: 'board', org: { id: 'org-1' } }
  client.mockReset()
  client.mockResolvedValue({})
  loader.mockReset()
  loader.mockResolvedValue(data)
  preview.mockReset()
  preview.mockResolvedValue(['p***@example.com'])
})

describe('owner statement page: access', () => {
  it.each(['resident', 'tenant', 'vendor'])('refuses a %s before any client is made', async (r) => {
    role.value = { role: r, org: { id: 'org-1' } }
    await expect(call()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(client).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
  })

  it('refuses a signed-out visitor', async () => {
    role.value = null
    await expect(call()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(client).not.toHaveBeenCalled()
  })

  it('refuses a malformed id', async () => {
    await expect(OwnerStatementPage({ params: Promise.resolve({ id: 'nope' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(loader).not.toHaveBeenCalled()
  })

  it.each(['board', 'admin'])('lets a %s in and scopes the read to their org', async (r) => {
    role.value = { role: r, org: { id: 'org-9' } }
    await html()
    expect(loader).toHaveBeenCalledWith(expect.anything(), 'org-9', PID)
  })

  it('404s a home that is not in the caller org (cross-org)', async () => {
    loader.mockResolvedValue(null)
    await expect(call()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('owner statement page: figures', () => {
  it('prints the same closing balance and totals the resident builder gives for the same rows', async () => {
    const w = statementWindow(ledger, '2024-10-01')
    const out = await html()
    expect(w.closingBalance).toBe(350.5)
    expect(out).toContain('$350.50')
    expect(out).toContain('Balance due')
    expect(out).toContain('$450.50') // charges in the window
    expect(out).toContain('−$100.00') // payments and credits
    expect(out).toContain('Pat Owner')
    expect(out).toContain('Maple HOA')
  })

  it('shows only the owner name and the unit, no email', async () => {
    // The statement itself carries no address; the only "@" is the masked one on the email button.
    const out = await html()
    expect(out.replace(/p\*\*\*@example\.com/g, '')).not.toMatch(/@/)
  })

  it('has a print button and an email button that carries only a masked address and the period', async () => {
    const out = await html()
    expect(out).toContain('Print or save PDF')
    expect(out).toContain('Email to owner p***@example.com')
    expect(out).toContain('data-from="2024-10-01"')
    expect(out).toContain('data-to="2025-10-01"')
    expect(out).not.toContain('pat@')
  })

  it('scopes the recipient preview to the caller org and still renders when it fails', async () => {
    role.value = { role: 'board', org: { id: 'org-9' } }
    preview.mockRejectedValue(new Error('boom'))
    const out = await html()
    expect(preview).toHaveBeenCalledWith(expect.anything(), 'org-9', PID)
    expect(out).toContain('Email to owner')
  })

  it('uses no em dashes in its copy', async () => {
    expect(await html()).not.toContain('—')
  })
})

describe('owner statement page: date window', () => {
  it('defaults to the last 12 months ending today, with a balance forward', async () => {
    const out = await html()
    expect(out).toContain('Balance forward')
    expect(out).toContain('value="2024-10-01"')
    expect(out).toContain('value="2025-10-01"')
  })

  it('honours ?from=&to= and closes at the balance on the end date', async () => {
    const out = await html({ from: '2025-02-01', to: '2025-06-30' })
    const w = statementBetween(ledger, '2025-02-01', '2025-06-30')
    expect(w.openingBalance).toBe(0)
    expect(w.closingBalance).toBe(100)
    expect(out).toContain('value="2025-02-01"')
    expect(out).toContain('value="2025-06-30"')
    expect(out).toContain('$100.00')
    expect(out).not.toContain('$250.50') // the September charge is after the window
    expect(out).not.toContain('$350.50')
  })

  it('ignores a bad date and falls back to the default window', async () => {
    const out = await html({ from: '2025-02-30', to: 'soon' })
    expect(out).toContain('value="2024-10-01"')
    expect(out).toContain('value="2025-10-01"')
  })
})
