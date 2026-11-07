import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  BATCH_SIZE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  KEY_LOCATION,
  LIB_RULES,
  SITE_ORIGIN,
  SITE_HOST,
  buildPayload,
  chunk,
  mapChangedFilesToUrls,
  parseArgs,
  submitUrls,
  urlForPath,
  urlsFromSitemap,
} from './submit'

const ALL = ['/', '/hoa', '/pricing', '/features/violations', '/georgia', '/georgia/a', '/guides/x', '/states/ga', '/professionals', '/about'].map(urlForPath)

describe('urlsFromSitemap', () => {
  it('keeps own-host URLs, drops others and junk, de-duplicates', () => {
    const out = urlsFromSitemap([
      { url: urlForPath('/') },
      { url: urlForPath('/hoa') },
      { url: urlForPath('/hoa') },
      { url: 'https://example.com/x' },
      { url: 'not a url' },
    ])
    expect(out).toEqual([`https://${SITE_HOST}`, `https://${SITE_HOST}/hoa`])
  })
})

describe('mapChangedFilesToUrls', () => {
  const m = (f: string[]) => mapChangedFilesToUrls(f, ALL).map((u) => new URL(u).pathname)
  it('maps georgia data to georgia, guides and templates pages', () => {
    expect(m(['apps/marketing/src/lib/georgia/guides-a.ts'])).toEqual(['/georgia', '/georgia/a', '/guides/x'])
  })
  it('maps state, professionals and pricing data', () => {
    expect(m(['apps/marketing/src/lib/state-law.ts'])).toEqual(['/states/ga'])
    expect(m(['apps/marketing/src/lib/professionals.ts'])).toEqual(['/professionals'])
    expect(m(['apps/marketing/src/lib/hoa-pricing.ts'])).toEqual(['/hoa', '/pricing'])
  })
  it('shared files and the root layout without date data fall back to every page', () => {
    expect(mapChangedFilesToUrls(['apps/marketing/src/lib/site.ts'], ALL)).toEqual(ALL)
    expect(mapChangedFilesToUrls(['apps/marketing/src/app/layout.tsx'], ALL)).toEqual(ALL)
  })
  it('shared files narrow to URLs modified on or after the previous deploy', () => {
    const lastModified = new Map<string, Date>([
      [urlForPath('/'), new Date('2026-10-01T00:00:00Z')],
      [urlForPath('/hoa'), new Date('2026-11-05T00:00:00Z')],
      [urlForPath('/pricing'), new Date('2026-11-07T00:00:00Z')],
    ])
    const out = mapChangedFilesToUrls(['apps/marketing/src/lib/jsonld.ts'], ALL, {
      lastModified,
      since: new Date('2026-11-05T00:00:00Z'),
    }).map((u) => new URL(u).pathname)
    expect(out).toEqual(['/hoa', '/pricing'])
  })
  it('maps app route files, including dynamic segments, to their section', () => {
    expect(m(['apps/marketing/src/app/features/violations/page.tsx'])).toEqual(['/features/violations'])
    expect(m(['apps/marketing/src/app/georgia/[slug]/page.tsx'])).toEqual(['/georgia', '/georgia/a'])
    expect(m(['apps/marketing/src/app/page.tsx'])).toEqual(['/'])
  })
  it('ignores tests, components, unmapped lib files and other apps', () => {
    expect(
      m([
        'apps/marketing/src/lib/georgia/georgia-guides.test.ts',
        'apps/marketing/src/components/Nav.tsx',
        'apps/marketing/src/lib/cn.ts',
        'apps/hoa/src/lib/site.ts',
        'docs/owner-actions.md',
      ]),
    ).toEqual([])
  })
  it('returns sitemap order without duplicates', () => {
    const out = m(['apps/marketing/src/lib/hoa-pricing.ts', 'apps/marketing/src/lib/workflows.ts'])
    expect(out).toEqual(['/hoa', '/pricing', '/features/violations'])
  })
})

describe('real sitemap', () => {
  const run = (script: string, args: string[] = []) =>
    spawnSync('pnpm', ['exec', 'tsx', '--tsconfig', 'apps/marketing/tsconfig.json', script, ...args], {
      encoding: 'utf8',
      cwd: new URL('../../', import.meta.url),
    })
  const urls: string[] = JSON.parse(
    execFileSync('pnpm', ['exec', 'tsx', '--tsconfig', 'apps/marketing/tsconfig.json', 'scripts/indexnow/list-urls.ts'], {
      encoding: 'utf8',
      cwd: new URL('../../', import.meta.url),
    }),
  )
  it('every URL is on the site origin', () => {
    expect(urls.length).toBeGreaterThan(100)
    for (const u of urls) expect(u.startsWith(SITE_ORIGIN)).toBe(true)
  })
  it('every LIB_RULES route prefix matches at least one URL', () => {
    for (const rule of LIB_RULES) {
      if (rule.routes === 'ALL') continue
      for (const prefix of rule.routes) {
        const hit = urls.some((u) => {
          const p = new URL(u).pathname
          return prefix === '/' ? p === '/' : p === prefix || p.startsWith(`${prefix}/`)
        })
        expect(hit, prefix).toBe(true)
      }
    }
  })
  it('a bad ref still exits 0', () => {
    const r = run('scripts/indexnow/run.ts', ['--changed', 'no-such-ref-xyz', '--dry-run'])
    expect(r.status).toBe(0)
  })
}, 120_000)

