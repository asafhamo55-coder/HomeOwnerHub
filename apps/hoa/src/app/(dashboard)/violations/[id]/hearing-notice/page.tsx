import { readManagedBy } from '@/lib/managed-by'
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
import { CA_NOTICE_DAYS, FL_NOTICE_DAYS, addDays, buildHearingNoticeDraft } from '@/lib/violation-hearings/rules'
import { normaliseState } from '@/lib/compliance/statute-drift'
import { noticeContacts } from '@/lib/join-notice'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { HearingNoticePrint } from './HearingNoticePrint'

export const metadata = { title: 'Print hearing notice' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CLOSED = new Set(['resolved', 'dismissed', 'waived', 'cured'])

interface Row {
  id: string
  status: string
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

  const [result, assoc, hearingLoad, rules, settings] = await Promise.all([
    loadOrFail(
      'this hearing notice',
      supabase
        .from('hoa_violations')
        .select('id, status, violation_type, description, ccr_section, property:hoa_properties(address, unit_number, owner_name)')
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .is('deleted_at', null)
        .maybeSingle(),
    ),
    getPrimaryAssociationResult(),
    loadBoardHearing(supabase as never, ctx.org.id, id).catch((): BoardHearingLoad => ({ kind: 'failed' })),
    loadOrgStateRules(supabase, ctx.org.id).catch(() => null),
    // The board contacts printed in place of "reply to this message" (Settings, Association).
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
  // Any failed read prints nothing: a notice built on a guessed state or a
  // missing hearing would go to an owner with the wrong law or the wrong day.
  if (!result.ok || hearingLoad.kind === 'failed' || !rules || !assoc.ok || !settings.ok) {
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

  const stop = (title: string, body: string) => (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <Alert variant="warning" title={title}>
        {body}
      </Alert>
    </div>
  )
  if (CLOSED.has(v.status)) return stop('This violation is closed', 'There is no hearing notice to print.')
  if (!hearing || !hearing.hearingOn) {
    return stop('Record the hearing first', 'Save the hearing date, time and place on the violation, then come back to print the notice.')
  }
  // Paper has no edit step, so nothing is printed with a gap in it.
  if (!hearing.location?.trim()) return stop('Add the hearing place first', 'Save the place on the hearing card, then come back to print the notice.')
  if (!hearing.hearingTime) return stop('Add the hearing time first', 'Save the time on the hearing card, then come back to print the notice.')

  const zone = assoc.data ? assoc.data.timeZone : 'America/New_York'
  const today = todayIn(zone)
  const settingsRow = ((settings.data ?? []) as Array<{ compliance_settings: unknown }>)[0]
  const contactLines = noticeContacts(settingsRow?.compliance_settings).map((c) =>
    [c.label, c.name, c.phone, c.email, c.emergencyLine ? `Emergency: ${c.emergencyLine}` : ''].filter(Boolean).join(', '),
  )
  const draft = buildHearingNoticeDraft({
    state: rules.state,
    associationName: ctx.org.name,
    violationType: v.violation_type,
    description: v.description,
    ruleCited: v.ccr_section,
    hearingOn: hearing.hearingOn,
    hearingTime: hearing.hearingTime,
    location: hearing.location,
    mode: 'print',
    contactLines,
  })

  const warnings: string[] = []
  if (contactLines.length === 0) warnings.push('No board contacts are set, so the notice says "Please contact the board." Add them under Settings, Association.')
  if (hearing.hearingOn < today) warnings.push('The hearing date has passed.')
  const state = normaliseState(rules.state)
  const minDays = state === 'FL' ? FL_NOTICE_DAYS : state === 'CA' ? CA_NOTICE_DAYS : null
  if (minDays !== null && hearing.hearingOn >= today && hearing.hearingOn < addDays(today, minDays)) {
    warnings.push(`The hearing is less than ${minDays} days away. ${state === 'FL' ? 'Florida' : 'California'} requires at least ${minDays} days’ written notice.`)
  }
  if (hearing.status !== 'scheduled') warnings.push(`The hearing is marked ${hearing.status}, not scheduled.`)
  if (draft.bodyHtml.includes('[')) warnings.push('The notice still has a square-bracket gap. Do not print it until it is filled in.')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <HearingNoticePrint
        view={{
          association: ctx.org.name,
          dateLabel: formatDay(today),
          ownerName: v.property?.owner_name ?? null,
          addressLines: v.property ? formatAddressLines(v.property.address, v.property.unit_number) : ['', ''],
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          warnings,
          managedBy: readManagedBy(settingsRow?.compliance_settings),
        }}
      />
    </div>
  )
}
