import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { formatAddressLines } from '@/lib/properties/address-format'
import { formatShortDate } from '@/lib/format-datetime'
import { ARC_STATUS } from '@/lib/status/community'
import { noticeContacts } from '@/lib/join-notice'
import { ArcLetterPrint } from './ArcLetterPrint'

export const metadata = { title: 'Print decision letter' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Row {
  id: string
  status: string
  summary: string
  board_response: string | null
  board_response_at: string | null
  unit: {
    address_line1: string | null
    address_line2: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    unit_number: string | null
  } | null
  submitter: { full_name: string | null } | null
}

/**
 * /arc/[id]/letter: the board's decision letter on paper, for owners who are
 * not online. The text is the stored board_response, shown as plain text.
 * Board and admins only (anyone else gets a 404 before any database client
 * is made). Every read is scoped to the org; a failed read shows LoadFailed
 * and prints nothing. Nothing is sent or recorded from here.
 */
export default async function ArcLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, getCurrentUserRole()])
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()

  const supabase = await getSupabaseServerClient()
  const back = (
    <p className="print:hidden">
      <Link href={`/arc/${id}`} className="inline-flex min-h-12 items-center text-sm text-primary hover:underline">
        Back to the application
      </Link>
    </p>
  )

  const [result, settings] = await Promise.all([
    loadOrFail(
      'this decision letter',
      supabase
        .from('arc_requests' as never)
        .select(
          'id, status, summary, board_response, board_response_at, unit:units(address_line1, address_line2, city, state, postal_code, unit_number), submitter:profiles!arc_requests_submitted_by_fkey(full_name)',
        )
        .eq('id', id)
        .eq('organization_id', ctx.org.id)
        .is('deleted_at', null)
        .maybeSingle(),
    ),
    // The board contacts printed at the end of the letter (Settings, Association).
    loadOrFail(
      'the board contacts',
      supabase
        .from('associations')
        .select('compliance_settings')
        .eq('organization_id', ctx.org.id)
        .order('name', { ascending: true })
        .range(0, 0),
    ),
  ])
  if (!result.ok || !settings.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <LoadFailed what="the decision letter" retryHref={`/arc/${id}/letter`} />
      </div>
    )
  }
  if (!result.data) notFound()
  const r = result.data as unknown as Row

  if (r.status !== 'approved' && r.status !== 'denied') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <Alert variant="warning" title="Decide the request first">
          Save the board’s decision on the application, then come back to print the letter.
        </Alert>
      </div>
    )
  }

  const u = r.unit
  const raw = u
    ? [u.address_line1, u.address_line2, u.city, [u.state, u.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : ''
  const addressLines = u ? formatAddressLines(raw, u.unit_number) : ['', '']
  const settingsRow = ((settings.data ?? []) as Array<{ compliance_settings: unknown }>)[0]
  const contactLines = noticeContacts(settingsRow?.compliance_settings).map((c) =>
    [c.label, c.name, c.phone, c.email, c.emergencyLine ? `Emergency: ${c.emergencyLine}` : ''].filter(Boolean).join(', '),
  )

  const warnings: string[] = []
  if (contactLines.length === 0) warnings.push('No board contacts are set, so the letter says "Please contact the board." Add them under Settings, Association.')
  if (!r.board_response?.trim()) warnings.push('No written response was saved with this decision, so the letter shows the decision only.')
  if (!addressLines.some(Boolean)) warnings.push('This application has no home address on file, so the address block is empty.')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <ArcLetterPrint
        view={{
          association: ctx.org.name,
          dateLabel: formatShortDate(r.board_response_at),
          ownerName: r.submitter?.full_name ?? null,
          addressLines,
          requestSummary: r.summary,
          decisionLabel: ARC_STATUS.labels[r.status] ?? r.status,
          letterText: r.board_response ?? '',
          contactLines,
          warnings,
        }}
      />
    </div>
  )
}
