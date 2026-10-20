import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { attachCiShots, listPngs } from './lib/build'
import { renderEmail } from './lib/email'
import {
  COMPRESSION_STEPS,
  MAX_BYTES,
  MAX_HEIGHT,
  MAX_WIDTH,
  compressWithinLimit,
  prepareImages,
  sharpProcessor,
} from './lib/images'
import { combineNotes, parseNote, parseShotsFrontmatter } from './lib/note'
import {
  autoSelectRoutes,
  candidateFiles,
  captionForRoute,
  eligibleAncestors,
  fileForRoute,
  isDocsOnly,
  pageFileToRoute,
  pickShotsSource,
  resolveCiShots,
  shotForRoute,
  SHOTS_UNAVAILABLE,
  type ShotsRun,
} from './lib/ui-shots'
import type { Shot } from '../ui-shots-list'

const tmpDirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'rn-shots-'))
  tmpDirs.push(d)
  return d
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const FIXTURES: Shot[] = [
  { name: 'approvals', path: '/approvals', auth: true },
  { name: 'approvals-bills', path: '/approvals?type=bill', auth: true },
  { name: 'approvals-bill-edit', path: '/approvals?type=bill', auth: true, viewport: true, click: 'x', themes: ['light'] },
  { name: 'dues-no-association', path: '/dues', auth: true, org: 'bareHoaOrgId' },
  { name: 'dues', path: '/dues', auth: true },
  { name: 'properties-edit', path: '/properties/:propertyId/edit', auth: true, themes: ['light'] },
  { name: 'phone-only', path: '/phone', auth: true, widths: [375] },
  { name: 'dark-only', path: '/dark', auth: true, themes: ['dark'] },
  { name: 'pm-home', app: 'pm', path: '/', auth: true },
  { name: 'dashboard', path: '/', auth: true },
  { name: 'gallery', path: '/ui-gallery' },
]

