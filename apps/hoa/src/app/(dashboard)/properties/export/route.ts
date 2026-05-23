import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// CSV export of the properties list, scoped to the current user's org
// via RLS (the server client carries their session). Honors `?tenure=`
// and `?q=` query params so the exported file matches what the user
// sees on the page.

type Tenure = 'owner_occupied' | 'leased' | 'unknown'

interface PropertyRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  tenure: Tenure | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

const TENURE_LABEL: Record<Tenure, string> = {
  owner_occupied: 'Owner-occupied',
  leased: 'Leased',
  unknown: 'Unknown',
}

function csvEscape(value: string | null | undefined): string {
  if (value == null) return ''
  let s = String(value)
  // Defense against CSV formula injection: Excel/Google Sheets evaluate
  // any cell whose first character is `=`, `+`, `-`, `@`, TAB, or CR as
  // a formula on open. Prepend a single quote so the spreadsheet treats
  // the cell as literal text. See OWASP "CSV Injection".
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  // Quote when the value contains a comma, quote, or newline. Escape any
  // embedded quotes by doubling them, per RFC 4180.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tenureParam = url.searchParams.get('tenure')
  const search = (url.searchParams.get('q') ?? '').trim()

  const activeTenure: 'all' | Tenure =
    tenureParam === 'owner_occupied' || tenureParam === 'leased' || tenureParam === 'unknown'
      ? tenureParam
      : 'all'

  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('hoa_properties')
    .select(
      'id, address, unit_number, owner_name, owner_email, owner_phone, tenure, notes, created_at, updated_at',
    )
    .eq('org_id', org.id)
    .order('address', { ascending: true })
  if (activeTenure !== 'all') {
    query = query.eq('tenure' as never, activeTenure)
  }
  if (search.length > 0) {
    // Cap length to prevent pathological inputs, escape LIKE wildcards
    // (`%`, `_`, `\`) so they don't match everything, and strip
    // PostgREST `.or()` separators (`,`, `(`, `)`).
    const safe = search
      .slice(0, 100)
      .replace(/[%_\\]/g, '\\$&')
      .replace(/[,()]/g, ' ')
    query = query.or(
      `address.ilike.%${safe}%,unit_number.ilike.%${safe}%,owner_name.ilike.%${safe}%,owner_email.ilike.%${safe}%`,
    )
  }
  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'query_failed', message: error.message }, { status: 500 })
  }
  const rows = (data ?? []) as unknown as PropertyRow[]

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
  const lines = [header.map(csvEscape).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.address,
        r.unit_number ?? '',
        r.owner_name ?? '',
        r.owner_email ?? '',
        r.owner_phone ?? '',
        TENURE_LABEL[r.tenure ?? 'unknown'],
        r.notes ?? '',
        r.created_at ?? '',
        r.updated_at ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  // BOM helps Excel render UTF-8 correctly without prompting.
  const body = '﻿' + lines.join('\r\n')

  const today = new Date().toISOString().slice(0, 10)
  const tag =
    activeTenure === 'all' && !search
      ? ''
      : `-${[activeTenure !== 'all' ? activeTenure : null, search ? 'search' : null]
          .filter(Boolean)
          .join('-')}`
  const filename = `properties${tag}-${today}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
