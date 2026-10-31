// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ToastProvider, useToast, toastDuration, TOAST_DEFAULT_MS, type ToastOptions } from './Toast'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let push: (o: ToastOptions) => void = () => {}
function Grab() {
  push = useToast()
  return null
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    )
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const toasts = () => document.querySelectorAll('[role="status"], [role="alert"]')
const tick = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('toast durations', () => {
  it('success and info last 8 seconds, errors and warnings are sticky', () => {
    expect(TOAST_DEFAULT_MS).toBe(8000)
    expect(toastDuration('success')).toBe(8000)
    expect(toastDuration('info')).toBe(8000)
    expect(toastDuration('error')).toBe(0)
    expect(toastDuration('warning')).toBe(0)
    expect(toastDuration('error', 3000)).toBe(3000)
  })

  it('a success toast is still there at 7.9s and gone at 8s', () => {
    act(() => push({ tone: 'success', message: 'Saved.' }))
    tick(7900)
    expect(toasts()).toHaveLength(1)
    tick(200)
    expect(toasts()).toHaveLength(0)
  })

  it('an error toast stays until it is dismissed, with a 44px close on touch', () => {
    act(() => push({ tone: 'error', message: 'Could not save.' }))
    tick(10 * 60 * 1000)
    expect(toasts()).toHaveLength(1)
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Dismiss notification"]')!
    expect(close.className).toMatch(/coarse:size-11/)
    act(() => close.click())
    expect(toasts()).toHaveLength(0)
  })
})

describe('toast pausing', () => {
  const fire = (el: Element, type: string) => {
    act(() => {
      el.dispatchEvent(new Event(type, { bubbles: true }))
    })
  }

  it('a finger on the toast stops the timer, and lifting it leaves time to read', () => {
    act(() => push({ tone: 'info', message: 'Heads up.' }))
    const el = toasts()[0]!
    tick(5000)
    fire(el, 'touchstart')
    tick(60_000)
    expect(toasts()).toHaveLength(1)
    fire(el, 'touchend')
    tick(3500)
    expect(toasts()).toHaveLength(1)
    tick(1000)
    expect(toasts()).toHaveLength(0)
  })
})
