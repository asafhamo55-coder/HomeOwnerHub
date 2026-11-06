// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
;(globalThis as { React?: typeof React }).React = React

const cancel = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/amenities/actions', () => ({ cancelReservation: (...a: unknown[]) => cancel(...a) }))

const { ResidentCancel } = await import('./ResidentCancel')
const { ToastProvider } = await import('@homeowner-portal/ui')

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  cancel.mockReset()
})

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  const h = document.createElement('h2')
  h.id = 'your-bookings-heading'
  h.tabIndex = -1
  h.textContent = 'Your bookings'
  host.appendChild(h)
  const mountPoint = document.createElement('div')
  host.appendChild(mountPoint)
  root = createRoot(mountPoint)
  act(() =>
    root!.render(
      <ToastProvider>
        <ResidentCancel reservationId="r1" label="Clubhouse, Sat, Nov 8, 2 pm" />
      </ToastProvider>,
    ),
  )
  return host
}
const btn = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)

describe('ResidentCancel', () => {
  it('names the booking and asks before canceling, with focus on the first answer', () => {
    const el = mount()
    const first = btn('Cancel booking')!
    expect(first.getAttribute('aria-label')).toBe('Cancel booking: Clubhouse, Sat, Nov 8, 2 pm')
    act(() => first.click())
    expect(cancel).not.toHaveBeenCalled()
    expect(el.textContent).toContain('Cancel Clubhouse, Sat, Nov 8, 2 pm?')
    expect(document.activeElement).toBe(btn('Yes, cancel it'))
    expect(btn('Yes, cancel it')!.className).toContain('min-h-12')
    expect(btn('No, keep it')!.className).toContain('min-h-12')
  })

  it('leaves focus alone when the cancel fails', async () => {
    cancel.mockResolvedValue({ ok: false, error: 'No' })
    mount()
    act(() => btn('Cancel booking')!.click())
    await act(async () => btn('Yes, cancel it')!.click())
    expect(document.activeElement).not.toBe(document.getElementById('your-bookings-heading'))
  })

  it('keeps the booking and returns focus when the resident says no', () => {
    mount()
    act(() => btn('Cancel booking')!.click())
    act(() => btn('No, keep it')!.click())
    expect(cancel).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(btn('Cancel booking'))
  })

  it('cancels only after the second tap', async () => {
    cancel.mockResolvedValue({ ok: true })
    mount()
    act(() => btn('Cancel booking')!.click())
    await act(async () => btn('Yes, cancel it')!.click())
    expect(cancel).toHaveBeenCalledWith('r1', '')
    expect(document.activeElement).toBe(document.getElementById('your-bookings-heading'))
  })
})
