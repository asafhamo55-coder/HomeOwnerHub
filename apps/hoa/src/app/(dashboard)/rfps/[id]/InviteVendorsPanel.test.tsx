import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastProvider } from '@homeowner-portal/ui'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }))
vi.mock('@/lib/rfp-invitations', () => ({
  inviteVendorsToRfp: vi.fn(),
  revokeRfpInvitation: vi.fn(),
}))

;(globalThis as { React?: unknown }).React = React
const { InviteVendorsPanel } = await import('./InviteVendorsPanel')

const v = (id: string, name: string, over: Partial<{ already_invited: boolean; has_email: boolean }> = {}) => ({
  id,
  legal_name: name,
  trades: null,
  status: 'active' as const,
  compliance_status: null,
  already_invited: false,
  has_email: true,
  ...over,
})

function html(props: Partial<React.ComponentProps<typeof InviteVendorsPanel>>) {
  return renderToStaticMarkup(
    <ToastProvider>
      <InviteVendorsPanel rfpId="r1" invitableVendors={[]} invitations={[]} {...props} />
    </ToastProvider>,
  )
}

describe('InviteVendorsPanel', () => {
  it('vendor read failure shows LoadFailed, no send list and no empty message', () => {
    const out = html({ vendorsFailed: true, invitableVendors: [v('a', 'Acme')] })
    expect(out).toContain('Couldn’t load your vendors')
    expect(out).not.toContain('Acme')
    expect(out).not.toContain('haven’t added any vendors')
    expect(out).not.toContain('are invited')
  })

  it('invitation read failure shows LoadFailed, never "No invitations yet"', () => {
    const out = html({ invitationsFailed: true, invitableVendors: [v('a', 'Acme')] })
    expect(out).toContain('Couldn’t load the invitations')
    expect(out).not.toContain('No invitations yet')
    expect(out).toContain('Acme')
  })

  it('no vendors at all links to /vendors', () => {
    const out = html({})
    expect(out).toContain('You haven’t added any vendors yet')
    expect(out).toContain('href="/vendors"')
  })

  it('all invited says how many', () => {
    const out = html({
      invitableVendors: [v('a', 'Acme', { already_invited: true }), v('b', 'Bolt', { already_invited: true })],
    })
    expect(out).toContain('All 2 vendors are invited.')
  })

  it('missing emails list each vendor with an edit link', () => {
    const out = html({
      invitableVendors: [v('a', 'Acme', { has_email: false }), v('b', 'Bolt', { has_email: false })],
    })
    expect(out).toContain('These vendors have no email on file:')
    expect(out).toContain('href="/vendors/a/edit"')
    expect(out).toContain('href="/vendors/b/edit"')
  })

  it('a vendor without email is never in the send list', () => {
    const out = html({ invitableVendors: [v('a', 'Acme'), v('b', 'Bolt', { has_email: false })] })
    expect(out.match(/type="checkbox"/g)).toHaveLength(1)
    expect(out).toContain('href="/vendors/b/edit"')
  })
})
