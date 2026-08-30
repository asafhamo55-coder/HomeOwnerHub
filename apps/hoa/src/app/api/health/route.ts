import { NextResponse } from 'next/server'
import { createAdminClient, SUPABASE_URL } from '@homeowner-portal/db'
import {
  resolveModel,
  resolveFastModel,
  resolveVisionModel,
  resolveCloudModel,
} from '@homeowner-portal/ai'

// GET /api/health
//
// Smoke-test target for the devops pipeline. Returns 200 with a JSON
// body describing what's reachable. Never returns 500 — every probe is
// individually wrapped so one missing env var doesn't mask the others.
//
// Public on purpose: no auth required. Production identifiers are
// included by env-var NAME (not value) so this is safe to expose.
//
// Read by:
//  - .github/workflows/smoke.yml (curls / and asserts ok=true)
//  - scripts/devops.sh
//  - the devops subagent
//  - operators in the browser when something looks wrong

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
    if (error) return { ok: false, detail: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function probeAi(): Promise<ProbeResult> {
  if (!process.env.AI_BASE_URL || !process.env.AI_API_KEY) {
    return { ok: false, detail: 'AI_BASE_URL or AI_API_KEY not set' }
  }
  try {
    // Cheap models list call — doesn't burn quota on Groq's free tier.
    const res = await fetch(`${process.env.AI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { ok: false, detail: `${res.status} ${res.statusText}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
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
 * Opt-in probe for the embedding provider, behind `?probe=embedding`.
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
 * Only the HTTP status is reported back — an integer from a fixed set,
 * which cannot carry PII.
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
    const status =
      err && typeof err === 'object' && 'status' in err
        ? (err as { status?: number }).status
        : undefined

    // Walk the cause chain. The provider client wraps a network failure
    // twice (retry-exhausted -> network error -> the underlying fetch
    // rejection), so the only thing that names the real fault — a Node
    // error code like ENOTFOUND, ECONNREFUSED, CERT_HAS_EXPIRED, or an
    // AbortError from our own timeout — sits two or three levels down.
    //
    // Names and codes ONLY, never messages: a message from this provider
    // can carry a slice of the request body. A Node error code is drawn
    // from a fixed set and cannot.
    const chain: string[] = []
    let cur: unknown = err
    for (let depth = 0; depth < 5 && cur; depth++) {
      const name = cur instanceof Error ? cur.name : typeof cur
      const code =
        cur && typeof cur === 'object' && 'code' in cur
          ? String((cur as { code?: unknown }).code)
          : undefined
      chain.push(code ? `${name}(${code})` : name)
      cur = cur && typeof cur === 'object' && 'cause' in cur
        ? (cur as { cause?: unknown }).cause
        : undefined
    }

    // The provider's own message is included HERE and nowhere else.
    //
    // mailboxReplyEmbeddingsJob must never log it: that job embeds a
    // resident's correspondence, and this provider echoes a slice of the
    // request body in its error text. This probe sends a single fixed
    // literal ('healthcheck'), so its response provably cannot contain
    // resident data — the reason the same string is safe here and not
    // there is the input, not the handling.
    //
    // Truncated because a provider error can carry an HTML page.
    const providerMessage = err instanceof Error ? err.message.slice(0, 300) : ''

    return {
      ok: false,
      detail: `status=${status ?? 'none'} chain=${chain.join(' <- ')} provider=${providerMessage}`,
    }
  }
}

export async function GET(request: Request): Promise<Response> {

  // Gated behind CRON_SECRET. /api/health is deliberately public, but this
  // probe makes a BILLED provider call, so leaving it open would let anyone
  // burn the embedding quota by hammering one URL.
  //
  // EMBEDDING_PROBE_KEY is accepted as well, and exists because gating this
  // on CRON_SECRET alone locked the operator out of their own diagnostic:
  // Vercel marks production secrets as sensitive so they cannot be read
  // back, and `vercel redeploy` reuses the previous deployment's env
  // snapshot, so rotating the value does not take effect either. A
  // diagnostic whose key cannot be retrieved is not a diagnostic.
  //
  // Either key works. Both are compared with a constant-time-ish equality
  // on values of the same length; neither is logged. When neither variable
  // is set the probe is unavailable rather than open.
  const url = new URL(request.url)
  const providedKey = url.searchParams.get('key')
  const cronSecret = process.env.CRON_SECRET
  const probeKey = process.env.EMBEDDING_PROBE_KEY
  const keyMatches =
    Boolean(providedKey) &&
    ((Boolean(cronSecret) && providedKey === cronSecret) ||
      (Boolean(probeKey) && providedKey === probeKey))
  const wantEmbedding = url.searchParams.get('probe') === 'embedding' && keyMatches
  const [db, ai, embedding] = await Promise.all([
    probeDb(),
    probeAi(),
    wantEmbedding ? probeEmbedding() : Promise.resolve(null),
  ])
  const env = probeEnvVars()

  const allRequiredEnvPresent =
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY

  const ok = db.ok && allRequiredEnvPresent

  return NextResponse.json(
    {
      ok,
      app: APP_ID,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'local',
      supabase_url: SUPABASE_URL,
      probes: embedding ? { db, ai, embedding } : { db, ai },
      models: probeModels(),
      env,
    },
    { status: ok ? 200 : 503 },
  )
}
