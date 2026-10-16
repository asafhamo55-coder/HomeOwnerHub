import { NextResponse } from 'next/server'
import { createAdminClient, SUPABASE_URL } from '@homeowner-portal/db'
import {
  resolveModel,
  resolveFastModel,
  resolveVisionModel,
  resolveCloudModel,
} from '@homeowner-portal/ai'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireBearerSecret } from '@/lib/api/secrets'
import { errorCode } from '@/lib/api/log'

// GET /api/health
//
// Smoke-test target for the devops pipeline. Two tiers (RC-2 "public
// diagnostics", C-15):
//
//  - Public (no Authorization header): `{ ok: true, app, version }` and
//    nothing else. Only the DB probe runs (our own database, not a billed
//    call), so `ok` still means "DB reachable + required env present".
//    Unhealthy is a 503 envelope carrying only `app` and `version`:
//    `not_configured` when a required env var is unset (RC-1), else
//    `upstream_unavailable` when the DB probe fails. No probe detail, no
//    branch, no "which secret is unset".
//
//  - Details (`Authorization: Bearer <EMBEDDING_PROBE_KEY>`): every probe,
//    the resolved model ids, env-var presence and the branch.
//    `?probe=embedding` adds the billed embedding probe. Unhealthy is 503
//    `not_configured` (reason missing_env) or `upstream_unavailable` (reason
//    db_unreachable), with the details in the envelope. A wrong bearer is
//    401 and an unset key is 503, so the tier fails closed. `?key=` and
//    CRON_SECRET are no longer accepted (RC-7, R-21 / C-06).
//
// Probe `detail` strings carry HTTP status numbers, Postgres codes and
// error name/code chains only, never a DB or provider message, on either
// tier (RC-2).
//
// `version` stays public: it is how a production deploy is verified.
//
// Read by:
//  - .github/workflows/smoke.yml (curl -f, asserts ok=true)
//  - scripts/devops.sh, scripts/e2e-smoke.ts, scripts/e2e-impersonation.ts
//  - the devops subagent
//  - operators, with the bearer, when something looks wrong

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ProbeResult {
  ok: boolean
  detail?: string
}

const APP_ID = 'hoa'

async function probeDb(): Promise<ProbeResult> {
  try {
    const db = createAdminClient()
    const { error } = await db.from('orgs').select('id').limit(1)
    // Code only: a Postgres message names tables and embeds values (RC-2).
    if (error) return { ok: false, detail: `code=${errorCode(error) ?? 'none'}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: failureDetail(err) }
  }
}

async function probeAi(): Promise<ProbeResult> {
  const baseUrl = process.env.AI_BASE_URL
  const apiKey = process.env.AI_API_KEY
  if (!baseUrl || !apiKey) {
    return { ok: false, detail: 'AI_BASE_URL or AI_API_KEY not set' }
  }
  try {
    // Cheap models list call — doesn't burn quota on Groq's free tier.
    // Outbound credential, not an inbound secret compare.
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(5000),
    })
    // Status number only; statusText and the body are provider text.
    if (!res.ok) return { ok: false, detail: `status=${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: failureDetail(err) }
  }
}

/** Error name and code chain — fixed vocabularies, never a message (RC-2). */
function failureDetail(err: unknown): string {
  const chain: string[] = []
  let cur: unknown = err
  for (let depth = 0; depth < 5 && cur; depth++) {
    const name = cur instanceof Error ? cur.name : typeof cur
    const code = errorCode(cur)
    chain.push(code ? `${name}(${code})` : name)
    cur = cur && typeof cur === 'object' && 'cause' in cur ? (cur as { cause?: unknown }).cause : undefined
  }
  return `chain=${chain.join(' <- ')}`
}

/**
 * The model ids actually in effect, not merely whether a var is set.
 *
 * `AI_MODEL: true` was reported throughout the 2026-08-16-to-08-25 outage
 * while every call 404'd, because a boolean cannot distinguish "configured"
 * from "configured to something the provider retired". These are resolved
 * values, so a dead id is visible here the moment you look.
 *
 * Safe to expose: model ids are already public constants in
 * packages/ai/src/model.ts. No key or endpoint is echoed.
 */
/**
 * The model ids that will actually be used, resolved through the same
 * functions the clients call — never re-derived here.
 *
 * `cloud` is the one the daily digest and the dashboard's board insights
 * run on. It was missing until 2026-08-30, so the only model those two
 * features depend on was the one model this endpoint could not show. That
 * matters because AI_MODEL_CLOUD is a real override in this account (the
 * stale `homeowner-hub` project still carries one), so cloud can diverge
 * from `chat` without any of the other three moving.
 */
function probeModels(): Record<string, string> {
  return {
    chat: resolveModel(),
    fast: resolveFastModel(),
    cloud: resolveCloudModel(),
    vision: resolveVisionModel(),
  }
}

function probeEnvVars(): Record<string, boolean> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_BASE_URL: !!process.env.AI_BASE_URL,
    AI_API_KEY: !!process.env.AI_API_KEY,
    AI_MODEL: !!process.env.AI_MODEL,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    INNGEST_EVENT_KEY: !!process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: !!process.env.INNGEST_SIGNING_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    // Reported because its absence is invisible until someone opens the
    // composer: emailAssetUrl throws rather than defaulting (deliberately —
    // sent mail needs a permanent origin, not a preview host), so a missing
    // value surfaces as a runtime error in the section renderer rather than
    // at boot. It was in fact missing in production when the section
    // toggles shipped, and this line is how that becomes visible next time.
    EMAIL_ASSET_BASE_URL: !!process.env.EMAIL_ASSET_BASE_URL,
    EMBEDDING_PROBE_KEY: !!process.env.EMBEDDING_PROBE_KEY,
    EMBEDDING_BASE_URL_SET_BUT_EMPTY:
      process.env.EMBEDDING_BASE_URL !== undefined && process.env.EMBEDDING_BASE_URL.trim() === '',
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
  }
}