describe('shared-change edge cases', () => {
  const lm = new Map<string, Date>([
    [urlForPath('/hoa'), new Date('2026-11-05T00:00:00Z')],
    [urlForPath('/pricing'), new Date('2026-11-04T00:00:00Z')],
  ])
  it('floors a mid-day since to the start of its UTC day', () => {
    const out = mapChangedFilesToUrls(['apps/marketing/src/lib/site.ts'], ALL, {
      lastModified: lm,
      since: new Date('2026-11-05T15:30:00Z'),
    }).map((u) => new URL(u).pathname)
    expect(out).toEqual(['/hoa'])
  })
  it('a sitemap.ts-only change is shared and narrowed by lastModified', () => {
    const out = mapChangedFilesToUrls(['apps/marketing/src/app/sitemap.ts'], ALL, {
      lastModified: lm,
      since: new Date('2026-11-04T09:00:00Z'),
    }).map((u) => new URL(u).pathname)
    expect(out).toEqual(['/hoa', '/pricing'])
  })
})

describe('key consistency', () => {
  it('workflow key equals the script key, the key file name and its content', () => {
    const wf = readFileSync(new URL('../../.github/workflows/indexnow.yml', import.meta.url), 'utf8')
    expect(wf.match(/INDEXNOW_KEY: ([0-9a-f]{32})/)?.[1]).toBe(INDEXNOW_KEY)
    const src = readFileSync(new URL('./submit.ts', import.meta.url), 'utf8')
    expect(src).toContain(`INDEXNOW_KEY = '${INDEXNOW_KEY}'`)
    const file = new URL(`../../apps/marketing/public/${INDEXNOW_KEY}.txt`, import.meta.url)
    expect(readFileSync(file, 'utf8')).toBe(INDEXNOW_KEY)
  })
})

describe('chunk', () => {
  it('batches at the 10,000 protocol limit', () => {
    const urls = Array.from({ length: BATCH_SIZE * 2 + 5 }, (_, i) => `u${i}`)
    expect(chunk(urls).map((b) => b.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 5])
    expect(chunk([])).toEqual([])
  })
})

describe('payload and submission', () => {
  it('has the IndexNow shape', () => {
    expect(buildPayload(['a'])).toEqual({ host: SITE_HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList: ['a'] })
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/)
  })
  it('posts JSON to the endpoint, one request per batch', async () => {
    const f = vi.fn().mockResolvedValue({ status: 200 })
    const urls = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => `https://${SITE_HOST}/p${i}`)
    const r = await submitUrls(urls, f)
    expect(f).toHaveBeenCalledTimes(2)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe(INDEXNOW_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ host: SITE_HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION })
    expect(JSON.parse(init.body).urlList).toHaveLength(BATCH_SIZE)
    expect(r).toEqual({ ok: true, submitted: BATCH_SIZE + 1, batches: 2, statuses: [200, 200] })
  })
  it('never throws on network errors and keeps going', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ status: 202 })
    const urls = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => `u${i}`)
    const r = await submitUrls(urls, f)
    expect(r.ok).toBe(false)
    expect(r.statuses).toEqual(['error', 202])
    expect(r.submitted).toBe(1)
  })
  it('aborts a hung request at the timeout and does not throw', async () => {
    const hung = (_url: string, init: RequestInit) =>
      new Promise<{ status: number }>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const r = await submitUrls(['u'], hung, 25)
    expect(r).toMatchObject({ ok: false, submitted: 0, statuses: ['error'] })
  })
  it('records non-accepted statuses without throwing', async () => {
    const r = await submitUrls(['u'], vi.fn().mockResolvedValue({ status: 429 }))
    expect(r).toMatchObject({ ok: false, submitted: 0, statuses: [429] })
  })
})

describe('parseArgs', () => {
  it('reads modes', () => {
    expect(parseArgs(['--all'])).toEqual({ mode: 'all', ref: null, dryRun: false, since: null })
    expect(parseArgs(['--changed', 'abc', '--dry-run'])).toEqual({ mode: 'changed', ref: 'abc', dryRun: true, since: null })
    expect(parseArgs(['--changed', 'abc', '--since', '2026-11-05']).since?.toISOString()).toBe('2026-11-05T00:00:00.000Z')
    expect(parseArgs(['--changed']).ref).toBeNull()
    expect(parseArgs([]).mode).toBeNull()
  })
})

describe('key file', () => {
  it('is served from public/ named <key>.txt and contains the key', () => {
    const dir = new URL('../../apps/marketing/public/', import.meta.url)
    expect(readdirSync(dir)).toContain(`${INDEXNOW_KEY}.txt`)
    expect(readFileSync(new URL(`${INDEXNOW_KEY}.txt`, dir), 'utf8').trim()).toBe(INDEXNOW_KEY)
  })
  it('robots.ts does not disallow anything but the whole site on previews', () => {
    const robots = readFileSync(new URL('../../apps/marketing/src/app/robots.ts', import.meta.url), 'utf8')
    expect(robots).toContain("allow: '/'")
    expect(robots).not.toMatch(/disallow: '\/[^']/)
  })
})
