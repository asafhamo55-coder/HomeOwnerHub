import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRouteError } from '@/lib/api/errors'
import { loadPublicInvitation } from './public-invitation-load'

// BL-056: a public invitation page whose token lookup fails on OUR side must
// render a branded "try again" state, not Next's error page and not
// "invalid link". The loader turns a throw into { state: 'unavailable' }.

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

describe('loadPublicInvitation', () => {
  it('passes a loaded value through', async () => {
    const r = await loadPublicInvitation('t', async () => ({ ok: false, reason: 'not_found' }))
    expect(r).toEqual({ state: 'loaded', value: { ok: false, reason: 'not_found' } })
  })

  it('an ApiRouteError (already logged at its source) is unavailable, not a throw', async () => {
    const r = await loadPublicInvitation('t', async () => {
      throw new ApiRouteError('internal')
    })
    expect(r).toEqual({ state: 'unavailable' })
  })

  it('any other throw is unavailable and logged by name/code only', async () => {
    const r = await loadPublicInvitation('invite.page', async () => {
      throw Object.assign(new Error('fetch failed for jane@example.com'), { code: 'ECONNRESET' })
    })
    expect(r).toEqual({ state: 'unavailable' })
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).toContain('ECONNRESET')
    expect(logged).not.toContain('jane@example.com')
  })

  it("rethrows Next's control-flow errors (notFound / redirect carry a digest)", async () => {
    const nextErr = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/x;307;' })
    await expect(
      loadPublicInvitation('t', async () => {
        throw nextErr
      }),
    ).rejects.toBe(nextErr)
  })
})
