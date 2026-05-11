import { NextResponse } from 'next/server'
import { createAdminClient, SUPABASE_URL } from '@homeowner-portal/db'

// GET /api/health — see apps/hoa/src/app/api/health/route.ts for full
// docs. Same shape, different APP_ID + scoped env-var set.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_ID = 'eviction'

async function probeDb() {
  try {
    const db = createAdminClient()
    const { error } = await db.from('orgs').select('id').limit(1)
    if (error) return { ok: false, detail: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function probeAi() {
  if (!process.env.AI_BASE_URL || !process.env.AI_API_KEY) {
    return { ok: false, detail: 'AI_BASE_URL or AI_API_KEY not set' }
  }
  try {
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

function probeEnvVars() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_BASE_URL: !!process.env.AI_BASE_URL,
    AI_API_KEY: !!process.env.AI_API_KEY,
    AI_MODEL: !!process.env.AI_MODEL,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
  }
}

export async function GET(): Promise<Response> {
  const [db, ai] = await Promise.all([probeDb(), probeAi()])
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
      probes: { db, ai },
      env,
    },
    { status: ok ? 200 : 503 },
  )
}
