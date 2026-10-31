// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const signInWithOtp = vi.fn()
const getUser = vi.fn()
const updateUser = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithOtp, getUser, updateUser, signInWithPassword: vi.fn() } }),
}))

import { AuthShell } from '@/components/auth/AuthShell'
import { ChoosePasswordPrompt } from '@/components/auth/ChoosePasswordPrompt'
import { LoginMethods } from './login/LoginMethods'
import { ResetPasswordForm } from './reset-password/ResetPasswordForm'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null
async function mount(el: React.ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
  await act(async () => {})
}
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

// Node's own experimental localStorage can shadow jsdom's; use a plain in-memory one.
function installMemoryStorage() {
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
}

beforeEach(() => {
  vi.clearAllMocks()
  installMemoryStorage()
  window.history.replaceState(null, '', '/login')
})
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
})

describe('help line', () => {
  it('AuthShell footer links to support by email', () => {
    const html = renderToStaticMarkup(<AuthShell>x</AuthShell>)
    expect(html).toContain('Need help?')
    expect(html).toContain('href="mailto:support@homeownerledger.com"')
  })
})

describe('login with a bad link', () => {
  it('shows the alert, the help link, and opens "Email me a link"', async () => {
    await mount(<LoginMethods linkError="link_expired" />)
    expect(host!.textContent).toContain('This link has expired or was already used.')
    expect(host!.textContent).toContain('ask your board to send a new invite')
    expect(host!.querySelector('a[href="mailto:support@homeownerledger.com"]')).not.toBeNull()
    const tab = host!.querySelector('[role="tab"][aria-selected="true"]')
    expect(tab?.textContent).toContain('Email me a link')
    expect(host!.textContent).not.toContain('different phone or computer')
  })

  it('explains the different-device case and resends to the typed email', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    await mount(<LoginMethods linkError="exchange_failed" />)
    expect(host!.textContent).toContain(
      'Opened the email on a different phone or computer? Links only work on the device where you asked for them.',
    )
    const button = [...host!.querySelectorAll('button')].find((b) => b.textContent?.includes('Send me a new link'))!
    // No email typed yet: no request, a plain instruction instead.
    await act(async () => button.click())
    expect(signInWithOtp).not.toHaveBeenCalled()
    expect(host!.textContent).toContain('Type your email in the box below first')

    const input = host!.querySelector('input[name="email"]') as HTMLInputElement
    await act(async () => typeInto(input, 'pat@example.com'))
    await act(async () => button.click())
    expect(signInWithOtp).toHaveBeenCalledTimes(1)
    expect(signInWithOtp.mock.calls[0][0].email).toBe('pat@example.com')
    expect(host!.textContent).toContain('We sent a new sign-in link to pat@example.com')
  })

  it('defaults to "Email me a link" when this device last signed in by link, password tab still there', async () => {
    window.localStorage.setItem('hh:last-signin-method', 'link')
    await mount(<LoginMethods />)
    expect(host!.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Email me a link')
    expect(host!.textContent).toContain('Password')
  })

  it('defaults to Password with nothing remembered', async () => {
    await mount(<LoginMethods />)
    expect(host!.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Password')
  })
})

describe('ResetPasswordForm', () => {
  it('has a 44px show-password toggle, no confirm box, and the rule up front', async () => {
    await mount(<ResetPasswordForm />)
    expect(host!.textContent).toContain('At least 10 characters')
    expect(host!.querySelector('input[name="confirm"]')).toBeNull()
    const input = host!.querySelector('input[name="password"]') as HTMLInputElement
    expect(input.type).toBe('password')
    const toggle = host!.querySelector('button[aria-label="Show password"]') as HTMLButtonElement
    expect(toggle.className).toContain('size-11')
    await act(async () => toggle.click())
    expect(input.type).toBe('text')
    expect(host!.querySelector('button[aria-label="Hide password"]')).not.toBeNull()
  })
})

describe('ChoosePasswordPrompt', () => {
  it('shows once for a link sign-in with no password, links to the set-password screen, and skips', async () => {
    window.localStorage.setItem('hh:last-signin-method', 'link')
    getUser.mockResolvedValue({ data: { user: { id: 'u', user_metadata: {} } } })
    await mount(<ChoosePasswordPrompt />)
    expect(host!.textContent).toContain('Choose a password for next time (optional).')
    expect(host!.textContent).toContain('Or skip; we can always email you a sign-in link.')
    expect(host!.querySelector('a[href="/reset-password?welcome=1"]')).not.toBeNull()
    const skip = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Skip')!
    await act(async () => skip.click())
    expect(host!.textContent).not.toContain('Choose a password')
    expect(window.localStorage.getItem('hh:pw-prompt-dismissed')).toBe('1')
  })

  it.each([
    ['signed in with a password', { 'hh:last-signin-method': 'password' }, {}],
    ['already skipped', { 'hh:last-signin-method': 'link', 'hh:pw-prompt-dismissed': '1' }, {}],
    ['already chose a password', { 'hh:last-signin-method': 'link' }, { password_set: true }],
  ])('stays away when %s', async (_n, storage, meta) => {
    for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v)
    getUser.mockResolvedValue({ data: { user: { id: 'u', user_metadata: meta } } })
    await mount(<ChoosePasswordPrompt />)
    expect(host!.textContent).toBe('')
  })
})
