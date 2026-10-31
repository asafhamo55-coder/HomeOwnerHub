// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const replace = vi.fn()
const refresh = vi.fn()
const setSession = vi.fn()
const getUser = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }))
vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowserClient: () => ({ auth: { setSession, getUser } }),
}))
import { HashSessionHandler } from './HashSessionHandler'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null
async function mount(url: string) {
  window.history.replaceState(null, '', url)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<HashSessionHandler />))
  await act(async () => {})
}

const TOK = 'SECRET_AT_123'
const REF = 'SECRET_RT_456'
let logs: unknown[][]

beforeEach(() => {
  vi.clearAllMocks()
  setSession.mockResolvedValue({ error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
  logs = []
  for (const m of ['log', 'warn', 'error', 'info'] as const) {
    vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a))
  }
})
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  vi.restoreAllMocks()
})

describe('HashSessionHandler', () => {
  it('does nothing without a hash', async () => {
    await mount('/login')
    expect(setSession).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('does nothing when only one token is present', async () => {
    await mount(`/login#access_token=${TOK}`)
    expect(setSession).not.toHaveBeenCalled()
  })

  it('sets the session, clears the hash and goes home', async () => {
    await mount(`/login#access_token=${TOK}&refresh_token=${REF}&type=invite`)
    expect(setSession).toHaveBeenCalledWith({ access_token: TOK, refresh_token: REF })
    expect(window.location.hash).toBe('')
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('honours a safe next path', async () => {
    await mount(`/login?next=/dues#access_token=${TOK}&refresh_token=${REF}`)
    expect(replace).toHaveBeenCalledWith('/dues')
  })

  it.each(['https://evil.com', '//evil.com', 'javascript:alert(1)'])('rejects external next %s', async (n) => {
    await mount(`/login?next=${encodeURIComponent(n)}#access_token=${TOK}&refresh_token=${REF}`)
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('sends recovery links to the reset page', async () => {
    await mount(`/login#access_token=${TOK}&refresh_token=${REF}&type=recovery`)
    expect(replace).toHaveBeenCalledWith('/reset-password')
  })

  it('clears an error hash without a session', async () => {
    await mount('/login#error=access_denied&error_code=otp_expired&error_description=expired')
    expect(setSession).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  it('clears the hash and stays put when setSession fails', async () => {
    setSession.mockResolvedValue({ error: new Error('bad') })
    await mount(`/login#access_token=${TOK}&refresh_token=${REF}`)
    expect(replace).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
    expect(host!.textContent).not.toContain('Signing you in')
  })

  it('never logs tokens', async () => {
    setSession.mockRejectedValue(new Error('boom'))
    await mount(`/login#access_token=${TOK}&refresh_token=${REF}`)
    expect(JSON.stringify(logs)).not.toContain('SECRET_')
  })
})
