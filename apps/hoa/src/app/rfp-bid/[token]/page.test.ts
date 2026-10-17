import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApiRouteError } from '@/lib/api/errors'

// BL-056: the public bid page when the token lookup fails on our side.
// Classic JSX runtime under the root vitest config — needs a global React.
;(globalThis as { React?: typeof React }).React = React

const validateRfpInvitationToken = vi.fn()
vi.mock('@/lib/rfp-invitations', () => ({
  validateRfpInvitationToken: (...a: unknown[]) => validateRfpInvitationToken(...a),
}))
vi.mock('./PublicBidForm', () => ({ PublicBidForm: () => null }))

const { default: RfpBidPage } = await import('./page')

const render = async (token = 'tok-abc') =>
  renderToStaticMarkup((await RfpBidPage({ params: Promise.resolve({ token }) })) as React.ReactElement)

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  validateRfpInvitationToken.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

describe('/rfp-bid/[token] page', () => {
  it('a database failure renders the branded try-again state, not "invalid link" or a throw', async () => {
    validateRfpInvitationToken.mockRejectedValue(new ApiRouteError('internal'))
    const html = await render()
    expect(html).toContain('couldn’t load this invitation right now')
    expect(html).toContain('href="/rfp-bid/tok-abc"')
    expect(html).toContain('Try again')
    expect(html).not.toContain('Invitation not found')
    expect(html).not.toContain('double-check the URL')
  })

  it('an unknown token still reads as an invalid link', async () => {
    validateRfpInvitationToken.mockResolvedValue({ ok: false, reason: 'not_found' })
    const html = await render()
    expect(html).toContain('Invitation not found')
    expect(html).not.toContain('Try again')
  })
})
