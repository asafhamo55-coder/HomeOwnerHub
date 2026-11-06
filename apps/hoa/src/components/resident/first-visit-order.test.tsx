// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))
import { ResidentWelcome } from './WelcomeCard'
import { ResidentFirstWeek } from '@/components/guide/FirstWeekGate'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) },
  })
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' })
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia
}
async function mountBoth() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <>
        <ResidentWelcome scope="org1" />
        <ResidentFirstWeek scope="org1" />
      </>,
    ),
  )
}

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
})

describe('first visit order on the resident home', () => {
  it('shows only the welcome card first, then the first-week card after "Got it"', async () => {
    memoryStorage()
    await mountBoth()
    expect(host!.textContent).toContain('Welcome to HomeownerHub')
    expect(host!.textContent).not.toContain('New here?')

    const gotIt = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Got it')!
    await act(async () => gotIt.click())
    expect(host!.textContent).not.toContain('Welcome to HomeownerHub')
    expect(host!.textContent).toContain('New here?')
  })

  it('shows the first-week card as before once the welcome was already dismissed', async () => {
    memoryStorage({ 'hh:resident-welcome-seen:org1': '1' })
    await mountBoth()
    expect(host!.textContent).not.toContain('Welcome to HomeownerHub')
    expect(host!.textContent).toContain('New here?')
  })
})
