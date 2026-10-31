// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  setThreadStatus: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, refresh: h.refresh }) }))
vi.mock('@/lib/inbox/actions', () => ({ setThreadStatus: h.setThreadStatus }))
vi.mock('@homeowner-portal/ui', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/ui')>()),
  useToast: () => h.toast,
}))

const { InboxKeyboard } = await import('./InboxKeyboard')

let root: Root
let host: HTMLElement

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset())
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function pressC(afterCloseHref: string | null) {
  await act(async () => {
    root.render(<InboxKeyboard prevHref={null} nextHref={null} threadId="t1" afterCloseHref={afterCloseHref} />)
  })
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
  })
}

describe('InboxKeyboard c shortcut', () => {
  it('toasts the error and stays put when closing fails', async () => {
    h.setThreadStatus.mockResolvedValue({ error: 'Not allowed' })
    await pressC('/inbox')
    expect(h.toast).toHaveBeenCalledWith({ tone: 'error', title: "Couldn't close it", message: 'Not allowed' })
    expect(h.push).not.toHaveBeenCalled()
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('navigates to afterCloseHref on success', async () => {
    h.setThreadStatus.mockResolvedValue({})
    await pressC('/inbox')
    expect(h.push).toHaveBeenCalledWith('/inbox')
    expect(h.toast).not.toHaveBeenCalled()
  })

  it('refreshes when there is no afterCloseHref', async () => {
    h.setThreadStatus.mockResolvedValue({})
    await pressC(null)
    expect(h.refresh).toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
  })
})
