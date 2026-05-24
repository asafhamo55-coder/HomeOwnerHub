import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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

// CSV cell quoting (RFC 4180) + Excel/Sheets formula-injection defense.
// Cells beginning with =, +, -, @, tab, or CR are interpreted as formulas
// by spreadsheet apps — prepend a single quote to neutralize.
function csvEscape(value: string | null | undefined): string {
  if (value == null) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const search = (url.searchParams.get('q') ?? '').trim()

  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('hoa_violations')
    .select(
      'id, description, status, severity, ccr_section, created_at, notice_sent_at, property:hoa_properties(address, unit_number)',
    )
    .eq('org_id', org.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (search.length > 0) {
    const safe = search
      .slice(0, 100)
      .replace(/[%_\\]/g, '\\$&')
      .replace(/[,()]/g, ' ')
    query = query.or(
      `description.ilike.%${safe}%,ccr_section.ilike.%${safe}%`,
    )
  }
  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'query_failed', message: error.message }, { status: 500 })
  }
  const rows = (data ?? []) as unknown as ViolationRow[]

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
  const lines = [header.map(csvEscape).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.description,
        STATUS_LABEL[r.status] ?? r.status,
        r.severity ?? '',
        r.ccr_section ?? '',
        r.property?.address ?? '',
        r.property?.unit_number ?? '',
        r.created_at ?? '',
        r.notice_sent_at ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  const body = '﻿' + lines.join('\r\n')

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
