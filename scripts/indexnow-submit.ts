// IndexNow submission for the marketing site (www.homeownerledger.online).
//
// IndexNow tells Bing, Yandex and other engines about new or changed URLs
// right away, with no account. Ownership is proved by the key file served at
// the site root (apps/marketing/public/<key>.txt, containing the key). The
// key is public by design, so it lives in this file, not in env.
//
// Usage (the URL list comes from apps/marketing/src/app/sitemap.ts, never
// from the live site):
//   pnpm indexnow --all                 every sitemap URL
//   pnpm indexnow --changed <git-ref>   URLs whose source changed since ref
//   add --dry-run to print counts and skip the network call
//
// Never fails a deploy: any error prints a warning and exits 0. Logs counts
// and status codes only.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const INDEXNOW_KEY = '1ed9f14deb9b5e5a4c8de362a01b6fae'
export const SITE_HOST = 'www.homeownerledger.online'
export const SITE_ORIGIN = `https://${SITE_HOST}`
export const KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`
/** Protocol limit per request. */
export const BATCH_SIZE = 10_000
export const TIMEOUT_MS = 10_000

const MARKETING = 'apps/marketing/src/'

export interface SitemapEntryLike {
  url: string
}

/** Absolute, de-duplicated URLs on the site's own host, in sitemap order. */
export function urlsFromSitemap(entries: readonly SitemapEntryLike[]): string[] {
  const seen = new Set<string>()
  for (const { url } of entries) {
    try {
      if (new URL(url).host === SITE_HOST) seen.add(url)
    } catch {
      // not a URL: skip
    }
  }
  return [...seen]
}

/** Sitemap URL for a route path, matching sitemap.ts ('/' is the bare origin). */
export function urlForPath(path: string): string {
  return `${SITE_ORIGIN}${path === '/' ? '' : path}`
}

function pathOfUrl(url: string): string {
  return new URL(url).pathname
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

// lib data file (relative to apps/marketing/src/lib/) -> the route prefixes
// it feeds. 'ALL' means every page (shared metadata or origin).
const LIB_RULES: ReadonlyArray<{ match: (f: string) => boolean; routes: readonly string[] | 'ALL' }> = [
  { match: (f) => ['site.ts', 'page-meta.ts', 'jsonld.ts', 'hubs.ts'].includes(f), routes: 'ALL' },
  { match: (f) => f.startsWith('georgia/') || f === 'georgia-quotes.ts', routes: ['/georgia', '/guides', '/templates'] },
  { match: (f) => f === 'library.ts', routes: ['/guides', '/templates'] },
  { match: (f) => f === 'state-law.ts' || f === 'state-quotes.ts', routes: ['/states'] },
  { match: (f) => f === 'professionals.ts', routes: ['/professionals'] },
  { match: (f) => f === 'feature-pages.ts' || f === 'features.ts', routes: ['/features'] },
  { match: (f) => f === 'hoa-pricing.ts', routes: ['/pricing', '/hoa'] },
  { match: (f) => f === 'workflows.ts' || f === 'process-demos.ts', routes: ['/hoa', '/demo', '/features'] },
  { match: (f) => f === 'home-faq.ts', routes: ['/'] },
]

const isTest = (f: string) => /\.test\.tsx?$/.test(f)

/**
 * Map changed repo files to the sitemap URLs they affect. Only
 * apps/marketing/src/lib data files and app routes count; tests and
 * unrelated files are ignored. Result is a subset of `allUrls`, in
 * sitemap order.
 */
export function mapChangedFilesToUrls(changedFiles: readonly string[], allUrls: readonly string[]): string[] {
  const hit = new Set<string>()
  const addPrefix = (prefix: string) => {
    for (const u of allUrls) {
      const p = pathOfUrl(u)
      if (prefix === '/' ? p === '/' : under(p, prefix)) hit.add(u)
    }
  }
  for (const raw of changedFiles) {
    const file = raw.trim()
    if (!file.startsWith(MARKETING) || isTest(file)) continue
    const rel = file.slice(MARKETING.length)
    if (rel.startsWith('lib/')) {
      const rule = LIB_RULES.find((r) => r.match(rel.slice(4)))
      if (!rule) continue
      if (rule.routes === 'ALL') return [...allUrls]
      rule.routes.forEach(addPrefix)
    } else if (rel.startsWith('app/')) {
      const segs = rel
        .slice(4)
        .split('/')
        .slice(0, -1)
        .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
      if (segs.length === 0) {
        if (rel === 'app/layout.tsx') return [...allUrls]
        if (rel === 'app/page.tsx') addPrefix('/')
        continue
      }
      // Dynamic segments ([slug]) feed a whole section: stop at the first.
      const stable = segs.findIndex((s) => s.startsWith('['))
      const kept = stable === -1 ? segs : segs.slice(0, stable)
      if (kept.length > 0) addPrefix(`/${kept.join('/')}`)
    }
  }
  return allUrls.filter((u) => hit.has(u))
}

export function chunk<T>(items: readonly T[], size: number = BATCH_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface IndexNowPayload {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

export function buildPayload(urlList: string[]): IndexNowPayload {
  return { host: SITE_HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList }
}

export interface SubmitResult {
  ok: boolean
  submitted: number
  batches: number
  statuses: Array<number | 'error'>
}

type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number }>

/**
 * POST the URLs in batches. Never throws: a network error, timeout or bad
 * status is recorded in the result and the remaining batches still run.
 */
export async function submitUrls(
  urls: readonly string[],
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs: number = TIMEOUT_MS,
): Promise<SubmitResult> {
  const result: SubmitResult = { ok: true, submitted: 0, batches: 0, statuses: [] }
  for (const batch of chunk(urls)) {
    result.batches++
    try {
      const res = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(buildPayload(batch)),
        signal: AbortSignal.timeout(timeoutMs),
      })
      result.statuses.push(res.status)
      // 200 and 202 both mean accepted.
      if (res.status === 200 || res.status === 202) result.submitted += batch.length
      else result.ok = false
    } catch {
      result.statuses.push('error')
      result.ok = false
    }
  }
  return result
}

export function parseArgs(argv: readonly string[]): { mode: 'all' | 'changed' | null; ref: string | null; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run')
  if (argv.includes('--all')) return { mode: 'all', ref: null, dryRun }
  const i = argv.indexOf('--changed')
  if (i !== -1) {
    const ref = argv[i + 1]
    return { mode: 'changed', ref: ref && !ref.startsWith('--') ? ref : null, dryRun }
  }
  return { mode: null, ref: null, dryRun }
}

function changedFilesSince(ref: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', `${ref}`, 'HEAD', '--', 'apps/marketing/src'], {
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

async function loadSitemapUrls(): Promise<string[]> {
  // The real sitemap, so this list can never drift from what is published.
  // Needs `tsx --tsconfig apps/marketing/tsconfig.json` for its "@/" imports.
  const mod = (await import('../apps/marketing/src/app/sitemap')) as { default: () => SitemapEntryLike[] }
  return urlsFromSitemap(mod.default())
}

export async function main(argv: readonly string[]): Promise<void> {
  const { mode, ref, dryRun } = parseArgs(argv)
  if (!mode || (mode === 'changed' && !ref)) {
    console.warn('indexnow: usage: --all | --changed <git-ref> [--dry-run]; nothing submitted')
    return
  }
  const all = await loadSitemapUrls()
  const urls = mode === 'all' ? all : mapChangedFilesToUrls(changedFilesSince(ref as string), all)
  console.log(`indexnow: mode=${mode} sitemap=${all.length} to_submit=${urls.length}`)
  if (urls.length === 0 || dryRun) {
    console.log(dryRun ? 'indexnow: dry run, nothing sent' : 'indexnow: nothing to submit')
    return
  }
  const r = await submitUrls(urls)
  console.log(`indexnow: submitted=${r.submitted} batches=${r.batches} statuses=${r.statuses.join(',')}`)
  if (!r.ok) console.warn('indexnow: warning: at least one batch was not accepted (deploy unaffected)')
}

const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.warn(`indexnow: warning: ${err instanceof Error ? err.name : 'error'} (deploy unaffected)`)
  })
}
