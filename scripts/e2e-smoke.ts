/**
 * scripts/e2e-smoke.ts
 *
 * End-to-end smoke harness. Verifies, against a *running* deployment
 * (or local dev server), three things per app:
 *
 *   1. /api/health returns 200 with ok=true (and db probe is ok).
 *   2. Anonymous requests to gated app pages get bounced — either a
 *      redirect to /login (3xx Location header) or, if the framework
 *      serves the redirect as a 200 with client-side meta, the body
 *      mentions sign-in. Either way it MUST NOT 500.
 *   3. Public routes that take a token in the URL reject obvious junk
 *      tokens without leaking a 500. We hit a known public token-bearing
 *      route on the HOA app; on other apps we just confirm /api/health is
 *      the only published surface.
 *
 * Usage:
 *   pnpm tsx scripts/e2e-smoke.ts                      # smoke prod
 *   HOA_URL=http://localhost:3000 \
 *   EVICTION_URL=http://localhost:3002 \
 *   PM_URL=http://localhost:3001 \
 *     pnpm tsx scripts/e2e-smoke.ts                    # smoke local
 *
 * Exit codes:
 *   0 — all green
 *   1 — at least one probe failed
 *
 * No env loading — this script is *not* supposed to need supabase keys
 * or anything secret. It only makes outbound HTTP requests.
 */

interface AppTarget {
  id: 'hoa' | 'eviction' | 'pm'
  baseUrl: string
  gatedPath: string
}

const TARGETS: AppTarget[] = [
  {
    id: 'hoa',
    baseUrl: process.env.HOA_URL ?? 'https://home-owner-hub-hoa.vercel.app',
    gatedPath: '/dashboard',
  },
  {
    id: 'eviction',
    baseUrl:
      process.env.EVICTION_URL ?? 'https://homeowner-hub-eviction.vercel.app',
    gatedPath: '/dashboard',
  },
  {
    id: 'pm',
    baseUrl: process.env.PM_URL ?? 'https://home-owner-hub-pm.vercel.app',
    gatedPath: '/dashboard',
  },
]

type ProbeStatus = 'pass' | 'fail' | 'warn'

interface ProbeRow {
  app: string
  probe: string
  status: ProbeStatus
  detail: string
}

const rows: ProbeRow[] = []

function record(row: ProbeRow): void {
  rows.push(row)
  const icon = row.status === 'pass' ? '✓' : row.status === 'warn' ? '·' : '✗'
  const tag = `[${row.app.padEnd(8)} · ${row.probe.padEnd(22)}]`
  // eslint-disable-next-line no-console
  console.log(`${icon} ${tag} ${row.detail}`)
}

async function probeHealth(t: AppTarget): Promise<void> {
  const url = `${t.baseUrl}/api/health`
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status !== 200) {
      record({
        app: t.id,
        probe: 'health 200',
        status: 'fail',
        detail: `HTTP ${res.status} from ${url}`,
      })
      return
    }
    const body = (await res.json()) as {
      ok?: boolean
      app?: string
      probes?: { db?: { ok?: boolean } }
    }
    if (body.ok !== true) {
      record({
        app: t.id,
        probe: 'health 200',
        status: 'fail',
        detail: `body.ok=${body.ok}`,
      })
      return
    }
    if (body.probes?.db?.ok !== true) {
      record({
        app: t.id,
        probe: 'health 200',
        status: 'fail',
        detail: `probes.db.ok=${body.probes?.db?.ok}`,
      })
      return
    }
    record({
      app: t.id,
      probe: 'health 200',
      status: 'pass',
      detail: `app=${body.app}`,
    })
  } catch (err) {
    record({
      app: t.id,
      probe: 'health 200',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

async function probeAuthGate(t: AppTarget): Promise<void> {
  const url = `${t.baseUrl}${t.gatedPath}`
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    // A gated route should not 500 or 200-with-data for anonymous.
    if (res.status >= 500) {
      record({
        app: t.id,
        probe: 'auth gate',
        status: 'fail',
        detail: `${t.gatedPath} returned HTTP ${res.status}`,
      })
      return
    }
    // 3xx → middleware redirect to /login (or similar). Good.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') ?? ''
      if (loc.includes('/login') || loc.includes('/auth')) {
        record({
          app: t.id,
          probe: 'auth gate',
          status: 'pass',
          detail: `→ ${loc}`,
        })
        return
      }
      record({
        app: t.id,
        probe: 'auth gate',
        status: 'warn',
        detail: `redirected to "${loc}" (expected /login or /auth)`,
      })
      return
    }
    // 200 — read the body and look for a login affordance. Some flows
    // render the login page directly with a 200 instead of redirecting.
    if (res.status === 200) {
      const body = await res.text()
      const looksLikeLogin =
        /sign\s*in|log\s*in|magic\s*link|\/login|\/auth/i.test(body)
      if (looksLikeLogin) {
        record({
          app: t.id,
          probe: 'auth gate',
          status: 'pass',
          detail: '200 with sign-in affordance',
        })
        return
      }
      record({
        app: t.id,
        probe: 'auth gate',
        status: 'fail',
        detail: '200 served gated content to anonymous request',
      })
      return
    }
    // 401/403 — also acceptable.
    if (res.status === 401 || res.status === 403) {
      record({
        app: t.id,
        probe: 'auth gate',
        status: 'pass',
        detail: `HTTP ${res.status}`,
      })
      return
    }
    record({
      app: t.id,
      probe: 'auth gate',
      status: 'warn',
      detail: `unexpected HTTP ${res.status}`,
    })
  } catch (err) {
    record({
      app: t.id,
      probe: 'auth gate',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

async function probeBogusToken(t: AppTarget): Promise<void> {
  // Hit a token-bearing public surface with junk. The HOA app has
  // /vendor-onboarding/[token] as a public route; the others don't
  // currently publish public token routes, so we just confirm an
  // arbitrary deep path doesn't 500.
  const path =
    t.id === 'hoa'
      ? '/vendor-onboarding/this-token-does-not-exist-zzzzzz'
      : '/this/path/should/not/exist/at/all'
  const url = `${t.baseUrl}${path}`
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status >= 500) {
      record({
        app: t.id,
        probe: 'bogus token / 404',
        status: 'fail',
        detail: `${path} returned HTTP ${res.status}`,
      })
      return
    }
    record({
      app: t.id,
      probe: 'bogus token / 404',
      status: 'pass',
      detail: `HTTP ${res.status} (no 5xx leak)`,
    })
  } catch (err) {
    record({
      app: t.id,
      probe: 'bogus token / 404',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('e2e smoke targets:')
  for (const t of TARGETS) {
    // eslint-disable-next-line no-console
    console.log(`  ${t.id.padEnd(8)} → ${t.baseUrl}`)
  }
  // eslint-disable-next-line no-console
  console.log('')

  for (const t of TARGETS) {
    await probeHealth(t)
    await probeAuthGate(t)
    await probeBogusToken(t)
  }

  const failed = rows.filter((r) => r.status === 'fail')
  const warned = rows.filter((r) => r.status === 'warn')

  // eslint-disable-next-line no-console
  console.log('')
  // eslint-disable-next-line no-console
  console.log(
    `Result: ${rows.length - failed.length - warned.length} pass · ${warned.length} warn · ${failed.length} fail`,
  )

  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[e2e-smoke] unexpected:', err)
  process.exit(1)
})
