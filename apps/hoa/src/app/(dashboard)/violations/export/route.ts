import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAllResult } from '@/lib/supabase/read-all'
import { csvDocument } from '@/lib/csv'

// CSV export of the violations list, scoped to the current user's org
// via RLS. Honors the same `?q=` search the page uses so the exported
// file matches what the user sees.

interface ViolationRow {
  id: string
  description: string
  status: string
  severity: string | null
  ccr_section: string | null
  created_at: string | null
  notice_sent_at: string | null
  property: { address: string; unit_number: string | null } | null
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  notice_sent: 'Notice sent',
  cured: 'Cured',
  resolved: 'Resolved',
  fined: 'Fined',
  escalated: 'At attorney',
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const search = (url.searchParams.get('q') ?? '').trim()

  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  const safe = search
    .slice(0, 100)
    .replace(/[%_\\]/g, '\\$&')
    .replace(/[,()]/g, ' ')
  // Paged to the end (BL-053): one read stops at PostgREST's 1000-row cap,
  // so a larger community exported a silently short file. A fresh query
  // per page, with `id` as the tiebreak so pages never overlap.
  const { data, error } = await readAllResult<ViolationRow>((from, to) => {
    let query = supabase
      .from('hoa_violations')
      .select(
        'id, description, status, severity, ccr_section, created_at, notice_sent_at, property:hoa_properties(address, unit_number)',
      )
      .eq('org_id', org.id)
      .is('deleted_at', null)
    if (search.length > 0) {
      query = query.or(
        `description.ilike.%${safe}%,ccr_section.ilike.%${safe}%`,
      )
    }
    return query
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: ViolationRow[] | null; error: { code?: string; message?: string } | null }>
  })
  if (error) {
    return NextResponse.json({ error: 'query_failed', message: error.message }, { status: 500 })
  }
  const rows = data ?? []

  const header = [
    'Description',
    'Status',
    'Severity',
    'CC&R section',
    'Address',
    'Unit',
    'Reported',
    'Notice sent',
  ]
  const body = csvDocument(
    header,
    rows.map((r) => [
      r.description,
      STATUS_LABEL[r.status] ?? r.status,
      r.severity ?? '',
      r.ccr_section ?? '',
      r.property?.address ?? '',
      r.property?.unit_number ?? '',
      r.created_at ?? '',
      r.notice_sent_at ?? '',
    ]),
  )

  const today = new Date().toISOString().slice(0, 10)
  const tag = search ? '-search' : ''
  const filename = `violations${tag}-${today}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
