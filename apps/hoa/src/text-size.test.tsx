// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@homeowner-portal/ui'
import {
  TEXT_SIZE_INIT_SCRIPT,
  applyTextSize,
  readTextSize,
  saveTextSize,
} from '@/lib/larger-text'
import { TextSizeControl } from '@/components/theme/TextSizeControl'
import { TextSizeMenuItems } from '@/components/theme/TextSizeMenuItems'

// Vitest compiles JSX with the classic runtime here, so components need React in scope.
;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const here = path.dirname(fileURLToPath(import.meta.url))
// Node's own experimental localStorage global can shadow jsdom's, so tests
// install a plain in-memory Storage.
const memory = new Map<string, string>()
const memoryStorage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
}
Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage })
const root = document.documentElement
let mount: HTMLDivElement
let r: Root | null = null

beforeEach(() => {
  window.localStorage.clear()
  root.style.fontSize = ''
  root.removeAttribute('data-text-size')
  mount = document.createElement('div')
  document.body.appendChild(mount)
})
afterEach(() => {
  act(() => r?.unmount())
  r = null
  mount.remove()
  document.body.innerHTML = ''
})

function blockStorage() {
  const boom = () => {
    throw new Error('blocked')
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom }),
  })
  return () =>
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage })
}

describe('text size helpers', () => {
  it('applies a root font-size percentage and a data attribute', () => {
    applyTextSize('large')
    expect(root.style.fontSize).toBe('115%')
    expect(root.dataset.textSize).toBe('large')
    applyTextSize('largest')
    expect(root.style.fontSize).toBe('130%')
    applyTextSize('normal')
    expect(root.style.fontSize).toBe('')
  })

  it('persists the choice and reads it back', () => {
    expect(readTextSize()).toBe('normal')
    expect(saveTextSize('largest')).toBe(true)
    expect(window.localStorage.getItem('larger-text')).toBe('largest')
    expect(readTextSize()).toBe('largest')
  })

  it('ignores a garbage stored value', () => {
    window.localStorage.setItem('larger-text', '9000')
    expect(readTextSize()).toBe('normal')
  })

  it('still applies the size when storage is blocked, without throwing', () => {
    const restore = blockStorage()
    try {
      expect(readTextSize()).toBe('normal')
      expect(saveTextSize('large')).toBe(false)
      expect(root.style.fontSize).toBe('115%')
    } finally {
      restore()
    }
  })

  it('pre-paint script applies the saved size, and survives blocked storage', () => {
    window.localStorage.setItem('larger-text', 'largest')
    new Function(TEXT_SIZE_INIT_SCRIPT)()
    expect(root.style.fontSize).toBe('130%')
    expect(root.dataset.textSize).toBe('largest')

    root.style.fontSize = ''
    const restore = blockStorage()
    try {
      expect(() => new Function(TEXT_SIZE_INIT_SCRIPT)()).not.toThrow()
      expect(root.style.fontSize).toBe('')
    } finally {
      restore()
    }
  })

  it('pre-paint script is wired into the root layout head', () => {
    const src = readFileSync(path.join(here, 'app/layout.tsx'), 'utf8')
    expect(src).toContain('TEXT_SIZE_INIT_SCRIPT')
    expect(src.indexOf('TEXT_SIZE_INIT_SCRIPT }')).toBeLessThan(src.indexOf('<body>'))
  })
})

describe('resident Account control', () => {
  it('is a labelled radio group with three options, applies, saves and announces', () => {
    r = createRoot(mount)
    act(() => r!.render(<TextSizeControl />))
    expect(mount.querySelector('fieldset legend')?.textContent).toBe('Text size')
    const radios = [...mount.querySelectorAll<HTMLInputElement>('input[type=radio]')]
    expect(radios.map((x) => x.value)).toEqual(['normal', 'large', 'largest'])
    expect(radios[0].checked).toBe(true)
    // each label is a 48px target
    for (const l of mount.querySelectorAll('label')) expect(l.className).toContain('min-h-12')

    act(() => radios[2].click())
    expect(root.style.fontSize).toBe('130%')
    expect(window.localStorage.getItem('larger-text')).toBe('largest')
    expect(mount.querySelector('[role=status]')?.textContent).toBe('Text size set to Largest.')
    expect(radios[2].checked).toBe(true)
  })

  it('restores the saved size into the control after mount', () => {
    window.localStorage.setItem('larger-text', 'large')
    r = createRoot(mount)
    act(() => r!.render(<TextSizeControl />))
    const checked = mount.querySelector<HTMLInputElement>('input[type=radio]:checked')
    expect(checked?.value).toBe('large')
  })

  it('says so when the browser blocks saving', () => {
    const restore = blockStorage()
    try {
      r = createRoot(mount)
      act(() => r!.render(<TextSizeControl />))
      act(() => mount.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click())
      expect(root.style.fontSize).toBe('115%')
      expect(mount.querySelector('[role=status]')?.textContent).toContain('this visit only')
    } finally {
      restore()
    }
  })
})

describe('board account menu control', () => {
  it('renders Text size radio items with 48px targets and applies on select', async () => {
    r = createRoot(mount)
    act(() =>
      r!.render(
        <DropdownMenu open>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <TextSizeMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>,
      ),
    )
    const items = [...document.body.querySelectorAll<HTMLElement>('[role=menuitemradio]')]
    expect(items.map((i) => i.textContent)).toEqual(['Normal', 'Large', 'Largest'])
    expect(items[0].getAttribute('aria-checked')).toBe('true')
    for (const i of items) expect(i.className).toContain('min-h-12')
    expect(document.body.textContent).toContain('Text size')

    await act(async () => {
      items[1].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      items[1].click()
    })
    expect(root.style.fontSize).toBe('115%')
    expect(window.localStorage.getItem('larger-text')).toBe('large')
  })

  it('is mounted in the board account menu', () => {
    const src = readFileSync(path.join(here, 'components/layout/HoaChrome.tsx'), 'utf8')
    expect(src).toContain('<TextSizeMenuItems />')
  })
})

describe('ratchet: layouts must follow the root font size', () => {
  const walkSrc = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n)
      if (statSync(f).isDirectory()) return walkSrc(f)
      return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [f] : []
    })
  const files = walkSrc(here).map((f) => [path.relative(here, f), readFileSync(f, 'utf8')] as const)

  it('no component sets a fixed-px Tailwind font size (text-[12px] ignores the setting)', () => {
    const offenders = files.filter(([, s]) => /text-\[[0-9.]+px\]/.test(s)).map(([f]) => f)
    expect(offenders).toEqual([])
  })

  it('nothing else sets the root font-size (it would fight the setting)', () => {
    const offenders = files
      .filter(([f, s]) => f !== 'app/layout.tsx' && /documentElement\.style\.fontSize/.test(s))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })

  it('the resident tab bar grows with the text instead of a fixed height', () => {
    const s = readFileSync(path.join(here, 'components/resident/ResidentTabBar.tsx'), 'utf8')
    expect(s).not.toMatch(/(?<![-\w])h-16(?![-\w])/)
    expect(s).toContain('min-h-16')
  })

  it('touch inputs keep the 16px floor but follow the setting', () => {
    const css = readFileSync(path.join(here, 'app/globals.css'), 'utf8')
    expect(css).toContain('font-size: max(16px, 1rem)')
  })
})
