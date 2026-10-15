import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '@homeowner-portal/jobs'
import { isPlatformAdmin } from '@/lib/platform-admin'

/**
 * GET  /api/admin/refresh-state-law?state=FL  → freshness report
 * POST /api/admin/refresh-state-law           → run the refresh job now
 *
 * POST sends `law/refresh.requested`, which triggers the same Inngest job
 * as the weekly cron (packages/jobs/src/state-law-refresh.ts): fetch the
 * official source, diff by content_hash, write changes, emit
 * law/statute.changed. Only states with an official-source adapter are
 * refreshable (today: FL). Staleness keys off last_checked_at ("when we
 * last looked"), not fetched_at ("when the text last changed").
 */

const SUPPORTED = new Set(['GA', 'FL', 'CA', 'TX'])
/** States with an official-source adapter (SOURCE_STATES in
 *  packages/workflows/src/W30-state-law-brain/sources/index.ts). */
const REFRESHABLE = new Set(['FL'])

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
    .select('code_citation, title, category, fetched_at, last_checked_at, content_hash, source_name, source_url, superseded_at')
    .eq('state', state)
    .order('code_citation')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    code_citation: string
    title: string
    category: string | null
    fetched_at: string | null
    last_checked_at: string | null
    content_hash: string | null
    source_name: string | null
    source_url: string | null
    superseded_at: string | null
  }>

  const now = Date.now()
  const enriched = rows.map((r) => {
    const ageDays = r.last_checked_at
      ? Math.floor((now - new Date(r.last_checked_at).getTime()) / (24 * 60 * 60 * 1000))
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
    refreshable: REFRESHABLE.has(state),
    statutes: enriched,
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

  if (!REFRESHABLE.has(state)) {
    return NextResponse.json(
      { error: 'no_official_source', refreshable: [...REFRESHABLE] },
      { status: 400 },
    )
  }

  await inngest.send({ name: 'law/refresh.requested', data: { state } })

  return NextResponse.json({ ok: true, state, queued: 'law/refresh.requested' })
}
