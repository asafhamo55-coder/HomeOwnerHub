// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const openPollAction = vi.fn()
const closePollAction = vi.fn()
vi.mock('@/lib/polls/actions', () => ({
  openPollAction: (...a: unknown[]) => openPollAction(...a),
  closePollAction: (...a: unknown[]) => closePollAction(...a),
  deletePollAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@homeowner-portal/ui', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/ui')>()),
  useConfirm: () => async () => true,
}))

import { PollBoardActions } from './PollBoardActions'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(() => {
  openPollAction.mockReset().mockResolvedValue({ ok: true, id: 'p' })
  closePollAction.mockReset().mockResolvedValue({ ok: true, id: 'p' })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function render(props: Parameters<typeof PollBoardActions>[0]) {
  await act(async () => {
    root.render(<PollBoardActions {...props} />)
  })
}
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement
const checkbox = () => host.querySelector('input[type=checkbox]') as HTMLInputElement
async function click(el: HTMLElement) {
  await act(async () => {
    el.click()
  })
}

describe('close box default', () => {
  it('is checked when the poll was emailed at open', async () => {
    await render({ id: 'p', status: 'open', openedEmailed: true, emailHomes: 12 })
    expect(checkbox().checked).toBe(true)
    expect(host.textContent).not.toContain('You did not email this poll when you opened it.')
  })

  it('is unchecked, with a plain line saying why, when the poll was not emailed at open', async () => {
    await render({ id: 'p', status: 'open', openedEmailed: false, emailHomes: 12 })
    expect(checkbox().checked).toBe(false)
    expect(host.textContent).toContain('You did not email this poll when you opened it.')
  })

  it('closing with the box off sends no email and shows no mass-email confirm', async () => {
    await render({ id: 'p', status: 'open', openedEmailed: false, emailHomes: 12 })
    await click(button('Close the poll'))
    expect(closePollAction).toHaveBeenCalledWith('p', { emailResidents: false })
    expect(host.textContent).not.toContain('This will email')
  })
})

describe('confirm step before any poll email', () => {
  it('open: shows the home count first and sends nothing until "Send"', async () => {
    await render({ id: 'p', status: 'draft', emailHomes: 48 })
    expect(checkbox().checked).toBe(true)
    await click(button('Open for answers'))
    expect(host.textContent).toContain('This will email 48 homes.')
    expect(openPollAction).not.toHaveBeenCalled()
    await click(button('Send'))
    expect(openPollAction).toHaveBeenCalledWith('p', { emailResidents: true })
  })

  it('open: "Don’t email" still opens, without email', async () => {
    await render({ id: 'p', status: 'draft', emailHomes: 1 })
    await click(button('Open for answers'))
    expect(host.textContent).toContain('This will email 1 home.')
    await click(button('Don’t email'))
    expect(openPollAction).toHaveBeenCalledWith('p', { emailResidents: false })
  })

  it('open: "Go back" does nothing at all', async () => {
    await render({ id: 'p', status: 'draft', emailHomes: 5 })
    await click(button('Open for answers'))
    await click(button('Go back'))
    expect(openPollAction).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('This will email')
  })

  it('open with the box unticked goes straight through with no email', async () => {
    await render({ id: 'p', status: 'draft', emailHomes: 5 })
    await click(checkbox())
    await click(button('Open for answers'))
    expect(openPollAction).toHaveBeenCalledWith('p', { emailResidents: false })
  })

  it('close: confirms the count, then sends the results only on "Send"', async () => {
    await render({ id: 'p', status: 'open', openedEmailed: true, emailHomes: 48 })
    await click(button('Close the poll'))
    expect(host.textContent).toContain('This will email 48 homes.')
    expect(closePollAction).not.toHaveBeenCalled()
    await click(button('Send'))
    expect(closePollAction).toHaveBeenCalledWith('p', { emailResidents: true })
  })

  it('says so plainly when the count is unknown', async () => {
    await render({ id: 'p', status: 'draft', emailHomes: null })
    await click(button('Open for answers'))
    expect(host.textContent).toContain('This will email the homes with an email address on file.')
  })
})