describe('route → ui-shots file', () => {
  it('names files <name>--<width>-<theme>.png, 1440-light first, then 375-light', () => {
    expect(candidateFiles(FIXTURES[0]!)).toEqual(['approvals--1440-light.png', 'approvals--375-light.png'])
    expect(candidateFiles(FIXTURES.find((s) => s.name === 'phone-only')!)).toEqual(['phone-only--375-light.png'])
    expect(candidateFiles(FIXTURES.find((s) => s.name === 'dark-only')!)).toEqual([])
  })

  it('picks the plain HOA shot of a route, not a dialog, another org or another app', () => {
    expect(shotForRoute('/approvals?type=bill', FIXTURES)?.name).toBe('approvals-bills')
    expect(shotForRoute('/dues', FIXTURES)?.name).toBe('dues')
    expect(shotForRoute('/', FIXTURES)?.name).toBe('dashboard')
    expect(shotForRoute('/approvals/', FIXTURES)?.name).toBe('approvals')
    expect(shotForRoute('/nowhere', FIXTURES)).toBeNull()
  })

  it('matches dynamic segments to a fixture in either spelling', () => {
    expect(shotForRoute('/properties/[id]/edit', FIXTURES)?.name).toBe('properties-edit')
    expect(shotForRoute('/properties/:propertyId/edit', FIXTURES)?.name).toBe('properties-edit')
    expect(shotForRoute('/properties/[id]', FIXTURES)).toBeNull()
  })

  it('falls back to 375 when 1440 is missing from the artifact', () => {
    const both = new Set(['dues--1440-light.png', 'dues--375-light.png', 'dues--1440-dark.png'])
    expect(fileForRoute('/dues', both, FIXTURES)).toBe('dues--1440-light.png')
    expect(fileForRoute('/dues', new Set(['dues--375-light.png', 'dues--1440-dark.png']), FIXTURES)).toBe(
      'dues--375-light.png',
    )
    expect(fileForRoute('/dues', new Set(['dues--1440-dark.png']), FIXTURES)).toBeNull()
  })

  it('maps app router page files to routes', () => {
    expect(pageFileToRoute('apps/hoa/src/app/(dashboard)/accounting/payment-plans/page.tsx')).toBe(
      '/accounting/payment-plans',
    )
    expect(pageFileToRoute('apps/hoa/src/app/(dashboard)/page.tsx')).toBe('/')
    expect(pageFileToRoute('apps/hoa/src/app/resident/dues/page.tsx')).toBe('/resident/dues')
    expect(pageFileToRoute('apps/hoa/src/app/(dashboard)/properties/[id]/edit/page.tsx')).toBe('/properties/[id]/edit')
    expect(pageFileToRoute('apps/hoa/src/app/(dashboard)/accounting/payment-plans/columns.tsx')).toBeNull()
    expect(pageFileToRoute('apps/hoa/src/app/(dashboard)/_components/page.tsx')).toBeNull()
    expect(pageFileToRoute('apps/hoa/src/app/docs/[...slug]/page.tsx')).toBeNull()
    expect(pageFileToRoute('apps/pm/src/app/page.tsx')).toBeNull()
  })

  it('auto-selects up to 3 changed pages that have fixtures, skipping dynamic ones without', () => {
    const changed = [
      'apps/hoa/src/app/(dashboard)/approvals/page.tsx',
      'apps/hoa/src/app/(dashboard)/approvals/actions.ts',
      'apps/hoa/src/app/(dashboard)/properties/[id]/page.tsx', // dynamic, no fixture
      'apps/hoa/src/app/(dashboard)/properties/[id]/edit/page.tsx', // dynamic, fixture
      'apps/hoa/src/app/(dev)/ui-gallery/page.tsx', // dev-only gallery
      'apps/hoa/src/app/(dashboard)/no-fixture/page.tsx',
      'apps/hoa/src/app/(dashboard)/dues/page.tsx',
      'apps/hoa/src/app/(dashboard)/page.tsx',
    ]
    expect(autoSelectRoutes(changed, FIXTURES).map((r) => r.route)).toEqual([
      '/approvals',
      '/properties/[id]/edit',
      '/dues',
    ])
    expect(autoSelectRoutes(['packages/db/src/x.ts'], FIXTURES)).toEqual([])
  })

  it('resolves requests to files, with captions, once per shot', () => {
    const available = new Map([
      ['approvals--1440-light.png', '/a/approvals--1440-light.png'],
      ['dues--375-light.png', '/a/dues--375-light.png'],
    ])
    const r = resolveCiShots(
      [{ route: '/approvals', caption: 'The queue' }, { route: '/approvals/' }, { route: '/dues' }, { route: '/nowhere' }],
      available,
      FIXTURES,
    )
    expect(r.attached).toEqual([
      { route: '/approvals', file: '/a/approvals--1440-light.png', caption: 'The queue' },
      { route: '/dues', file: '/a/dues--375-light.png', caption: 'Dues' },
    ])
    expect(r.missing).toEqual(['/nowhere'])
    expect(captionForRoute('/accounting/payment-plans')).toBe('Accounting › Payment plans')
    expect(captionForRoute('/properties/[id]/edit')).toBe('Properties › Edit')
  })

  it('the README example route has a ui-shots fixture', () => {
    expect(shotForRoute('/accounting/payment-plans')?.name).toBe('accounting-payment-plans')
  })
})

describe('shots: front matter', () => {
  const NOTE = `---
title: "Plans: fixed"
shots:
  - route: /accounting/payment-plans
    caption: Choosing the charges a plan replaces
  - /approvals
  - route: not-a-route
  - route: //evil.example/x
  - caption: no route
whats_new:
  - title: Something
    body: A thing.
    roles: [admin]
---

## Summary

Hello.
`
  it('parses routes and optional captions, dropping invalid entries', () => {
    expect(parseShotsFrontmatter(NOTE)).toEqual([
      { route: '/accounting/payment-plans', caption: 'Choosing the charges a plan replaces' },
      { route: '/approvals' },
    ])
    const note = parseNote(NOTE, '/x/2026-10-19-2220-plans.md')
    expect(note.title).toBe('Plans: fixed')
    expect(combineNotes([note], { sha: 'a'.repeat(40) }).shotRequests).toHaveLength(2)
  })

  it('never throws on malformed YAML or a missing block', () => {
    expect(parseShotsFrontmatter('---\ntitle: a: b: [\n---\n')).toEqual([])
    expect(parseShotsFrontmatter('---\ntitle: x\n---\n')).toEqual([])
    expect(parseShotsFrontmatter('no front matter')).toEqual([])
    expect(parseShotsFrontmatter('---\nshots: /one\n---\n')).toEqual([])
  })
})

