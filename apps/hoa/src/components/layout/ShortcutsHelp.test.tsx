// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { INBOX_SHORTCUTS } from '@/lib/inbox/keys'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/tickets' }))
import { ShortcutsHelp } from './ShortcutsHelp'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<ShortcutsHelp />))
}
const press = (target: Element | Document, key: string) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
const dialog = () => document.querySelector('[role="dialog"]')

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
})

describe('ShortcutsHelp', () => {
  it('opens on ? and lists every inbox shortcut from the constant', async () => {
    await mount()
    expect(dialog()).toBeNull()
    await press(document.body, '?')
    expect(dialog()).not.toBeNull()
    const text = dialog()!.textContent ?? ''
    for (const s of INBOX_SHORTCUTS) expect(text).toContain(s.label)
  })
  it('does not open while typing in an input', async () => {
    await mount()
    const input = document.createElement('input')
    document.body.appendChild(input)
    await press(input, '?')
    expect(dialog()).toBeNull()
  })
  it('closes on Escape', async () => {
    await mount()
    await press(document.body, '?')
    await press(dialog()!, 'Escape')
    expect(dialog()).toBeNull()
  })
})
