import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * API route conventions ratchet — the mechanically checkable half of
 * .claude/skills/api-route-conventions/SKILL.md (RC-1..RC-12).
 *
 * Statically scans every apps/hoa/src/app/api/**\/route.ts (comments
 * stripped, so prose may mention the patterns) for:
 *
 *   with-route     every exported method handler is `withRoute(...)`         (RC-10)
 *   api-error      no hand-picked 4xx/5xx status, no `{ error: ... }` body   (RC-1)
 *                  built by hand — non-2xx goes through apiError / ApiRouteError
 *   error-message  no `err.message` / `error.message` / `e.message`          (RC-2)
 *   raw-zod        no ZodError internals (`.error.issues` / `.flatten()` …)  (RC-2)
 *   query-secret   no `searchParams.get('key')`-style secrets                (RC-7)
 *   secret-header  no hand-read Authorization / x-*-key header or           (RC-7)
 *                  `Bearer ${…}` compare — use lib/api/secrets.ts
 *
 * The ALLOWLIST is SHRINK-ONLY: it lists every route that violated a rule
 * when the ratchet landed. Fix a route → delete ITS line. A listed rule that
 * no longer fires fails the suite, so the list cannot go stale; a route not
 * listed may not start violating. Never add a line.
 *
 * One line per route, separated by blank lines, so parallel per-route
 * fixes each delete a different hunk and merge without conflicts. Delete
 * only your line; leave the blank separators.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const API_DIR = path.join(here, 'app/api')

type Rule = 'with-route' | 'api-error' | 'error-message' | 'raw-zod' | 'query-secret' | 'secret-header'

/** Permanent, reasoned exemptions. Not a backlog — a route lands here only when the rule cannot apply. */
const EXEMPT: Record<string, Partial<Record<Rule, string>>> = {
  'inngest/route.ts': { 'with-route': 'Inngest SDK serve() owns GET/POST/PUT, its signing and its responses.' },
  'cron/sentry-test/route.ts': {
    'with-route': 'Deliberately throws so the error reaches onRequestError → Sentry; withRoute would swallow it.',
  },
}

/** route (relative to app/api) → rules it still violates. SHRINK-ONLY. */
const ALLOWLIST: Record<string, Rule[]> = {
  'accounting/board-packet/[periodId]/route.ts': ['with-route', 'api-error'],

  'admin/refresh-state-law/route.ts': ['with-route', 'api-error', 'error-message'],

  'admin/setup-stripe-pricing/route.ts': ['with-route', 'api-error', 'secret-header'],

  'ai/analyze-violation/route.ts': ['with-route', 'api-error', 'raw-zod'],

  'ai/ask-community/route.ts': ['with-route', 'api-error', 'error-message', 'raw-zod'],

  'ai/ask-docs/route.ts': ['with-route', 'api-error', 'error-message', 'raw-zod'],

  'ai/daily-digest/route.ts': ['with-route', 'api-error', 'error-message'],


  'ai/parse-document/route.ts': ['with-route', 'api-error', 'raw-zod'],

  'ai/rewrite/route.ts': ['with-route', 'api-error', 'error-message', 'raw-zod'],

  'ai/suggest-fields/route.ts': ['with-route', 'api-error', 'raw-zod'],

  'ai/violations/draft/route.ts': ['with-route', 'api-error', 'error-message', 'raw-zod'],

  'cron/recurring-events/route.ts': ['with-route', 'api-error', 'error-message', 'query-secret', 'secret-header'],

  'cron/sentry-test/route.ts': ['api-error', 'secret-header'],

  'governing-docs/upload/route.ts': ['with-route', 'api-error', 'error-message'],

  'health/route.ts': ['with-route', 'error-message', 'query-secret', 'secret-header'],

  'oauth/google/callback/route.ts': ['with-route', 'error-message'],

  'oauth/google/start/route.ts': ['with-route', 'error-message'],

  'plaid/exchange/route.ts': ['with-route', 'api-error', 'error-message', 'raw-zod'],

  'plaid/link-token/route.ts': ['with-route', 'api-error', 'error-message'],

  'rfp-bid/[token]/submit/route.ts': ['with-route', 'api-error', 'error-message'],

  'settings/data-export/route.ts': ['with-route', 'api-error'],

  'vendor-onboard/[token]/submit/route.ts': ['with-route', 'api-error', 'error-message'],

  'vendors/[id]/documents/route.ts': ['with-route', 'api-error', 'error-message'],

  'violations/photo/route.ts': ['with-route', 'api-error', 'error-message'],

  'webhooks/plaid/route.ts': ['with-route', 'api-error', 'error-message', 'raw-zod', 'secret-header'],

  'webhooks/resend/route.ts': ['with-route', 'api-error'],

  'webhooks/stripe/route.ts': ['with-route', 'api-error'],
}

const METHODS = 'GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS'

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}

