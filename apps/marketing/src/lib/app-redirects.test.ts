import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { APP_PATH_SEGMENTS, appRedirectTarget, type RedirectRequest } from './app-redirects'
import { appOrigin, DEFAULT_APP_ORIGIN } from './app-origin'
import { DEFAULT_SITE_ORIGIN } from './site'

const APP = 'https://www.homeownerledger.com'
const here = path.dirname(fileURLToPath(import.meta.url))
const HOA_APP_DIR = path.resolve(here, '../../../hoa/src/app')
const MARKETING_APP_DIR = path.resolve(here, '../app')

function req(pathname: string, over: Partial<RedirectRequest> = {}): RedirectRequest {
  return { pathname, search: '', host: 'www.homeownerledger.online', cookieNames: [], ...over }
}

/** URL-visible top-level segments of a Next app dir: route groups flattened,
 *  private (_x), dynamic ([x]) and non-route folders (actions) skipped. */
function routeSegments(appDir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith('_') || name.startsWith('[')) continue
    if (name.startsWith('(') && name.endsWith(')')) {
      out.push(...routeSegments(path.join(appDir, name)))
      continue
    }
    const files = readdirSync(path.join(appDir, name), { recursive: true }).map(String)
    const isRoute = files.some((f) => /(^|[/\\])(page|route)\.tsx?$/.test(f))
    if (isRoute) out.push(name)
  }
  return out
}

describe('appRedirectTarget', () => {
  it('sends an old app path to the app with path and query intact', () => {
    expect(appRedirectTarget(req('/login', { search: '?redirect=%2Fapprovals%3Ftype%3Dbill' }), APP)).toBe(
      'https://www.homeownerledger.com/login?redirect=%2Fapprovals%3Ftype%3Dbill',
    )
  })

  it('keeps a magic-link callback working (code and next params)', () => {
    expect(appRedirectTarget(req('/auth/callback', { search: '?code=abc&next=/resident' }), APP)).toBe(
      'https://www.homeownerledger.com/auth/callback?code=abc&next=/resident',
    )
  })

  it.each([
    '/resident/tickets/abc',
    '/communications/3f2b8c1e-0000-4000-8000-000000000000',
    '/rfp-bid/tok123',
    '/vendor-onboard/tok123',
    '/inspect',
    '/approvals',
    '/settings/notifications',
    '/api/health',
    '/email/v1/pool-pass-renewal.png',
    '/signup',
    '/login/',
  ])('redirects %s', (p) => {
    expect(appRedirectTarget(req(p), APP)).toBe(`${APP}${p}`)
  })

  it.each(['/', '/pricing', '/hoa', '/docs', '/demo', '/brand/logo-mark.svg', '/icon.svg', '/apple-icon.png'])(
    'leaves marketing path %s alone',
    (p) => {
      expect(appRedirectTarget(req(p), APP)).toBeNull()
    },
  )

  it('matches whole segments only, not prefixes', () => {
    expect(appRedirectTarget(req('/loginx'), APP)).toBeNull()
    expect(appRedirectTarget(req('/apis'), APP)).toBeNull()
    expect(appRedirectTarget(req('/residents'), APP)).toBeNull()
  })

  it('works on a preview host as well as www.homeownerledger.online', () => {
    expect(appRedirectTarget(req('/login', { host: 'homeownerhub-marketing.vercel.app' }), APP)).toBe(`${APP}/login`)
  })

  it('never redirects a request already on the app host (no loop)', () => {
    expect(appRedirectTarget(req('/login', { host: 'www.homeownerledger.com' }), APP)).toBeNull()
    expect(appRedirectTarget(req('/login', { host: 'WWW.HomeownerLedger.com' }), APP)).toBeNull()
    expect(appRedirectTarget(req('/login', { host: 'homeownerledger.online' }), 'https://homeownerledger.online')).toBeNull()
  })

  it('sends "/" to the app only for a browser holding an old app session cookie', () => {
    expect(appRedirectTarget(req('/', { cookieNames: ['theme'] }), APP)).toBeNull()
    expect(appRedirectTarget(req('/', { cookieNames: ['sb-xwdjsxfskvreguyvryhc-auth-token'] }), APP)).toBe(`${APP}/`)
    expect(appRedirectTarget(req('/', { cookieNames: ['sb-xwdjsxfskvreguyvryhc-auth-token.0'] }), APP)).toBe(`${APP}/`)
    // The cookie does not pull marketing pages into the app.
    expect(appRedirectTarget(req('/pricing', { cookieNames: ['sb-abc-auth-token'] }), APP)).toBeNull()
  })
})

describe('APP_PATH_SEGMENTS', () => {
  const hoa = routeSegments(HOA_APP_DIR)
  const marketing = routeSegments(MARKETING_APP_DIR)

  it('finds the app routes it is checking against (guards a vacuous pass)', () => {
    expect(hoa).toContain('login')
    expect(hoa).toContain('resident')
    expect(marketing).toContain('pricing')
  })

  it('covers every top-level route of apps/hoa (add new app routes here)', () => {
    // ui-gallery is dev-only and 404s in production.
    const missing = hoa.filter((s) => s !== 'ui-gallery' && !APP_PATH_SEGMENTS.includes(s as never))
    expect(missing).toEqual([])
  })

  it('never shadows one of the marketing site’s own routes', () => {
    const clash = marketing.filter((s) => APP_PATH_SEGMENTS.includes(s as never))
    expect(clash).toEqual([])
  })
})

describe('appOrigin', () => {
  it('uses the configured origin, dropping any path or trailing slash', () => {
    expect(appOrigin('https://www.homeownerledger.com/')).toBe(APP)
    expect(appOrigin('https://www.homeownerledger.com/login')).toBe(APP)
  })

  it('falls back to the app (www.homeownerledger.com) when unset or invalid, never to this site', () => {
    expect(appOrigin(undefined)).toBe(DEFAULT_APP_ORIGIN)
    expect(appOrigin('')).toBe(DEFAULT_APP_ORIGIN)
    expect(appOrigin('not a url')).toBe(DEFAULT_APP_ORIGIN)
    expect(DEFAULT_APP_ORIGIN).toBe(APP)
    expect(new URL(DEFAULT_APP_ORIGIN).hostname).not.toBe(new URL(DEFAULT_SITE_ORIGIN).hostname)
  })
})
