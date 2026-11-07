import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOGO } from '../../packages/ui/src/tokens'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const svg = (app: string, name: string) => readFileSync(path.join(root, 'apps', app, 'public/brand', name), 'utf8')

// The generated logo files must agree with the palette each target is built
// from (scripts/build-brand-assets.ts): the app with the shared LOGO token,
// the website with blue and green (docs/decisions/2026-11-07-website-blue-green.md).
const OLD_PURPLES = ['#6D28D9', '#4B27C9', '#E9D5FF']
const FILES = ['logo-mark.svg', 'logo-mark-dark.svg', 'logo-full.svg', 'logo-full-dark.svg', 'logo-wordmark.svg', 'logo-wordmark-dark.svg', 'icon.svg', 'icon-touch.svg']

describe('generated brand assets', () => {
  it('the app set uses the shared LOGO token', () => {
    for (const name of ['logo-mark.svg', 'icon.svg', 'icon-touch.svg']) {
      const s = svg('hoa', name)
      expect(s, name).toContain(LOGO.light.tile)
      expect(s, name).toContain(LOGO.light.line)
    }
    expect(svg('hoa', 'logo-wordmark-dark.svg')).toContain(LOGO.dark.accent)
  })

  it('the website set is blue with a white mark', () => {
    for (const name of ['logo-mark.svg', 'logo-mark-dark.svg', 'logo-full.svg', 'logo-full-dark.svg', 'icon.svg', 'icon-touch.svg']) {
      const s = svg('marketing', name)
      expect(s, name).toContain('#2563EB')
      expect(s, name).toContain('#FFFFFF')
    }
    expect(svg('marketing', 'logo-wordmark.svg')).toContain('#2563EB')
    expect(svg('marketing', 'logo-wordmark-dark.svg')).toContain('#BFDBFE')
  })

  it('the website set contains none of the old purples or violets', () => {
    for (const name of FILES) {
      for (const c of OLD_PURPLES) expect(svg('marketing', name).toUpperCase(), name).not.toContain(c)
    }
  })
})
