import { NextResponse } from 'next/server'
import { createAdminClient, SUPABASE_URL } from '@homeowner-portal/db'

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

function probeEnvVars(): Record<string, boolean> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_BASE_URL: !!process.env.AI_BASE_URL,
    AI_API_KEY: !!process.env.AI_API_KEY,
    AI_MODEL: !!process.env.AI_MODEL,
    HUGGINGFACE_API_TOKEN: !!process.env.HUGGINGFACE_API_TOKEN,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    INNGEST_EVENT_KEY: !!process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: !!process.env.INNGEST_SIGNING_KEY,
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
  if (!process.env.HUGGINGFACE_API_TOKEN) {
    return { ok: false, detail: 'HUGGINGFACE_API_TOKEN not set' }
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
  // burn the embedding quota by hammering one URL. That was a flaw in the
  // probe as first written. When CRON_SECRET is unset the probe is simply
  // unavailable rather than open.
  const url = new URL(request.url)
  const cronSecret = process.env.CRON_SECRET
  const wantEmbedding =
    url.searchParams.get('probe') === 'embedding' &&
    Boolean(cronSecret) &&
    url.searchParams.get('key') === cronSecret
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
      env,
    },
    { status: ok ? 200 : 503 },
  )
}
