// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const setSession = vi.fn()
const getUser = vi.fn()
let linkError: 'missing_code' | 'link_expired' = 'missing_code'
let rerender: () => Promise<void> = async () => {}
const replace = vi.fn(async (url: string) => {
  // The real router swaps the URL, and the server page re-renders with ?error=.
  window.history.replaceState(null, '', url)
  if (url.includes('error=link_expired')) {
    linkError = 'link_expired'
    await rerender()
  }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { setSession, getUser, signInWithOtp: vi.fn(), signInWithPassword: vi.fn() },
  }),
}))

import { HashSessionHandler } from '@/components/auth/HashSessionHandler'
import { LoginMethods } from './LoginMethods'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

function Page() {
  return (
    <>
      <HashSessionHandler />
      <LoginMethods linkError={linkError} />
    </>
  )
}
async function mount(url: string) {
  window.history.replaceState(null, '', url)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  rerender = async () => {
    await act(async () => root!.render(<Page />))
  }
  await act(async () => root!.render(<Page />))
  await act(async () => {})
  await act(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  linkError = 'missing_code'
  const m = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    },
  })
  getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
})
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
})

const TOK = 'SECRET_AT'
const REF = 'SECRET_RT'
const HASH = `#access_token=${TOK}&refresh_token=${REF}&type=invite`

describe('an invite link that cannot start a session', () => {
  it('ends with the expired-link notice visible, not hidden', async () => {
    setSession.mockResolvedValue({ error: new Error('invalid') })
    await mount(`/login?error=missing_code${HASH}`)
    expect(replace).toHaveBeenCalledWith('/login?error=link_expired')
    expect(host!.textContent).toContain('This link has expired or was already used.')
    expect(host!.textContent).toContain('Send me a new link')
  })

  it('shows no expired notice while it is still signing in', async () => {
    let finish: (v: unknown) => void = () => {}
    setSession.mockReturnValue(new Promise((r) => (finish = r)))
    await mount(`/login?error=missing_code${HASH}`)
    expect(host!.textContent).not.toContain('has expired')
    expect(host!.textContent).toContain('Signing you in')
    await act(async () => finish({ error: null }))
  })

  it('carries next and redirect to the expired page', async () => {
    setSession.mockResolvedValue({ error: new Error('invalid') })
    await mount(`/login?error=missing_code&redirect=/resident/dues${HASH}`)
    expect(replace).toHaveBeenCalledWith('/login?error=link_expired&redirect=%2Fresident%2Fdues')
  })
})

describe('a successful sign-in from an invite link', () => {
  it('never shows the expired-link notice, during or after', async () => {
    let finish: (v: unknown) => void = () => {}
    setSession.mockReturnValue(new Promise((r) => (finish = r)))
    const seen: string[] = []
    replace.mockImplementationOnce(async () => {
      // The moment the router is told to leave, the notice must not be on screen.
      seen.push(host!.textContent ?? '')
    })
    await mount(`/login?error=missing_code${HASH}`)
    seen.push(host!.textContent ?? '')
    await act(async () => finish({ error: null }))
    await act(async () => {})
    seen.push(host!.textContent ?? '')
    expect(replace).toHaveBeenCalledWith('/')
    expect(window.location.hash).toBe('')
    expect(seen).toHaveLength(3)
    for (const text of seen) expect(text).not.toContain('has expired')
  })
})

describe('a signing-in problem that is not an expired link', () => {
  it('a dropped connection on setSession says so and offers Try again, not "expired"', async () => {
    setSession.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await mount(`/login${HASH}`)
    expect(replace).not.toHaveBeenCalled()
    expect(host!.textContent).toContain('We couldn’t finish signing you in.')
    expect(host!.textContent).not.toContain('has expired')
    setSession.mockResolvedValueOnce({ error: null })
    const retry = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!
    await act(async () => retry.click())
    expect(setSession).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('a retryable fetch error from setSession is a connection problem too', async () => {
    const err = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError' })
    setSession.mockResolvedValue({ error: err })
    await mount(`/login${HASH}`)
    expect(host!.textContent).toContain('Try again')
    expect(replace).not.toHaveBeenCalled()
  })

  it('getUser failing on the network keeps the saved session and carries on', async () => {
    setSession.mockResolvedValue({ error: null })
    getUser.mockRejectedValue(new TypeError('Failed to fetch'))
    await mount(`/login?next=/resident${HASH}`)
    expect(replace).toHaveBeenCalledWith('/resident')
  })

  it('getUser answering 401 counts as expired', async () => {
    setSession.mockResolvedValue({ error: null })
    getUser.mockResolvedValue({ data: { user: null }, error: Object.assign(new Error('jwt'), { status: 401 }) })
    await mount(`/login${HASH}`)
    expect(replace).toHaveBeenCalledWith('/login?error=link_expired')
  })
})
