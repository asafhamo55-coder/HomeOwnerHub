// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))
import { ResidentWelcome } from './WelcomeCard'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'

let root: Root | null = null
let host: HTMLElement | null = null

function setup(ua: string, standalone = false) {
  const m = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) },
  })
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: ua })
  Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: standalone })
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia
  return m
}
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<ResidentWelcome scope="org1" />))
}
function button(label: string) {
  return [...host!.querySelectorAll('button')].find((b) => b.textContent === label)!
}

beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
})

describe('ResidentWelcome', () => {
  it('welcomes, explains the four tiles and links the video', async () => {
    setup(DESKTOP)
    await mount()
    const text = host!.textContent!
    expect(text).toContain('Welcome to HomeownerHub')
    for (const t of ['New request', 'Ask the Docs', 'Dues', 'Documents']) expect(text).toContain(t)
    expect(host!.querySelector('a[href="/welcome"]')?.textContent).toBe('Watch the 1-minute video')
    expect(host!.querySelector('section[aria-labelledby="welcome-heading"]')).not.toBeNull()
  })

  it('on a desktop, Got it closes it for good', async () => {
    const store = setup(DESKTOP)
    await mount()
    await act(async () => button('Got it').click())
    expect(host!.textContent).toBe('')
    expect(store.get('hh:resident-welcome-seen:org1')).toBe('1')
  })

  it('on an iPhone, Got it leads to the Safari steps, then hides them for good', async () => {
    const store = setup(IPHONE)
    await mount()
    await act(async () => button('Got it').click())
    expect(host!.textContent).toContain('Put HomeownerHub on your home screen')
    expect(host!.textContent).toContain('Add to Home Screen')
    await act(async () => button('Done, hide this').click())
    expect(host!.textContent).toBe('')
    expect(store.get('hh:home-screen-helper-dismissed')).toBe('1')
  })

  it('shows nothing once seen, and no steps when already installed', async () => {
    const store = setup(IPHONE, true)
    store.set('hh:resident-welcome-seen:org1', '1')
    await mount()
    expect(host!.textContent).toBe('')
  })

  it('goes straight to the steps for someone who saw the welcome already', async () => {
    const store = setup(IPHONE)
    store.set('hh:resident-welcome-seen:org1', '1')
    await mount()
    expect(host!.textContent).toContain('Put HomeownerHub on your home screen')
  })

  it('moves focus to the main area, not the body, when the last card closes', async () => {
    setup(DESKTOP)
    const main = document.createElement('main')
    main.id = 'main'
    main.tabIndex = -1
    document.body.appendChild(main)
    await mount()
    const gotIt = button('Got it')
    gotIt.focus()
    await act(async () => gotIt.click())
    expect(document.activeElement).toBe(main)
    main.remove()
  })

  it('does not take focus when it first appears', async () => {
    setup(DESKTOP)
    await mount()
    expect(document.activeElement).toBe(document.body)
  })

  it('an unknown touch device gets both the iPhone and the Android steps', async () => {
    const store = setup('Mozilla/5.0 (X11; Linux x86_64) Firefox/120')
    Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: 5 })
    store.set('hh:resident-welcome-seen:org1', '1')
    await mount()
    const text = host!.textContent!
    expect(text).toContain('Add to Home Screen')
    expect(text).toContain('Install app')
    Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: 0 })
  })
})
