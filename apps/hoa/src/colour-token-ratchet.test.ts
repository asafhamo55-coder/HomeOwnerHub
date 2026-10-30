import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import resolveConfig from 'tailwindcss/resolveConfig'
import config from '../tailwind.config'

/**
 * Undefined-colour-class ratchet.
 *
 * Tailwind silently drops a utility it cannot resolve: `text-muted-fg`
 * (the token is `foreground-muted`) renders as inherited colour and nothing
 * anywhere complains. This test reads the app's REAL resolved Tailwind
 * theme (the design-system-v2 preset in packages/ui, extended over the
 * Tailwind defaults) and fails, with file:line, on any colour utility in
 * apps/hoa/src or packages/ui/src whose colour name does not exist.
 *
 * Non-colour utilities sharing a prefix (text-sm, border-t, ring-2,
 * bg-gradient-to-r, ...) are told apart by the theme's own fontSize,
 * borderWidth, ringWidth... keys plus a small keyword list for the
 * parts of Tailwind that are not theme-driven.
 *
 * Crude by design: reads source text. Arbitrary values (`text-[#fff]`) are
 * ignored; dynamic fragments (`bg-${x}`) are not matched.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const DIRS = ['apps/hoa/src', 'packages/ui/src']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const theme = resolveConfig(config).theme as unknown as Record<string, any>

function flattenColours(obj: Record<string, unknown>, prefix = '', out = new Set<string>()) {
  for (const [key, value] of Object.entries(obj)) {
    const name = key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key
    if (value && typeof value === 'object') flattenColours(value as Record<string, unknown>, name, out)
    else if (name) out.add(name)
  }
  return out
}

const COLOURS = flattenColours(theme.colors)

const keys = (k: string): string[] => Object.keys(theme[k] ?? {}).filter((x) => x !== 'DEFAULT')

// Prefixes whose "name" slot may hold a non-colour value. Theme-derived where
// Tailwind has a theme key, otherwise the fixed keyword set of the utility.
const SIDES = ['t', 'r', 'b', 'l', 'x', 'y', 's', 'e']
const NON_COLOUR: Record<string, (name: string) => boolean> = {
  text: (n) =>
    keys('fontSize').includes(n) ||
    ['left', 'center', 'right', 'justify', 'start', 'end', 'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip'].includes(n) ||
    n.startsWith('opacity-'),
  bg: (n) =>
    /^(gradient-to-|clip-|origin-|blend-|opacity-|repeat|no-repeat)/.test(n) ||
    ['cover', 'contain', 'auto', 'fixed', 'local', 'scroll', 'none', 'center', 'top', 'bottom', 'left', 'right',
      'left-top', 'left-bottom', 'right-top', 'right-bottom'].includes(n),
  border: (n) => {
    const m = n.match(/^([a-z]+)-(.+)$/)
    if (['solid', 'dashed', 'dotted', 'double', 'hidden', 'none', 'collapse', 'separate'].includes(n)) return true
    if (/^spacing(-[xy])?-/.test(n) || n.startsWith('opacity-')) return true
    if (keys('borderWidth').includes(n)) return true
    if (SIDES.includes(n)) return true
    return !!m && SIDES.includes(m[1]!) && keys('borderWidth').includes(m[2]!)
  },
  ring: (n) =>
    keys('ringWidth').includes(n) || n === 'inset' || n.startsWith('offset-') || n.startsWith('opacity-'),
  'ring-offset': (n) => keys('ringOffsetWidth').includes(n),
  outline: (n) =>
    ['none', 'dashed', 'dotted', 'double'].includes(n) || keys('outlineWidth').includes(n) || n.startsWith('offset-'),
  divide: (n) =>
    ['x', 'y', 'x-reverse', 'y-reverse', 'solid', 'dashed', 'dotted', 'double', 'none'].includes(n) ||
    keys('divideWidth').includes(n) || n.startsWith('opacity-') || /^[xy]-/.test(n),
  stroke: (n) => keys('strokeWidth').includes(n) || n === 'none',
  fill: (n) => n === 'none',
  from: () => false,
  via: () => false,
  to: () => false,
  decoration: (n) =>
    ['auto', 'from-font', 'solid', 'double', 'dotted', 'dashed', 'wavy', 'slice', 'clone'].includes(n) ||
    keys('textDecorationThickness').includes(n),
  accent: (n) => n === 'auto',
  caret: () => false,
  placeholder: (n) => n.startsWith('opacity-'),
}

// Longest prefix first so `ring-offset-white` is not read as `ring` + `offset-white`.
const PREFIXES = Object.keys(NON_COLOUR).sort((a, b) => b.length - a.length)
const RE = new RegExp(
  `(?<![\\w\\-\\[,#])(?:[a-z][a-z0-9-]*:|\\[[^\\]\\s]*\\]:)*(-?)(${PREFIXES.join('|')})-([a-z][a-z0-9-]*)(?:/[\\w.\\[\\]%]+)?(?![\\w%-]|\\s*:)`,
  'g',
)

/**
 * Words that match the grammar but are prose or identifiers, not classes
 * ("fill-in the form", id="text-messages", parserVersion 'text-passthrough-1').
 * Exact class text, so a real typo of a colour can never hide here.
 */
