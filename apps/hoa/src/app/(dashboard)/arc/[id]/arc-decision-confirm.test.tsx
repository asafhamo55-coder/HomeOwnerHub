// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const respond = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/board-review', () => ({ respondToArcRequest: (...a: unknown[]) => respond(...(a as [])) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/ai/AiRewriteButton', () => ({ AiRewriteButton: () => null }))
vi.mock('@/lib/analytics/track', () => ({ trackEvent: vi.fn() }))

const { ArcDecisionForm, DECISION_CONFIRM } = await import('./ArcDecisionForm')

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  respond.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <ToastProvider>
        <ConfirmProvider>
          <ArcDecisionForm arcId="a1" currentResponse={null} currentStatus="submitted" />
        </ConfirmProvider>
      </ToastProvider>,
    )
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const button = (re: RegExp) =>
  [...document.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '')) as HTMLButtonElement

const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click()
  })
}

describe('ARC decision confirm', () => {
  it('wording matches each decision and has no em dashes', () => {
    expect(DECISION_CONFIRM.approved.title).toBe('Approve this request?')
    expect(DECISION_CONFIRM.approved.description).toBe('The homeowner will be told right away and will see your note.')
    expect(DECISION_CONFIRM.denied.title).toBe('Deny this request?')
    expect(DECISION_CONFIRM.in_review.title).toMatch(/in review/)
    expect(JSON.stringify(DECISION_CONFIRM)).not.toContain('—')
  })

  it('Approve asks first and does nothing until confirmed', async () => {
    await click(button(/^Approve$/))
    expect(document.body.textContent).toContain('The homeowner will be told right away and will see your note.')
    expect(respond).not.toHaveBeenCalled()
  })

  it('Cancel sends nothing', async () => {
    await click(button(/^Deny$/))
    expect(document.body.textContent).toContain('Deny this request?')
    await click(button(/^Cancel$/))
    expect(respond).not.toHaveBeenCalled()
  })

  it('Confirm sends the decision', async () => {
    await click(button(/^Approve$/))
    const buttons = [...document.querySelectorAll('[role="alertdialog"] button')] as HTMLButtonElement[]
    await click(buttons.find((b) => b.textContent === 'Approve')!)
    expect(respond).toHaveBeenCalledTimes(1)
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ arcId: 'a1', decision: 'approved' }))
  })
})
