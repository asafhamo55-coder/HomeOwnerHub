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
  association_id: string | null
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
 * not online (letter size). The text is the stored board_response, shown as plain text.
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

  const loadFailed = () => (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <LoadFailed what="the decision letter" retryHref={`/arc/${id}/letter`} />
    </div>
  )
  const stop = (title: string, body: string) => (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <Alert variant="warning" title={title}>
        {body}
      </Alert>
    </div>
  )

  const result = await loadOrFail(
    'this decision letter',
    supabase
      .from('arc_requests' as never)
      .select(
        'id, association_id, status, summary, board_response, board_response_at, unit:units(address_line1, address_line2, city, state, postal_code, unit_number), submitter:profiles!arc_requests_submitted_by_fkey(full_name)',
      )
      .eq('id', id)
      .eq('organization_id', ctx.org.id)
      .is('deleted_at', null)
      .maybeSingle(),
  )
  if (!result.ok) return loadFailed()
  if (!result.data) notFound()
  const r = result.data as unknown as Row

  if (r.status === 'withdrawn') return stop('This application was withdrawn', 'The resident withdrew it, so there is no decision letter to print.')
  if (r.status !== 'approved' && r.status !== 'denied') {
    return stop('Decide the request first', 'Save the board’s decision on the application, then come back to print the letter.')
  }

  // The association this request belongs to: its name for the letterhead and
  // signature, its contacts for the closing. Never the first association.
  let associationName = ctx.org.name
  let complianceSettings: unknown = null
  if (r.association_id) {
    const assoc = await loadOrFail(
      'the association',
      supabase
        .from('associations')
        .select('name, compliance_settings')
        .eq('id', r.association_id)
        .eq('organization_id', ctx.org.id)
        .maybeSingle(),
    )
    if (!assoc.ok || !assoc.data) return loadFailed()
    const a = assoc.data as unknown as { name: string | null; compliance_settings: unknown }
    associationName = a.name?.trim() || ctx.org.name
    complianceSettings = a.compliance_settings
  }

  const u = r.unit
  const raw = u
    ? [u.address_line1, u.address_line2, u.city, [u.state, u.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : ''
  const addressLines = u ? formatAddressLines(raw, u.unit_number) : ['', '']
  const contactLines = noticeContacts(complianceSettings).map((c) =>
    [c.label, c.name, c.phone, c.email, c.emergencyLine ? `Emergency: ${c.emergencyLine}` : ''].filter(Boolean).join(', '),
  )

  const warnings: string[] = []
  if (contactLines.length === 0) warnings.push('No board contacts are set, so the letter says "Please contact the board." Add them under Settings, Association.')
  if (!r.board_response?.trim()) warnings.push('No written response was saved with this decision, so the letter shows the decision only.')
  if (!r.board_response_at) warnings.push('This decision has no saved date, so the letter prints today’s date.')
  if (!r.association_id) warnings.push('This application is not linked to an association, so the letter uses the organisation name and no board contacts.')
  if (!addressLines.some(Boolean)) warnings.push('This application has no home address on file, so the address block is empty.')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <ArcLetterPrint
        view={{
          association: associationName,
          dateLabel: formatShortDate(r.board_response_at ?? new Date()),
          ownerName: r.submitter?.full_name?.trim() || null,
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
