import { NextResponse } from 'next/server'
import { createAdminClient, SUPABASE_URL } from '@homeowner-portal/db'

// GET /api/health — see apps/hoa/src/app/api/health/route.ts for full
// docs. PM has no AI dependency in Phase 1 so the AI probe is skipped.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_ID = 'pm'

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

function probeEnvVars() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
  }
}

export async function GET(): Promise<Response> {
  const db = await probeDb()
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
      probes: { db },
      env,
    },
    { status: ok ? 200 : 503 },
  )
}
