import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { formatAddressLines } from '@/lib/properties/address-format'
import { formatDay } from '@/lib/money/format'
import { todayIn } from '@/lib/association-time'
import { loadOrgStateRules } from '@/lib/violation-cure-commitment'
import { loadBoardHearing, type BoardHearingLoad } from '@/lib/violation-hearings/queries'
import { buildHearingNoticeDraft } from '@/lib/violation-hearings/rules'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { HearingNoticePrint } from './HearingNoticePrint'

export const metadata = { title: 'Print hearing notice' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Row {
  id: string
  violation_type: string
  description: string
  ccr_section: string | null
  property: { address: string; unit_number: string | null; owner_name: string | null } | null
}

/**
 * /violations/[id]/hearing-notice: the hearing notice on paper, for owners
 * who do not read email. The words come from buildHearingNoticeDraft, the
 * same builder the email composer uses, fed the saved hearing record.
 * Board and admins only (anyone else gets a 404 before any database client
 * is made). Every read is scoped to the org; a failed read shows LoadFailed
 * and prints nothing. Nothing is sent or recorded from here.
 */
export default async function HearingNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, getCurrentUserRole()])
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()

  const supabase = await getSupabaseServerClient()
  const back = (
    <p className="print:hidden">
      <Link href={`/violations/${id}`} className="inline-flex min-h-12 items-center text-sm text-primary hover:underline">
        Back to the violation
      </Link>
    </p>
  )

  const [result, assoc, hearingLoad, rules] = await Promise.all([
    loadOrFail(
      'this hearing notice',
      supabase
        .from('hoa_violations')
        .select('id, violation_type, description, ccr_section, property:hoa_properties(address, unit_number, owner_name)')
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .is('deleted_at', null)
        .maybeSingle(),
    ),
    getPrimaryAssociationResult(),
    loadBoardHearing(supabase as never, ctx.org.id, id).catch((): BoardHearingLoad => ({ kind: 'failed' })),
    loadOrgStateRules(supabase, ctx.org.id).catch(() => null),
  ])
  // Any failed read prints nothing: a notice built on a guessed state or a
  // missing hearing would go to an owner with the wrong law or the wrong day.
  if (!result.ok || hearingLoad.kind === 'failed' || !rules || !assoc.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <LoadFailed what="the hearing notice" retryHref={`/violations/${id}/hearing-notice`} />
      </div>
    )
  }
  if (!result.data || hearingLoad.kind === 'off') notFound()
  const v = result.data as unknown as Row
  const hearing = hearingLoad.hearing

  if (!hearing || !hearing.hearingOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <Alert variant="warning" title="Record the hearing first">
          Save the hearing date, time and place on the violation, then come back to print the notice.
        </Alert>
      </div>
    )
  }

  const zone = assoc.data ? assoc.data.timeZone : 'America/New_York'
  const draft = buildHearingNoticeDraft({
    state: rules.state,
    associationName: ctx.org.name,
    violationType: v.violation_type,
    description: v.description,
    ruleCited: v.ccr_section,
    hearingOn: hearing.hearingOn,
    hearingTime: hearing.hearingTime,
    location: hearing.location,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <HearingNoticePrint
        view={{
          association: ctx.org.name,
          dateLabel: formatDay(todayIn(zone)),
          ownerName: v.property?.owner_name ?? null,
          addressLines: v.property ? formatAddressLines(v.property.address, v.property.unit_number) : ['', ''],
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
        }}
      />
    </div>
  )
}