/**
 * Opt-in probe for the embedding provider, behind `?probe=embedding` on
 * the bearer-authenticated details tier only.
 *
 * Not run by default, and deliberately so: embedding calls are billed per
 * token, and this endpoint is polled by CI smoke tests and by anyone
 * watching a deploy. A probe that costs money on every poll is a probe
 * someone eventually removes.
 *
 * It exists because the failure it diagnoses is otherwise invisible from
 * outside. mailboxReplyEmbeddingsJob sanitises its errors down to the
 * class name — correctly, since the provider echoes fragments of the
 * request body and that body is a resident's correspondence — so a
 * persistent failure shows up in Inngest as the bare word "EmbeddingError"
 * and nowhere else. The reply corpus then stays empty with no way to tell
 * whether the token is wrong, the model is gone, or it is rate limited.
 *
 * The input is a fixed literal, so nothing resident-derived is ever sent.
 * Only the HTTP status and the error name/code chain are reported back,
 * all drawn from fixed sets, which cannot carry PII.
 */
async function probeEmbedding(): Promise<ProbeResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, detail: 'OPENAI_API_KEY not set' }
  }
  try {
    const { embedTexts } = await import('@homeowner-portal/ai')
    const [vector] = await embedTexts(['healthcheck'])
    if (!vector) return { ok: false, detail: 'provider returned no vector' }
    // The dimension is pinned by the inbox_reply_embeddings column. A
    // provider silently serving a different model would fail at insert
    // time instead of here, which is a far worse place to find out.
    return { ok: true, detail: `dim=${vector.length}` }
  } catch (err) {
    // HTTP status plus the name/code chain. The provider client wraps a
    // network failure twice (retry-exhausted -> network error -> the
    // underlying fetch rejection), so the Node code that names the real
    // fault (ENOTFOUND, ECONNREFUSED, CERT_HAS_EXPIRED, an AbortError from
    // our own timeout) sits two or three levels down.
    //
    // Never the provider's message. It used to be appended here on the
    // argument that the fixed 'healthcheck' input cannot echo resident
    // data, but RC-2 keeps raw provider text out of every response, and an
    // error page or account detail is still provider text.
    const status =
      err && typeof err === 'object' && 'status' in err
        ? (err as { status?: number }).status
        : undefined
    return { ok: false, detail: `status=${status ?? 'none'} ${failureDetail(err)}` }
  }
}

function requiredEnvPresent(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

/**
 * The details tier's own secret (RC-7: one env var per purpose). It already
 * exists in production for exactly this diagnostic; CRON_SECRET is no longer
 * accepted here (R-21 / C-06).
 */
const DETAILS_SECRET_ENV = 'EMBEDDING_PROBE_KEY'

export const GET = withRoute('health.get', async (request: Request) => {
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'

  // Public tier: no Authorization header at all. Only our own DB is probed,
  // so an unauthenticated poll makes no outbound or billed call.
  if (!request.headers.has('authorization')) {
    // RC-1: a missing required env var is 503 `not_configured`. Checked
    // before the DB probe (which cannot succeed without it). The envelope
    // carries only `app` and `version`, never which variable is unset (RC-2).
    if (!requiredEnvPresent()) {
      throw new ApiRouteError('not_configured', 'Health check failed: required configuration is missing.', {
        app: APP_ID,
        version,
      })
    }
    const db = await probeDb()
    // Config present but our DB is not reachable: 503 `upstream_unavailable`,
    // again with no probe detail on the public tier.
    if (!db.ok) {
      throw new ApiRouteError('upstream_unavailable', 'Health check failed.', { app: APP_ID, version })
    }
    return NextResponse.json({ ok: true, app: APP_ID, version })
  }

  // Details tier: any Authorization header opts in and must then be right.
  // Timing-safe; 401 on a mismatch, 503 when the key is unset (fails closed).
  requireBearerSecret(request, DETAILS_SECRET_ENV)

  // The embedding probe is billed per token, so it runs only on request.
  const wantEmbedding = new URL(request.url).searchParams.get('probe') === 'embedding'
  const [db, ai, embedding] = await Promise.all([
    probeDb(),
    probeAi(),
    wantEmbedding ? probeEmbedding() : Promise.resolve(null),
  ])
  const details = {
    app: APP_ID,
    timestamp: new Date().toISOString(),
    version,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'local',
    supabaseUrl: SUPABASE_URL,
    probes: embedding ? { db, ai, embedding } : { db, ai },
    models: probeModels(),
    // Keyed by env-var NAME, verbatim (so not camelCased), presence only.
    env: probeEnvVars(),
  }

  // RC-1: an unset required env var is 503 `not_configured`; checked first
  // because without it the DB probe fails too. A reachable-config DB failure
  // is 503 `upstream_unavailable`. Nothing to hide on this authenticated tier.
  if (!requiredEnvPresent()) {
    throw new ApiRouteError('not_configured', 'Health check failed: required configuration is missing.', {
      reason: 'missing_env',
      ...details,
    })
  }
  if (!db.ok) {
    throw new ApiRouteError('upstream_unavailable', 'Health check failed.', {
      reason: 'db_unreachable',
      ...details,
    })
  }
  return NextResponse.json({ ok: true, ...details })
})
