import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { SidebarBrand } from '@homeowner-portal/ui'

;(globalThis as { React?: typeof React }).React = React

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('header controls stay readable at large text and narrow widths', () => {
  it('the hamburger carries a visible Menu word and keeps a 44px target', () => {
    const src = read('packages/ui/src/layouts/AppShell.tsx')
    const at = src.indexOf('setMobileOpen(!mobileOpen)')
    const btn = src.slice(at, src.indexOf('</button>', at))
    expect(btn).toMatch(/<span>\{mobileOpen \? 'Close' : 'Menu'\}<\/span>/)
    expect(btn).toMatch(/min-h-11/)
    expect(btn).toMatch(/min-w-11/)
    // Accessible name contains the visible words (WCAG 2.5.3).
    expect(btn).toMatch(/'Close menu' : 'Open menu'/)
  })

  it('Help is never hidden behind a width breakpoint', () => {
    const src = read('apps/hoa/src/components/guide/HelpDrawer.tsx')
    expect(src).toMatch(/<span>Help<\/span>/)
    expect(src).not.toMatch(/hidden bar-lg:inline">Help/)
  })

  it('the sidebar logo is a link to / named Home', () => {
    const out = html(<SidebarBrand href="/" logo={<svg />}>org</SidebarBrand>)
    expect(out).toMatch(/<a [^>]*href="\/"[^>]*aria-label="Home"/)
    expect(out).toMatch(/min-h-11/)
    expect(html(<SidebarBrand logo={<svg />}>org</SidebarBrand>)).not.toContain('<a ')
    expect(read('apps/hoa/src/components/layout/HoaSidebar.tsx')).toMatch(/<SidebarBrand\s+href="\/"/)
  })
})
