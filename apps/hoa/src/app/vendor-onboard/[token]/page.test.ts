import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApiRouteError } from '@/lib/api/errors'

// BL-056: the public vendor-onboarding page when a lookup fails on our side
// — the token lookup OR the inviting org's name lookup.
;(globalThis as { React?: typeof React }).React = React

const validateInvitationToken = vi.fn()
vi.mock('@/lib/vendor-invitations', () => ({
  validateInvitationToken: (...a: unknown[]) => validateInvitationToken(...a),
}))

type Result = { data: unknown; error: { code: string; message: string } | null }
let orgResult: Result = { data: { name: 'Maple HOA' }, error: null }
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: () => {
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = () => c
      c.maybeSingle = async () => orgResult
      return c
    },
  }),
}))
vi.mock('./PublicOnboardingForm', () => ({ PublicOnboardingForm: () => null }))

const { default: VendorOnboardPage } = await import('./page')

const render = async (token = 'tok-xyz') =>
  renderToStaticMarkup((await VendorOnboardPage({ params: Promise.resolve({ token }) })) as React.ReactElement)

const validInvitation = {
  ok: true,
  invitation: {
    id: 'inv-1',
    organizationId: 'org-1',
    inviteeEmail: 'v@example.com',
    inviteeName: null,
    expiresAt: '2099-01-01T00:00:00Z',
  },
}

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  validateInvitationToken.mockReset()
  orgResult = { data: { name: 'Maple HOA' }, error: null }
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

describe('/vendor-onboard/[token] page', () => {
  it('a token-lookup failure renders the branded try-again state', async () => {
    validateInvitationToken.mockRejectedValue(new ApiRouteError('internal'))
    const html = await render()
    expect(html).toContain('couldn’t load this invitation right now')
    expect(html).toContain('href="/vendor-onboard/tok-xyz"')
    expect(html).not.toContain('Invitation not found')
  })

  it('an org-name lookup failure is the try-again state too, logged by code only', async () => {
    validateInvitationToken.mockResolvedValue(validInvitation)
    orgResult = { data: null, error: { code: '57014', message: 'canceling statement for org Maple HOA' } }
    const html = await render()
    expect(html).toContain('couldn’t load this invitation right now')
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).toContain('57014')
    expect(logged).not.toContain('canceling statement')
  })

  it('a valid invitation renders the org header', async () => {
    validateInvitationToken.mockResolvedValue(validInvitation)
    const html = await render()
    expect(html).toContain('Maple HOA')
    expect(html).not.toContain('Try again')
  })

  it('an unknown token still reads as an invalid link', async () => {
    validateInvitationToken.mockResolvedValue({ ok: false, reason: 'not_found' })
    const html = await render()
    expect(html).toContain('Invitation not found')
  })
})
