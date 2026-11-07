import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoadFailed } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadManagedByLine } from '@/lib/managed-by-load'
import { loadOrFail } from '@/lib/load-or-fail'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { formatAddressLines } from '@/lib/properties/address-format'
import { formatDay } from '@/lib/money/format'
import { dayOf, todayIn } from '@/lib/association-time'
import { ViolationLetterPrint } from './ViolationLetterPrint'

export const metadata = { title: 'Print violation notice' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Row {
  id: string
  notice_sent_at: string | null
  approved_at: string | null
  approved_letter: string | null
  property: { address: string; unit_number: string | null; owner_name: string | null } | null
}

/**
 * /violations/[id]/letter: a clean print view of the notice the board
 * approved. Board and admins only (anyone else gets a 404 before any
 * database client is made). The app chrome is hidden in print.
 */
export default async function ViolationLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, getCurrentUserRole()])
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()

  const supabase = await getSupabaseServerClient()
  const [result, assoc] = await Promise.all([
    loadOrFail(
      'this notice',
      supabase
        .from('hoa_violations')
        .select('id, notice_sent_at, approved_at, approved_letter, property:hoa_properties(address, unit_number, owner_name)')
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .is('deleted_at', null)
        .maybeSingle(),
    ),
    getPrimaryAssociationResult(),
  ])
  const back = (
    <p className="print:hidden">
      <Link href={`/violations/${id}`} className="inline-flex min-h-12 items-center text-sm text-primary hover:underline">
        Back to the violation
      </Link>
    </p>
  )
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <LoadFailed what="this notice" retryHref={`/violations/${id}/letter`} />
      </div>
    )
  }
  if (!result.data) notFound()
  const v = result.data as unknown as Row
  if (!v.approved_letter) notFound()

  const zone = assoc.ok && assoc.data ? assoc.data.timeZone : 'America/New_York'
  const letterDate = (v.notice_sent_at ? dayOf(v.notice_sent_at, zone) : null) ?? (v.approved_at ? dayOf(v.approved_at, zone) : null) ?? todayIn(zone)
  const addressLines = v.property ? formatAddressLines(v.property.address, v.property.unit_number) : ['', '']

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <ViolationLetterPrint
        view={{
          violationId: v.id,
          association: assoc.ok && assoc.data ? assoc.data.name : null,
          dateLabel: formatDay(letterDate),
          ownerName: v.property?.owner_name ?? null,
          addressLines,
          letter: v.approved_letter,
          managedBy: await loadManagedByLine(supabase, ctx.org.id, assoc.ok && assoc.data ? assoc.data.id : null),
        }}
      />
    </div>
  )
}
