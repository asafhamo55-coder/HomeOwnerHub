// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const signUp = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowserClient: () => ({ auth: { signUp, signInWithOtp: vi.fn() } }),
}))

import SignupPage from './page'
import { SignupForm } from './SignupForm'
import { LoginView } from '../login/LoginView'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function submitSignup(next?: string): Promise<string | null> {
  signUp.mockResolvedValue({ error: null })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<SignupForm next={next} />))
  await act(async () => {
    typeInto(host!.querySelector('input[name="email"]') as HTMLInputElement, 'a@example.com')
    typeInto(host!.querySelector('input[name="password"]') as HTMLInputElement, 'longenoughpass1')
  })
  await act(async () => {
    host!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  return new URL(signUp.mock.calls[0]![0].options.emailRedirectTo).searchParams.get('next')
}

beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = null
})

describe('signup carries the redirect through email confirmation', () => {
  it('confirms into /join when the visitor came from /join', async () => {
    expect(await submitSignup('/join')).toBe('/join')
  })
  it('defaults to /onboarding', async () => {
    expect(await submitSignup()).toBe('/onboarding')
  })
  it.each(['https://evil.com', '//evil.com'])('a hostile next (%s) falls back to /onboarding', async (v) => {
    expect(await submitSignup(v)).toBe('/onboarding')
  })
})

describe('signup page', () => {
  async function nextProp(redirect?: string) {
    const el = (await SignupPage({ searchParams: Promise.resolve({ redirect }) })) as {
      props: { children: Array<{ props?: { next?: string } }> }
    }
    return el.props.children.find((c) => c?.props?.next)?.props?.next
  }
  it('passes /join through', async () => {
    expect(await nextProp('/join')).toBe('/join')
  })
  it.each([undefined, 'https://evil.com', '//evil.com'])('maps %s to /onboarding', async (v) => {
    expect(await nextProp(v)).toBe('/onboarding')
  })
})

describe('login to signup link', () => {
  it('carries the redirect to Create an account', () => {
    const el = LoginView({ redirect: '/join' }) as unknown as {
      props: { children: Array<{ props?: { description?: React.ReactElement } }> }
    }
    const desc = el.props.children[0]!.props!.description as React.ReactElement<{ children: React.ReactNode[] }>
    const link = (desc.props.children as React.ReactElement<{ href: string }>[]).find(
      (c) => typeof c === 'object' && c?.props?.href,
    )!
    expect(link.props.href).toBe('/signup?redirect=%2Fjoin')
  })
})
