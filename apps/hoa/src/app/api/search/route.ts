// GET /api/search?q=… — record search for the board ⌘K palette (BL-022).
//
// Board/admin only: the palette lives in the (dashboard) shell, and a
// resident must never find other owners' records, so a resident gets 403
// before any query runs (RC-4). The search itself uses the caller's
// RLS-bound server client — never the service role — pinned to the gate's
// org id (see lib/search/records.ts).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseQuery } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { orgTimeZone } from '@/lib/association-time-server'
import { RECORD_GROUP_LABEL, SEARCH_MAX_LENGTH, searchRecords, type SearchClient } from '@/lib/search/records'

const Query = z.object({ q: zText(SEARCH_MAX_LENGTH, 1) })

const ALL_TYPES = Object.keys(RECORD_GROUP_LABEL).length

export const GET = withRoute('search.records', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const { q } = parseQuery(new URL(request.url), Query)

  const supabase = await getSupabaseServerClient()
  // Rows are dated in the association's day (BL-043/BL-060); the zone is
  // read with the same RLS-bound client, alongside the search.
  const result = await searchRecords(supabase as unknown as SearchClient, orgId, q, {
    timeZone: orgTimeZone(supabase, orgId),
  })

  // Every type failed: that is an outage, not "no matches".
  if (result.failed.length === ALL_TYPES) throw new ApiRouteError('internal')

  return NextResponse.json(
    { query: q, groups: result.groups, failed: result.failed },
    { headers: { 'cache-control': 'private, no-store' } },
  )
})