describe('ancestor fallback', () => {
  const D = 'd'.repeat(40)
  const A = 'a'.repeat(40)
  const B = 'b'.repeat(40)
  const C = 'c'.repeat(40)

  it('docs-only means docs/ or top-level Markdown', () => {
    expect(isDocsOnly(['docs/releases/x.md', 'docs/backlog.md', 'README.md', 'CLAUDE.md'])).toBe(true)
    expect(isDocsOnly([])).toBe(true)
    expect(isDocsOnly(['docs/x.md', 'apps/hoa/content/guide/dues.md'])).toBe(false)
    expect(isDocsOnly(['.github/workflows/release-notes.yml'])).toBe(true)
    expect(isDocsOnly(['tests/integration/contracts/inngest-wiring.test.ts', 'apps/hoa/src/lib/x.test.ts'])).toBe(true)
    expect(isDocsOnly(['apps/hoa/src/lib/x.ts'])).toBe(false)
  })

  it('keeps the deployed SHA and ancestors with only docs changed since, nearest first', () => {
    const eligible = eligibleAncestors([
      { sha: D, changedSince: [] },
      { sha: A, changedSince: ['docs/releases/n.md'] },
      { sha: B, changedSince: ['docs/releases/n.md', 'apps/hoa/src/app/page.tsx'] },
      { sha: C, changedSince: ['docs/releases/n.md'] }, // e.g. the other side of a merge
    ])
    expect(eligible).toEqual([D, A, C])
  })

  it('looks back at most 20 ancestors', () => {
    const chain = Array.from({ length: 30 }, (_, i) => ({ sha: String(i).padStart(40, '0'), changedSince: ['docs/x.md'] }))
    expect(eligibleAncestors(chain)).toHaveLength(21)
  })

  const run = (id: number, status: string, hasArtifact = status === 'completed'): ShotsRun => ({
    id,
    status,
    conclusion: status === 'completed' ? 'success' : null,
    hasArtifact,
  })

  it('uses the deployed SHA run when it has shots', () => {
    const runs = new Map([[D, run(1, 'completed')], [A, run(2, 'completed')]])
    expect(pickShotsSource([D, A], runs)).toEqual({ kind: 'ready', sha: D, runId: 1 })
  })

  it('falls back to the nearest ancestor with a completed run', () => {
    const runs = new Map<string, ShotsRun | null>([[D, null], [A, run(2, 'completed', false)], [B, run(3, 'completed')]])
    expect(pickShotsSource([D, A, B], runs)).toEqual({ kind: 'ready', sha: B, runId: 3 })
  })

  it('waits for the nearest in-progress run, and skips it once the wait has timed out', () => {
    const runs = new Map<string, ShotsRun | null>([[D, run(1, 'in_progress')], [A, run(2, 'completed')]])
    expect(pickShotsSource([D, A], runs)).toEqual({ kind: 'wait', sha: D, runId: 1 })
    expect(pickShotsSource([D, A], runs, { skipPending: true })).toEqual({ kind: 'ready', sha: A, runId: 2 })
  })

  it('reports none when nothing usable exists', () => {
    expect(pickShotsSource([D], new Map([[D, null]]))).toEqual({ kind: 'none' })
    expect(pickShotsSource([], new Map())).toEqual({ kind: 'none' })
  })
})

