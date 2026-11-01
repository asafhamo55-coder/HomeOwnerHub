// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('@/components/layout/NavLink', () => ({
  NavLink: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...(rest as object)}>{children}</a>
  ),
}))
vi.mock('@/components/layout/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
vi.mock('@/components/layout/WhatsNewVersionLink', () => ({ WhatsNewVersionLink: () => null }))
vi.mock('@homeowner-portal/ui', () => ({
  BrandMark: () => null,
  SidebarBrand: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SidebarCollapseToggle: () => null,
  SidebarFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SidebarNav: ({ children }: { children?: React.ReactNode }) => <nav>{children}</nav>,
  SidebarSection: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  NavItem: ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>,
}))
import { HoaSidebar } from './HoaSidebar'
import { NAV_MODE_KEY } from './nav'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null
async function mount(role: 'admin' | 'board') {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <HoaSidebar
        currentOrgId="o"
        currentOrgName="Org"
        hoaOrgs={[]}
        role={role}
        version={{} as never}
      />,
    ),
  )
}
const labels = () => [...host!.querySelectorAll('a')].map((a) => a.textContent)
const toggle = () => [...host!.querySelectorAll('button')].find((b) => /Show /.test(b.textContent ?? ''))!

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  pathname = '/'
})
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
})

describe('HoaSidebar basics toggle', () => {
  it('board members start on the basics, with plain names', async () => {
    await mount('board')
    expect(labels()).toContain('Things to approve')
    expect(labels()).toContain('Architecture requests')
    expect(labels()).not.toContain('Vendors')
    expect(toggle().textContent).toBe('Show all menu items')
  })
  it('admins start with everything', async () => {
    await mount('admin')
    expect(labels()).toContain('Vendors')
    expect(toggle().textContent).toBe('Show only the basics')
  })
  it('keeps the page you are on visible, even when it is not a basic', async () => {
    pathname = '/vendors'
    await mount('board')
    expect(labels()).toContain('Vendors')
    expect(labels()).not.toContain('Compliance')
  })
  it('saves the choice and restores it on the next visit', async () => {
    await mount('board')
    await act(async () => toggle().click())
    expect(window.localStorage.getItem(NAV_MODE_KEY)).toBe('all')
    expect(labels()).toContain('Vendors')
    await act(async () => root?.unmount())
    host?.remove()
    await mount('board')
    expect(labels()).toContain('Vendors')
    expect(toggle().textContent).toBe('Show only the basics')
  })
})
