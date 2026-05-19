import { NextResponse, type NextRequest } from 'next/server'
import { listVendors, type ComplianceStatus } from '@/lib/vendors'

// CSV export of the vendor list. Honors `?q=` so the exported file
// matches the filtered view on /vendors. RLS via `listVendors()` already
// scopes to the current user's org.

const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  green: 'Compliant',
  yellow: 'Action soon',
  red: 'Non-compliant',
  missing: 'Docs missing',
}

const STATUS_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  active: 'Active',
  inactive: 'Inactive',
  blacklisted: 'Blacklisted',
}

// CSV cell quoting (RFC 4180) + formula-injection defense.
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
  const search = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  const allVendors = await listVendors()
  const vendors = search
    ? allVendors.filter((v) => {
        const hay = [
          v.legal_name,
          v.dba ?? '',
          v.primary_email ?? '',
          (v.trades ?? []).join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(search)
      })
    : allVendors

  const header = [
    'Legal name',
    'DBA',
    'Status',
    'Compliance',
    'Trades',
    'Email',
    'Phone',
    'Last reviewed',
  ]
  const lines = [header.map(csvEscape).join(',')]
  for (const v of vendors) {
    const compliance = v.compliance?.status
    lines.push(
      [
        v.legal_name,
        v.dba ?? '',
        STATUS_LABEL[v.status] ?? v.status,
        compliance ? COMPLIANCE_LABEL[compliance] : 'No review',
        (v.trades ?? []).join('; '),
        v.primary_email ?? '',
        v.primary_phone ?? '',
        v.compliance?.last_reviewed_at ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  const body = '﻿' + lines.join('\r\n')

  const today = new Date().toISOString().slice(0, 10)
  const tag = search ? '-search' : ''
  const filename = `vendors${tag}-${today}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