describe('compression limits', () => {
  it('tries steps in order and stops at the first under the byte limit', async () => {
    const tried: number[] = []
    const sizes = [900, 600, 200, 100]
    const r = await compressWithinLimit(
      async (s) => {
        tried.push(s.quality)
        return { data: Buffer.alloc(sizes[tried.length - 1]!), width: s.width, height: 10 }
      },
      [
        { width: 1200, quality: 80 },
        { width: 1200, quality: 70 },
        { width: 1200, quality: 60 },
        { width: 1200, quality: 50 },
      ],
      250,
    )
    expect(tried).toEqual([80, 70, 60])
    expect(r.data.length).toBe(200)
  })

  it('returns the smallest attempt when none fits', async () => {
    const r = await compressWithinLimit(async (s) => ({ data: Buffer.alloc(s.width), width: s.width, height: 1 }), [
      { width: 500, quality: 50 },
      { width: 300, quality: 50 },
    ], 10)
    expect(r.width).toBe(300)
  })

  it('never widens past MAX_WIDTH', () => {
    expect(COMPRESSION_STEPS.every((s) => s.width <= MAX_WIDTH)).toBe(true)
    expect(COMPRESSION_STEPS[0]).toEqual({ width: 1200, quality: 78 })
  })

  it('a noisy full-page 1440px capture comes out JPEG, ≤1200 wide, ≤2400 tall, under 250 KB', async () => {
    const width = 1440
    const height = 4200
    const raw = Buffer.alloc(width * height * 3)
    let x = 12345
    for (let i = 0; i < raw.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff
      raw[i] = x >> 23
    }
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer()
    const proc = sharpProcessor(sharp as unknown as Parameters<typeof sharpProcessor>[0])
    const out = await proc(png, 'x.png', { maxHeight: MAX_HEIGHT })
    expect(out.contentType).toBe('image/jpeg')
    expect(out.content.length).toBeLessThanOrEqual(MAX_BYTES)
    expect(out.width).toBeLessThanOrEqual(MAX_WIDTH)
    expect(out.height).toBeLessThanOrEqual(MAX_HEIGHT)
    const meta = await sharp(out.content).metadata()
    expect(meta.format).toBe('jpeg')
  }, 60_000)

  it('crops only CI shots; a committed screenshot keeps its full height', async () => {
    const dir = tmp()
    const tall = await sharp({ create: { width: 800, height: 3000, channels: 3, background: '#88aacc' } }).png().toBuffer()
    writeFileSync(path.join(dir, 'a.png'), tall)
    const [ci, committed] = await prepareImages([
      { alt: 'ci', file: path.join(dir, 'a.png'), fromCi: true },
      { alt: 'committed', file: path.join(dir, 'a.png') },
    ])
    expect(ci!.height).toBe(MAX_HEIGHT)
    expect(committed!.height).toBe(3000)
  }, 60_000)
})

describe('unavailable notice', () => {
  it('lists PNGs anywhere under the artifact dir, and nothing for a missing dir', () => {
    const dir = tmp()
    mkdirSync(path.join(dir, 'logs'))
    writeFileSync(path.join(dir, 'dues--1440-light.png'), '')
    writeFileSync(path.join(dir, 'logs', 'ui-shots.log'), '')
    expect([...listPngs(dir).keys()]).toEqual(['dues--1440-light.png'])
    expect(listPngs(path.join(dir, 'nope')).size).toBe(0)
  })

  it('renders the line in HTML and text when CI shots were wanted but none attached', () => {
    const note = combineNotes([parseNote('---\ntitle: T\n---\n\n## Summary\n\nHi.\n', '/x/2026-10-19-0000-t.md')], {
      sha: 'a'.repeat(40),
      deployedAt: '2026-10-19T10:00:00-04:00',
    })
    const e = renderEmail({ ...note, screenshotNotice: SHOTS_UNAVAILABLE }, [])
    expect(e.html).toContain('Screenshots unavailable for this deploy.')
    expect(e.text).toContain('Screenshots unavailable for this deploy.')
    expect(renderEmail(note, []).html).not.toContain('Screenshots unavailable')
  })
})

describe('attachCiShots', () => {
  it('adds listed shots after committed screenshots, or the notice when none are found', () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'accounting-payment-plans--1440-light.png'), '')
    const note = combineNotes(
      [
        parseNote(
          '---\ntitle: T\nshots:\n  - route: /accounting/payment-plans\n    caption: Plans\n---\n\n## Summary\n\nHi.\n',
          '/x/2026-10-19-0000-t.md',
        ),
      ],
      { sha: 'a'.repeat(40), deployedAt: '2026-10-19T10:00:00-04:00' },
    )
    const opts = { root: dir, sha: 'a'.repeat(40), previousSha: null }
    const hit = attachCiShots(note, { ...opts, uiShotsDir: dir })
    expect(hit.note.screenshots).toEqual([
      { alt: 'Plans', file: path.join(dir, 'accounting-payment-plans--1440-light.png'), fromCi: true },
    ])
    expect(hit.note.screenshotNotice).toBeUndefined()
    expect(hit.summary).toMatchObject({ mode: 'listed', attached: ['/accounting/payment-plans'] })

    const miss = attachCiShots(note, { ...opts, uiShotsDir: path.join(dir, 'missing') })
    expect(miss.note.screenshots).toEqual([])
    expect(miss.note.screenshotNotice).toBe(SHOTS_UNAVAILABLE)
  })
})
