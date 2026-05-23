import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { isPlatformAdmin } from '@/lib/platform-admin'

/**
 * GET  /api/admin/refresh-state-law?state=GA  → freshness report
 * POST /api/admin/refresh-state-law           → emit refresh-requested
 *                                                event (audit row)
 *
 * Honest caveat — this endpoint does NOT actually scrape. Playwright +
 * Chromium are too heavy for Vercel serverless functions (250MB unzipped
 * limit, 60s timeout). Instead this returns the current freshness state
 * and emits an audit event the platform admin can react to by running
 * `pnpm scrape:state-law <STATE> --apply` from a host that has Chromium
 * installed. If you later wire a GitHub Action / Browserless worker,
 * have that worker poll for unfulfilled `state_law.refresh_requested`
 * audit rows.
 */

const SUPPORTED = new Set(['GA', 'FL', 'CA', 'TX'])

export async function GET(request: Request): Promise<Response> {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const state = (searchParams.get('state') ?? '').toUpperCase()
  if (!SUPPORTED.has(state)) {
    return NextResponse.json(
      { error: 'unsupported_state', supported: [...SUPPORTED] },
      { status: 400 },
    )
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('state_statutes')
    .select('code_citation, title, category, fetched_at, source_url, superseded_at')
    .eq('state', state)
    .order('code_citation')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    code_citation: string
    title: string
    category: string
    fetched_at: string | null
    source_url: string | null
    superseded_at: string | null
  }>

  const now = Date.now()
  const enriched = rows.map((r) => {
    const ageDays = r.fetched_at
      ? Math.floor((now - new Date(r.fetched_at).getTime()) / (24 * 60 * 60 * 1000))
      : null
    return {
      ...r,
      age_days: ageDays,
      stale: ageDays === null || ageDays > 30,
    }
  })

  const staleCount = enriched.filter((r) => r.stale).length

  return NextResponse.json({
    state,
    total: enriched.length,
    stale_count: staleCount,
    statutes: enriched,
    refresh_command: `pnpm scrape:state-law ${state} --apply`,
  })
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: { state?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* allow empty body */
  }
  const state = (body.state ?? '').toUpperCase()
  if (!SUPPORTED.has(state)) {
    return NextResponse.json(
      { error: 'unsupported_state', supported: [...SUPPORTED] },
      { status: 400 },
    )
  }

  const db = createAdminClient()
  await db
    .from('platform_admin_audit' as never)
    .insert({
      action: 'state_law.refresh_requested',
      target_org_id: null,
      payload: { state, requested_at: new Date().toISOString() },
    } as never)

  return NextResponse.json({
    ok: true,
    state,
    next_step: `Run \`pnpm scrape:state-law ${state} --apply\` from a host with Playwright installed. The Vercel runtime cannot execute Chromium.`,
  })
}
