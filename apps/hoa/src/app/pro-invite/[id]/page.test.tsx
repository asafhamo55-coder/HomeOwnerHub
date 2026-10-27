import * as React from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// /pro-invite/[id]: nothing about an invitation is shown until the link's
// signature checks and the signed-in account is the invited, confirmed email.

const SECRET = 'b'.repeat(40)
const ID = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
  m6: true,
  user: null as null | { id: string; email: string | null; email_confirmed_at: string | null },
  invite: null as null | Record<string, unknown>,
  reads: 0,
}))

vi.mock('@homeowner-portal/db/m6', () => ({
  get M6_APPLIED() {
    return h.m6
  },
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))
vi.mock('@/lib/orgs', () => ({ getSignedInUser: vi.fn(async () => h.user) }))
vi.mock('./AcceptInviteButton', () => ({ AcceptInviteButton: function AcceptInviteButton() { return null } }))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = async () => {
        h.reads += 1
        return table === 'orgs' ? { data: { name: 'Maple HOA' }, error: null } : { data: h.invite, error: null }
      }
      return b
    },
  }),
}))

// The page file uses the classic JSX runtime under vitest.
;(globalThis as unknown as { React: typeof React }).React = React
process.env.PRO_INVITE_SECRET = SECRET
const { signInvite } = await import('@/lib/professionals/invite-token')
const { default: Page } = await import('./page')

/** Every string and component name in a React element tree (components are not rendered). */
function flatten(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join(' ')
  const el = node as { type?: unknown; props?: { children?: ReactNode; title?: unknown } }
  const name = typeof el.type === 'function' ? (el.type as { name?: string }).name ?? '' : ''
  const title = typeof el.props?.title === 'string' ? el.props.title : ''
  return `${name} ${title} ${flatten(el.props?.children)}`
}

const render = async (sig: string | undefined) =>
  flatten(await Page({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({ sig }) }))

const goodSig = signInvite(ID, SECRET)
const row = (over: Record<string, unknown> = {}) => ({
  email: 'cpa@example.test',
  role: 'cpa',
  organization_id: '00000000-0000-4000-8000-0000000000aa',
  access_expires_on: '2027-01-01',
  link_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  accepted_at: null,
  revoked_at: null,
  ...over,
})

beforeEach(() => {
  h.m6 = true
  h.user = { id: 'u1', email: 'cpa@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
  h.invite = row()
  h.reads = 0
})

describe('/pro-invite/[id]', () => {
  it('shows the accept button to the invited, confirmed account', async () => {
    const out = await render(goodSig)
    expect(out).toContain('AcceptInviteButton')
    expect(out).toContain('Join Maple HOA')
  })

  it('a forged or missing signature reads nothing and shows the generic refusal', async () => {
    for (const sig of [undefined, '', 'f'.repeat(64), 'zz']) {
      h.reads = 0
      const out = await render(sig)
      expect(out, String(sig)).toContain('can’t be used')
      expect(out).not.toContain('AcceptInviteButton')
      expect(h.reads).toBe(0)
    }
  })

  it('the wrong account, or an unconfirmed email, is told to sign in as the invited address and sees no details', async () => {
    h.user = { id: 'u2', email: 'someone.else@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
    let out = await render(goodSig)
    expect(out).toContain('Wrong account')
    expect(out).not.toContain('AcceptInviteButton')
    expect(out).not.toContain('Maple HOA')
    expect(out).not.toContain('cpa@example.test')
    h.user = { id: 'u1', email: 'cpa@example.test', email_confirmed_at: null }
    out = await render(goodSig)
    expect(out).toContain('Wrong account')
    expect(out).not.toContain('AcceptInviteButton')
  })

  it.each([
    ['revoked', { revoked_at: '2026-01-01T00:00:00Z' }],
    ['used', { accepted_at: '2026-01-01T00:00:00Z' }],
    ['expired', { link_expires_at: '2020-01-01T00:00:00Z' }],
  ])('a %s invitation cannot be used', async (_n, over) => {
    h.invite = row(over)
    const out = await render(goodSig)
    expect(out).toContain('can’t be used')
    expect(out).not.toContain('AcceptInviteButton')
  })

  it('an invitation that does not exist cannot be used, and signed-out visitors go to sign in', async () => {
    h.invite = null
    expect(await render(goodSig)).toContain('can’t be used')
    h.user = null
    await expect(render(goodSig)).rejects.toThrow('redirect:/login')
  })

  it('does nothing while M6 is off', async () => {
    h.m6 = false
    await expect(render(goodSig)).rejects.toThrow('redirect:/')
  })
})
