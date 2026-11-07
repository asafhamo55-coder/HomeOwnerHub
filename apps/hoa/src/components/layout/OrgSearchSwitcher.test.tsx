// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const search = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/search-my-orgs', () => ({ searchMyOrgs: search }))
vi.mock('@/app/actions/set-active-org', () => ({ setActiveOrg: vi.fn(async () => ({ ok: true })) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@homeowner-portal/ui', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }))

import { OrgSwitcher } from './OrgSwitcher'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

const hit = (i: number) => ({ id: `o${i}`, name: `Community ${i}`, doors_count: i })
const page = (from: number, n: number, hasMore: boolean) => ({
  ok: true as const,
  orgs: Array.from({ length: n }, (_, k) => hit(from + k)),
  hasMore,
})

async function mount(orgCount: number, orgs = [hit(1), hit(2)]) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(<OrgSwitcher currentOrgId="o1" currentOrgName="Community 1" orgs={orgs} orgCount={orgCount} />),
  )
}

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
  search.mockReset()
})

describe('OrgSwitcher with many communities', () => {
  it('8 or fewer: the plain list, no search box, no server search', async () => {
    await mount(8)
    const trigger = host!.querySelector('button')!
    expect(trigger.getAttribute('aria-label')).toBe('Switch HOA, current: Community 1')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu') // the menu trigger, not the search panel
    expect(host!.querySelector('input')).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('more than 8: opens a labelled search box and shows the first page', async () => {
    search.mockResolvedValue(page(1, 20, true))
    await mount(300)
    await act(async () => host!.querySelector('button')!.click())
    await act(async () => {})
    const input = host!.querySelector('input')!
    expect(host!.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Find a community')
    expect(search).toHaveBeenCalledWith('', 0)
    expect(host!.querySelectorAll('li')).toHaveLength(20)
  })

  it('"Show more communities" asks for the next page and appends it', async () => {
    search.mockResolvedValueOnce(page(1, 20, true)).mockResolvedValueOnce(page(21, 5, false))
    await mount(300)
    await act(async () => host!.querySelector('button')!.click())
    await act(async () => {})
    const more = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Show more communities')!
    expect(more.className).toContain('min-h-11')
    await act(async () => more.click())
    expect(search).toHaveBeenLastCalledWith('', 1)
    expect(host!.querySelectorAll('li')).toHaveLength(25)
    expect([...host!.querySelectorAll('button')].some((b) => b.textContent === 'Show more communities')).toBe(false)
  })

  it('typing searches by name from the first page, after a pause', async () => {
    vi.useFakeTimers()
    try {
      search.mockResolvedValue(page(1, 1, false))
      await mount(300)
      await act(async () => host!.querySelector('button')!.click())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      search.mockClear()
      const input = host!.querySelector('input')!
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      await act(async () => {
        setter.call(input, 'oak')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(search).not.toHaveBeenCalled() // not on every key
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(search).toHaveBeenCalledWith('oak', 0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('says so in plain words when nothing matches, and Escape closes it', async () => {
    search.mockResolvedValue({ ok: true, orgs: [], hasMore: false })
    await mount(300)
    const trigger = host!.querySelector('button')!
    await act(async () => trigger.click())
    await act(async () => {})
    expect(host!.textContent).toContain('No communities to show.')
    await act(async () => {
      host!.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host!.querySelector('input')).toBeNull()
  })
})
