import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button, Checkbox, Field, Input, Radio, Switch } from '@homeowner-portal/ui'

;(globalThis as { React?: typeof React }).React = React

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('touch targets (ui-ux-pro-max: 44px minimum on touch pointers)', () => {
  it('every Button size lifts to 44px under a coarse pointer', () => {
    for (const size of ['xs', 'sm', 'md'] as const) {
      expect(html(<Button size={size}>Go</Button>)).toMatch(/coarse:min-h-11/)
    }
    for (const size of ['icon', 'icon-sm', 'icon-xs'] as const) {
      expect(html(<Button size={size} aria-label="Go" />)).toMatch(/coarse:size-11/)
    }
  })

  it('the mobile top-bar controls are 44px, and the drawer close has a focus ring', () => {
    const src = read('packages/ui/src/layouts/AppShell.tsx')
    expect(src).not.toMatch(/inline-flex size-(8|9) [^"]*(md:hidden|bar-sm:hidden)/)
    const close = src.match(/className="[^"]*"\s+aria-label="Close navigation"/)?.[0] ?? ''
    expect(close).toMatch(/size-11/)
    expect(close).toMatch(/focus-visible:ring-2/)
  })
})

describe('Field errors', () => {
  it('announce themselves and stay tied to the control', () => {
    const markup = html(
      <Field label="Email" error="Enter a valid email">
        <Input name="email" />
      </Field>,
    )
    expect(markup).toMatch(/<p id="[^"]+-error" role="alert"/)
    expect(markup).toMatch(/aria-invalid="true"/)
    expect(markup).toMatch(/aria-describedby="[^"]+-error"/)
  })
})

describe('colour classes resolve to real tokens', () => {
  it('no component uses text-muted-fg (not in the preset: it silently rendered inherited colour)', () => {
    for (const f of [
      'apps/hoa/src/components/layout/OrgSwitcher.tsx',
      'apps/hoa/src/components/notifications/NotificationBellMenu.tsx',
    ]) {
      expect(read(f), f).not.toMatch(/muted-fg/)
    }
  })

  it('the org switcher trigger names the current HOA (2.5.3 Label in Name)', () => {
    expect(read('apps/hoa/src/components/layout/OrgSwitcher.tsx')).toMatch(
      /aria-label=\{`Switch HOA, current: \$\{currentOrgName\}`\}/,
    )
  })
})

describe('choice rows (checkbox / radio / switch)', () => {
  it('lift the whole row to 44px on touch and stretch the label hit area', () => {
    for (const el of [
      <Checkbox label="Send copy" />,
      <Radio label="Email" name="x" />,
      <Switch label="Alerts" />,
    ]) {
      const m = html(el)
      expect(m).toMatch(/coarse:min-h-11/)
      expect(m).toMatch(/coarse:after:absolute coarse:after:inset-0/)
    }
  })

  it('leave a bare control (no label) untouched', () => {
    expect(html(<Checkbox aria-label="Select row" />)).not.toMatch(/coarse:/)
  })
})

describe('reduced motion', () => {
  it('the preset ships one global guard that freezes motion but keeps spinners turning', () => {
    const src = read('packages/ui/tailwind.config.ts')
    expect(src).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(src).toMatch(/animationDuration: '0\.01ms !important'/)
    expect(src).toMatch(/transitionDuration: '0\.01ms !important'/)
    expect(src).toMatch(/'\.animate-spin': \{[^}]*animationIterationCount: 'infinite !important'/)
  })
})

describe('12px text floor and hand-rolled touch targets', () => {
  it('text-[10px] / text-[11px] never reappear in apps/hoa/src or packages/ui/src', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        if (statSync(p).isDirectory()) {
          if (name !== 'node_modules' && name !== '.next') walk(p)
        } else if (/\.(tsx?|css)$/.test(name) && !p.endsWith('touch-and-token-a11y.test.tsx')) {
          if (/text-\[1[01]px\]/.test(readFileSync(p, 'utf8'))) hits.push(path.relative(repoRoot, p))
        }
      }
    }
    walk(path.join(repoRoot, 'apps/hoa/src'))
    walk(path.join(repoRoot, 'packages/ui/src'))
    expect(hits).toEqual([])
  })

  it('filter chips, remove-filter and sort links lift to 44px on touch', () => {
    expect(read('packages/ui/src/components/ListToolbar.tsx')).toMatch(/sm:h-7 coarse:min-h-11/)
    const f = read('apps/hoa/src/app/(dashboard)/properties/PropertyListFilters.tsx')
    expect(f.match(/coarse:min-h-11/g)?.length).toBe(2)
  })
})
