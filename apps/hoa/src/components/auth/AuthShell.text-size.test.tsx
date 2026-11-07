// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'

vi.mock('@homeowner-portal/ui', () => ({
  cn: (...a: unknown[]) => a.filter((x) => typeof x === 'string').join(' '),
  BrandLogo: () => null,
  BrandMark: () => null,
}))
vi.mock('@/components/layout/AppVersion', () => ({ AppVersion: () => null }))
vi.mock('@/lib/app-version', () => ({ appVersion: () => 'test' }))
import { AuthShell } from './AuthShell'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Node's own experimental localStorage global can shadow jsdom's.
const memory = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  },
})

let root: Root
let host: HTMLElement
beforeEach(async () => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-text-size')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <AuthShell>
        <p>form</p>
      </AuthShell>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('AuthShell text size (signed out)', () => {
  it('shows Normal, Large and Largest', () => {
    const labels = [...host.querySelectorAll('label')].map((l) => l.textContent)
    expect(labels).toEqual(['Normal', 'Large', 'Largest'])
    expect(host.textContent).toContain('Text size')
  })

  it('sits above the form so it is reachable without scrolling', () => {
    const control = host.querySelector('[data-testid="auth-text-size"]')!
    const form = [...host.querySelectorAll('p')].find((p) => p.textContent === 'form')!
    expect(control.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('choosing Largest scales the page and saves to localStorage only', async () => {
    const radio = host.querySelector<HTMLInputElement>('input[value="largest"]')!
    await act(async () => radio.click())
    expect(document.documentElement.style.fontSize).toBe('130%')
    expect(window.localStorage.getItem('larger-text')).toBe('largest')
  })

  it('every option is at least 44px tall (min-h-11 or taller)', () => {
    for (const l of host.querySelectorAll('label')) {
      expect(l.className).toMatch(/min-h-(11|12|14)\b/)
    }
  })

  it('the /join page renders inside AuthShell, so it gets the control', () => {
    const src = readFileSync(path.resolve(__dirname, '../../app/join/page.tsx'), 'utf8')
    expect(src).toMatch(/<AuthShell\b/)
  })
})