const NOT_CLASSES = new Set([
  'fill-in', 'text-message', 'text-messages', 'text-only', 'text-extracts',
  'text-passthrough-1', 'text-embedding-3-small', 'from-inbox', 'accent-folded',
])
/** Files whose strings are token names / CSS values, not class lists. */
const SKIP_FILES = new Set(['packages/ui/src/tokens.ts'])

const SIDE_PREFIX = /^(?:[trblxyse])-(.+)$/

function isValid(prefix: string, name: string): boolean {
  if (NOT_CLASSES.has(`${prefix}-${name}`)) return true
  if (COLOURS.has(name) || NON_COLOUR[prefix]!(name)) return true
  // Per-side border colour: border-l-accent, border-t-danger/40.
  const side = prefix === 'border' ? name.match(SIDE_PREFIX) : null
  return !!side && COLOURS.has(side[1]!)
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    // Tests assert on fixture strings; generated/ is prose.
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.includes('/generated/')) out.push(full)
  }
  return out
}

function findUndefinedColours(source: string): { line: number; cls: string }[] {
  const hits: { line: number; cls: string }[] = []
  source.split('\n').forEach((text, i) => {
    const t = text.trimStart()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    for (const m of text.matchAll(RE)) {
      const prefix = m[2]!
      const name = m[3]!
      if (!isValid(prefix, name)) hits.push({ line: i + 1, cls: `${prefix}-${name}` })
    }
  })
  return hits
}

describe('Tailwind colour-token ratchet', () => {
  it('resolves the real preset palette', () => {
    for (const c of ['foreground-muted', 'foreground-secondary', 'primary-fg', 'border-strong', 'white', 'black', 'transparent', 'current', 'inherit', 'slate-500']) {
      expect(COLOURS.has(c), c).toBe(true)
    }
    expect(COLOURS.has('muted-fg')).toBe(false)
  })

  it('flags unknown colours and ignores non-colour utilities', () => {
    const bad = findUndefinedColours(
      '<p className="text-muted-fg hover:bg-nope/50 border-t border-dashed ring-2 ring-offset-2 text-sm bg-gradient-to-r from-primary to-primary/50 text-foreground-muted/70 border-x-2 divide-y" />',
    )
    expect(bad.map((b) => b.cls)).toEqual(['text-muted-fg', 'bg-nope'])
  })

  it('has no undefined colour classes in apps/hoa/src or packages/ui/src', () => {
    const offenders: string[] = []
    for (const dir of DIRS) {
      for (const file of walk(path.join(repoRoot, dir))) {
        if (SKIP_FILES.has(path.relative(repoRoot, file))) continue
        for (const { line, cls } of findUndefinedColours(readFileSync(file, 'utf8'))) {
          offenders.push(`${path.relative(repoRoot, file)}:${line}  ${cls}`)
        }
      }
    }
    expect(offenders, `Undefined Tailwind colour classes (silently dropped at build):\n${offenders.join('\n')}\n`).toEqual([])
  })
})
