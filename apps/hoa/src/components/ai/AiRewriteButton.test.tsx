// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { AiRewriteButton } from './AiRewriteButton'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open(fetchImpl: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  await act(async () => {
    root.render(<AiRewriteButton value="hello" onChange={() => {}} />)
  })
  const trigger = host.querySelector('button') as HTMLButtonElement
  trigger.focus()
  await act(async () => {
    trigger.click()
  })
  return trigger
}

describe('AiRewriteButton dialog', () => {
  it('announces loading with role=status and moves focus inside the dialog', async () => {
    await open(() => new Promise(() => {}))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(dialog.querySelector('[role="status"]')?.textContent).toMatch(/Generating/)
  })

  it('renders the failure as an alert and closes on Escape', async () => {
    await open(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.querySelector('[role="alert"]')).toBeTruthy()
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
