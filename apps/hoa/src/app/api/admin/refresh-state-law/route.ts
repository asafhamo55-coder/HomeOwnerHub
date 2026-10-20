import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '@homeowner-portal/jobs'
import { SOURCE_STATES } from '@homeowner-portal/workflows/state-law-sources'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRoutePlatformAdmin } from '@/lib/api/auth'
import { parseJson, parseQuery } from '@/lib/api/parse'
import { logRouteFailure } from '@/lib/api/log'

/**
 * GET  /api/admin/refresh-state-law?state=FL&limit=50&offset=0 → freshness report (one page)
 * POST /api/admin/refresh-state-law  { "state": "FL" }         → run the refresh job now
 *
 * Platform staff only (requireRoutePlatformAdmin) — the service-role client
 * below is used only after that gate (RC-4).
 *
 * POST sends `law/refresh.requested`, which triggers the same Inngest job
 * as the weekly cron (packages/jobs/src/state-law-refresh.ts): fetch the
 * official source, diff by content_hash, write changes, emit
 * law/statute.changed. Only states with a source adapter are refreshable:
 * FL (flsenate.gov ch. 720), CA (leginfo bulk data, Civ. Code
 * §§ 4000–6150), TX (Tex. Prop. Code ch. 202 and 209) and GA (a vetted
 * snapshot of O.C.G.A. §§ 44-3-220 to 44-3-235 — Georgia has no fetchable
 * official text). The 422 below stays for any state added to SUPPORTED
 * before it has an adapter. Staleness keys off last_checked_at ("when we
 * last looked"), not fetched_at ("when the text last changed").
 *
 * GET paginates explicitly (RC-9): `limit` defaults to and is capped at
 * 100, `offset` is validated, and `total` / `staleCount` come from
 * count-only queries over the whole state, never from the page's length.
 */

const SUPPORTED = ['GA', 'FL', 'CA', 'TX'] as const
/** States with a source adapter (SOURCE_STATES in
 *  packages/workflows/src/W30-state-law-brain/sources/index.ts). */
const REFRESHABLE = new Set<string>(SOURCE_STATES)

/** A row is stale once it is more than 30 whole days since we last looked. */
const STALE_AFTER_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const PAGE_LIMIT_MAX = 100
const OFFSET_MAX = 1_000_000

/**
 * Size caps (RC-8). Each string bound equals the cap on the bytes that carry
 * it, so an over-long value can only arrive in an over-size request — which
 * is answered 413 payload_too_large before the schema runs, never 400.
 */
const MAX_QUERY_BYTES = 1024
const MAX_BODY_BYTES = 1024

const zState = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim().toUpperCase())
    .refine((s): s is (typeof SUPPORTED)[number] => (SUPPORTED as readonly string[]).includes(s), {
      message: `Use one of ${SUPPORTED.join(', ')}.`,
    })

const Query = z.object({
  state: zState(MAX_QUERY_BYTES),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_MAX),
  offset: z.coerce.number().int().min(0).max(OFFSET_MAX).default(0),
})

const Body = z.object({ state: zState(MAX_BODY_BYTES) })

const COLUMNS =
  'id, code_citation, title, category, fetched_at, last_checked_at, content_hash, source_name, source_url, superseded_at'

interface StatuteRow {
  id: string
  code_citation: string
  title: string
  category: string | null
  fetched_at: string | null
  last_checked_at: string | null
  content_hash: string | null
  source_name: string | null
  source_url: string | null
  superseded_at: string | null
}

function checkQuerySize(url: URL): void {
  if (new TextEncoder().encode(url.search).byteLength > MAX_QUERY_BYTES) {
    throw new ApiRouteError('payload_too_large', 'The query string is too long.', { maxBytes: MAX_QUERY_BYTES })
  }
}

const iso = (ts: string | null): string | null => (ts ? new Date(ts).toISOString() : null)

export const GET = withRoute('admin.refresh-state-law.report', async (request) => {
  const { userId } = await requireRoutePlatformAdmin()
  const url = new URL(request.url)
  checkQuerySize(url)
  const { state, limit, offset } = parseQuery(url, Query)

  const db = createAdminClient()
  const now = Date.now()
  // Same boundary as the per-row flag: floor(ageDays) > 30 ⇔ age ≥ 31 days.
  const staleCutoff = new Date(now - (STALE_AFTER_DAYS + 1) * DAY_MS).toISOString()

  const [totalRes, staleRes, pageRes] = await Promise.all([
    db.from('state_statutes').select('id', { count: 'exact', head: true }).eq('state', state),
    db
      .from('state_statutes')
      .select('id', { count: 'exact', head: true })
      .eq('state', state)
      .or(`last_checked_at.is.null,last_checked_at.lte.${staleCutoff}`),
    db
      .from('state_statutes')
      .select(COLUMNS)
      .eq('state', state)
      .order('code_citation')
      .order('id')
      .range(offset, offset + limit - 1),
  ])

  for (const [where, res] of [
    ['state_statutes.count', totalRes],
    ['state_statutes.stale_count', staleRes],
    ['state_statutes.page', pageRes],
  ] as const) {
    if (res.error) {
      logRouteFailure(`admin.refresh-state-law.${where}`, res.error, { userId, offset, limit })
      throw new ApiRouteError('internal')
    }
  }
  if (totalRes.count === null || staleRes.count === null) {
    logRouteFailure('admin.refresh-state-law.count_missing', null, { userId })
    throw new ApiRouteError('internal')
  }

  const rows = (pageRes.data ?? []) as StatuteRow[]
  const statutes = rows.map((r) => {
    const ageDays = r.last_checked_at ? Math.floor((now - new Date(r.last_checked_at).getTime()) / DAY_MS) : null
    return {
      id: r.id,
      codeCitation: r.code_citation,
      title: r.title,
      category: r.category,
      fetchedAt: iso(r.fetched_at),
      lastCheckedAt: iso(r.last_checked_at),
      contentHash: r.content_hash,
      sourceName: r.source_name,
      sourceUrl: r.source_url,
      supersededAt: iso(r.superseded_at),
      ageDays,
      stale: ageDays === null || ageDays > STALE_AFTER_DAYS,
    }
  })

  const total = totalRes.count
  const nextOffset = offset + statutes.length < total && statutes.length > 0 ? offset + statutes.length : null

  return NextResponse.json({
    state,
    total,
    staleCount: staleRes.count,
    refreshable: REFRESHABLE.has(state),
    limit,
    offset,
    nextOffset,
    statutes,
  })
})

export const POST = withRoute('admin.refresh-state-law.run', async (request) => {
  const { userId } = await requireRoutePlatformAdmin()
  const { state } = await parseJson(request, Body, { maxBytes: MAX_BODY_BYTES })

  if (!REFRESHABLE.has(state)) {
    throw new ApiRouteError('unprocessable', `${state} has no official source to refresh from yet.`, {
      reason: 'no_official_source',
      refreshable: [...REFRESHABLE],
    })
  }

  try {
    await inngest.send({ name: 'law/refresh.requested', data: { state } })
  } catch (err) {
    logRouteFailure('admin.refresh-state-law.inngest_send', err, { userId })
    throw new ApiRouteError('upstream_unavailable', 'The refresh job could not be queued. Try again shortly.')
  }

  return NextResponse.json({ state, queued: 'law/refresh.requested' }, { status: 202 })
})