export function violations(src: string): Rule[] {
  const code = stripComments(src)
  const out: Rule[] = []

  const fnExport = new RegExp(`export\\s+(?:async\\s+)?function\\s+(?:${METHODS})\\b`)
  const constExports = [...code.matchAll(new RegExp(`export\\s+const\\s+(?:${METHODS})\\s*=\\s*([\\w.]+)`, 'g'))]
  const aliasExport = new RegExp(`export\\s*\\{[^}]*\\bas\\s+(?:${METHODS})\\b`)
  const destructured = new RegExp(`export\\s+const\\s*\\{[^}]*\\b(?:${METHODS})\\b`)
  if (
    fnExport.test(code) ||
    aliasExport.test(code) ||
    destructured.test(code) ||
    constExports.some((m) => m[1] !== 'withRoute')
  ) {
    out.push('with-route')
  }

  if (
    /\bstatus\s*:\s*[45]\d\d\b/.test(code) ||
    /\b(?:NextResponse|Response)\.json\(\s*\{\s*(?:ok\s*:\s*false\s*,\s*)?error\s*:/.test(code)
  ) {
    out.push('api-error')
  }

  if (/\b(?:e|\w*[eE]rr(?:or)?\w*)\??\.message\b/.test(code)) out.push('error-message')

  if (/\.(?:error|err)\??\.(?:issues|errors|flatten|format)\b|\bZodError\b/.test(code)) out.push('raw-zod')

  if (/searchParams\.get\(\s*['"`](?:key|secret|token|api_?key|apikey|password)['"`]/i.test(code)) {
    out.push('query-secret')
  }

  if (
    /\.headers\.get\(\s*['"`](?:authorization|x-[\w-]*(?:key|secret|token))['"`]\s*\)/i.test(code) ||
    /`Bearer \$\{/.test(code)
  ) {
    out.push('secret-header')
  }

  return out
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name === 'route.ts') out.push(full)
  }
  return out
}

describe('API route conventions ratchet', () => {
  const routes = walk(API_DIR).map((f) => ({
    rel: path.relative(API_DIR, f).split(path.sep).join('/'),
    src: readFileSync(f, 'utf8'),
  }))
  const found = (rel: string) => routes.find((r) => r.rel === rel)
  const effective = (r: { rel: string; src: string }) =>
    violations(r.src).filter((rule) => !EXEMPT[r.rel]?.[rule])

  it('scans every route file (the walk is not silently empty)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(29)
  })

  it('no route violates a rule it is not allowlisted for', () => {
    const offenders = routes
      .map((r) => ({ route: r.rel, rules: effective(r).filter((rule) => !ALLOWLIST[r.rel]?.includes(rule)) }))
      .filter((o) => o.rules.length > 0)
    expect(offenders, 'fix the route per .claude/skills/api-route-conventions/SKILL.md').toEqual([])
  })

  it('allowlist only shrinks: every listed rule still fires (delete the line once fixed)', () => {
    const stale = Object.entries(ALLOWLIST).flatMap(([rel, rules]) => {
      const r = found(rel)
      if (!r) return [{ route: rel, rules: ['<file gone>'] }]
      const still = effective(r)
      const gone = rules.filter((rule) => !still.includes(rule))
      return gone.length ? [{ route: rel, rules: gone }] : []
    })
    expect(stale).toEqual([])
  })

  it('exemptions point at real files', () => {
    expect(Object.keys(EXEMPT).filter((rel) => !found(rel))).toEqual([])
  })
})

describe('detector', () => {
  it('with-route', () => {
    expect(violations('export async function POST(req: Request) {}')).toContain('with-route')
    expect(violations('export function GET() {}')).toContain('with-route')
    expect(violations('export const GET = handler')).toContain('with-route')
    expect(violations('export { handler as POST }')).toContain('with-route')
    expect(violations("export const POST = withRoute('x', async () => new Response())")).not.toContain('with-route')
    expect(violations("export const dynamic = 'force-dynamic'")).not.toContain('with-route')
  })

  it('api-error', () => {
    expect(violations("NextResponse.json({ error: 'no_org' }, { status: 403 })")).toContain('api-error')
    expect(violations("NextResponse.json({ ok: false, error: 'x' })")).toContain('api-error')
    expect(violations('new Response(null, { status: 500 })')).toContain('api-error')
    expect(violations("return apiError('forbidden')")).not.toContain('api-error')
    expect(violations('NextResponse.json({ ok: true }, { status: 201 })')).not.toContain('api-error')
  })

  it('error-message', () => {
    for (const s of ['err.message', 'error.message', 'e.message', 'uploadError.message', 'piErr.message', 'insertError?.message']) {
      expect(violations(s), s).toContain('error-message')
    }
    expect(violations("apiError('internal')")).not.toContain('error-message')
    expect(violations('// never return err.message')).not.toContain('error-message')
  })

  it('raw-zod', () => {
    expect(violations('parsed.error.issues')).toContain('raw-zod')
    expect(violations('parsed.error.flatten()')).toContain('raw-zod')
    expect(violations('if (e instanceof ZodError)')).toContain('raw-zod')
    expect(violations('await parseJson(request, Schema)')).not.toContain('raw-zod')
  })

  it('query-secret', () => {
    expect(violations("url.searchParams.get('key')")).toContain('query-secret')
    expect(violations('request.nextUrl.searchParams.get("token")')).toContain('query-secret')
    expect(violations("url.searchParams.get('state')")).not.toContain('query-secret')
  })

  it('secret-header', () => {
    expect(violations("request.headers.get('authorization') !== x")).toContain('secret-header')
    expect(violations("request.headers.get('x-ingest-key')")).toContain('secret-header')
    expect(violations('h === `Bearer ${secret}`')).toContain('secret-header')
    expect(violations("request.headers.get('stripe-signature')")).not.toContain('secret-header')
    expect(violations("requireBearerSecret(request, 'CRON_SECRET')")).not.toContain('secret-header')
  })
})
