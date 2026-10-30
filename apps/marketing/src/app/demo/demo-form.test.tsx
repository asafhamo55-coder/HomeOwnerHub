// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({ usePathname: () => '/demo' }))
vi.mock('../../lib/analytics', () => ({ pageLabel: () => 'demo', trackEvent: vi.fn() }))
vi.mock('./actions', () => ({ submitDemoRequest: vi.fn() }))

import { DemoForm } from './demo-form'

let root: Root | null = null
let host: HTMLElement | null = null

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<DemoForm />))
  return document.getElementById('email') as HTMLInputElement
}

function setValue(input: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function blur(input: HTMLInputElement) {
  act(() => {
    input.focus()
    input.blur()
  })
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('demo form email check on blur', () => {
  it('flags a malformed email with the shared error wiring, then clears on fix', () => {
    const input = mount()
    setValue(input, 'not-an-email')
    blur(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('email-error')
    expect(document.getElementById('email-error')?.textContent).toContain('look right')
    setValue(input, 'board@example.com')
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(input.getAttribute('aria-describedby')).toBeNull()
    expect(document.getElementById('email-error')).toBeNull()
  })

  it('does not flag an empty field or a valid address', () => {
    const input = mount()
    blur(input)
    expect(input.getAttribute('aria-invalid')).toBe('false')
    setValue(input, 'a@b.co')
    blur(input)
    expect(input.getAttribute('aria-invalid')).toBe('false')
  })
})
