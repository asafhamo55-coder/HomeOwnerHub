// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Load the panel eagerly: next/dynamic would add a tick we do not need to test.
vi.mock('next/dynamic', async () => {
  const mod = await import('./chat-panel')
  return { default: () => mod.default }
})
vi.mock('../../../lib/chat/support-actions', () => ({ submitSupportRequest: vi.fn() }))

import { SupportChat } from './support-chat'
import { SUGGESTIONS } from './chat-panel'

let root: Root | null = null
let host: HTMLElement | null = null

async function mount(enabled: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: true }))))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<SupportChat enabled={enabled} />))
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  vi.unstubAllGlobals()
})

const launcher = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Questions? Ask us')

describe('SupportChat', () => {
  it('renders nothing when the flag is off', async () => {
    await mount(false)
    expect(document.body.textContent).toBe('')
  })

  it('shows a text-labelled launcher, then a labelled modal dialog with greeting, 4 suggestions and a person button', async () => {
    await mount(true)
    expect(launcher()).toBeTruthy()
    await act(async () => launcher()!.click())
    const dlg = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    const label = document.getElementById(dlg.getAttribute('aria-labelledby')!)
    expect(label?.textContent).toBe('Help')
    expect(dlg.textContent).toContain('Hello.')
    const sugg = dlg.querySelectorAll('ul[aria-label="Suggested questions"] button')
    expect([...sugg].map((b) => b.textContent)).toEqual([...SUGGESTIONS])
    expect(sugg.length).toBe(4)
    expect([...dlg.querySelectorAll('button')].some((b) => b.textContent === 'Talk to a person')).toBe(true)
    // New answers are announced.
    const log = dlg.querySelector('[role="log"]')!
    expect(log.getAttribute('aria-live')).toBe('polite')
    // The input is at least 18px (text-lg) and labelled.
    const ta = dlg.querySelector('textarea')!
    expect(ta.className).toContain('text-lg')
    expect(dlg.querySelector(`label[for="${ta.id}"]`)).toBeTruthy()
  })

  it('moves focus in, traps Tab, closes on Escape and returns focus to the launcher', async () => {
    await mount(true)
    await act(async () => launcher()!.click())
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))))
    const dlg = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dlg.contains(document.activeElement)).toBe(true)

    // Tab from the last focusable wraps to the first.
    const items = [...dlg.querySelectorAll<HTMLElement>('button:not([disabled]), textarea')]
    items[items.length - 1]!.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => void document.dispatchEvent(tab))
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(items[0])

    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    await act(async () => void document.dispatchEvent(esc))
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))))
    expect(dlg.className).toContain('hidden')
    expect(document.activeElement).toBe(launcher())
  })

  it('every button is at least 44px tall by class', async () => {
    await mount(true)
    await act(async () => launcher()!.click())
    const dlg = document.querySelector<HTMLElement>('[role="dialog"]')!
    for (const b of dlg.querySelectorAll('button')) expect(b.className).toMatch(/min-h-11/)
  })
})
