import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { csvDocument } from '@/lib/csv'
import { readPropertyRows, type PropertyRecordRow } from '@/lib/properties/list'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import { matchesFilter, sortPropertyRows } from '@/lib/properties/list-view'

// CSV export of the properties list, scoped to the current user's org
// via RLS (the server client carries their session; the list view is
// board/admin only). Honors `?filter=` (every list filter) and `?q=` so
// the file matches what the user sees on the page.

type Tenure = 'owner_occupied' | 'leased' | 'unknown'

const TENURE_LABEL: Record<Tenure, string> = {
  owner_occupied: 'Owner-occupied',
  leased: 'Leased',
  unknown: 'Unknown',
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  // `?tenure=` is the old spelling (links and bookmarks made before the
  // export learned every filter); `?filter=` wins when both are present.
  const params = parsePropertyListParams({
    filter: url.searchParams.get('filter') ?? url.searchParams.get('tenure') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  })

  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  // The same read, filter and order as the list pane (BL-053 paging is
  // inside readPropertyRows), so the file is exactly the view on screen,
  // every page of it. A failed page fails the export; never a short file.
  let rows: PropertyRecordRow[]
  try {
    const all = await readPropertyRows(supabase, org.id, params.search, { recordFields: true })
    rows = sortPropertyRows(
      all.filter((r) => matchesFilter(r, params.filter)),
      'address',
    )
  } catch {
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const header = [
    'Address',
    'Unit',
    'Owner name',
    'Owner email',
    'Owner phone',
    'Tenure',
    'Notes',
    'Added',
    'Updated',
  ]
  const body = csvDocument(
    header,
    rows.map((r) => [
      r.address,
      r.unitNumber ?? '',
      r.ownerName ?? '',
      r.ownerEmail ?? '',
      r.ownerPhone ?? '',
      TENURE_LABEL[r.tenure ?? 'unknown'],
      r.notes ?? '',
      r.createdAt ?? '',
      r.updatedAt ?? '',
    ]),
  )

  const today = new Date().toISOString().slice(0, 10)
  const tag = [params.filter !== 'all' ? params.filter : null, params.search ? 'search' : null]
    .filter(Boolean)
    .join('-')
  const filename = `properties${tag ? `-${tag}` : ''}-${today}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
