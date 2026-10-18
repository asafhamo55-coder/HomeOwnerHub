import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { recordRosterExport } from '@/lib/properties/statutory-roster/audit'
import { loadRosterInput, readRosterAssociations } from '@/lib/properties/statutory-roster/load'
import { VERIFY_DISCLAIMER } from '@/lib/properties/statutory-roster/law'
import { buildReport, parseRosterParams, reportCounts, rosterHref } from '@/lib/properties/statutory-roster/model'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { RosterChooser } from './RosterChooser'
import { RosterReportView } from './RosterReportView'

export const metadata = { title: 'Owner roster & voter list' }
export const dynamic = 'force-dynamic'

/**
 * /properties/roster — the statutory owner roster and voter list (PR-12,
 * Properties P5). Board and admins only: anyone else gets a 404, decided
 * before any database client is made. Showing a report counts as an
 * export (it is the printable copy), so it writes the same counts-only
 * audit row as the CSV, and is not shown if that row can't be written.
 */
export default async function StatutoryRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[]; asOf?: string | string[] }>
}) {
  const ctx = await getCurrentUserRole()
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  const orgId = ctx.org.id
  const raw = await searchParams

  const page = (body: React.ReactNode) => (
    <Page
      width="wide"
      title="Owner roster & voter list"
      description="The member roster and voter list your state’s records rules ask for, as of any date."
      breadcrumbs={[{ label: 'Properties', href: '/properties' }, { label: 'Roster & voter list' }]}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  const supabase = await getSupabaseServerClient()
  const assoc = await tryLoad('associations', () => readRosterAssociations(supabase, orgId))
  if (!assoc.ok) return page(<LoadFailed what="your association" retryHref={rosterHref(null)} />)

  const today = todayIn(assoc.data.timeZone)
  const params = parseRosterParams(raw, today)
  const chooser = <RosterChooser kind={params.kind} asOf={params.asOf} today={today} dateError={params.dateError} />
  const disclaimer = (
    <div className="print:hidden">
      <LegalDisclaimer>{VERIFY_DISCLAIMER}</LegalDisclaimer>
    </div>
  )

  if (!params.kind) return page(<>{chooser}{disclaimer}</>)
  const kind = params.kind

  const loaded = await tryLoad('statutory roster', () => loadRosterInput(supabase, orgId, kind, params.asOf, assoc.data))
  if (!loaded.ok) {
    return page(
      <>
        {chooser}
        <LoadFailed what="the roster" hint="Nothing was exported." retryHref={rosterHref(kind, params.asOf)} />
      </>,
    )
  }

  const report = buildReport(kind, loaded.data.input, params.asOf)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const audit = user
    ? await recordRosterExport(supabase, { orgId, userId: user.id, kind, asOf: params.asOf, format: 'print', counts: reportCounts(report) })
    : ({ ok: false, code: null } as const)
  if (!audit.ok) {
    return page(
      <>
        {chooser}
        <Alert variant="error" title="Couldn’t record this export">
          Every roster export is logged, and the log couldn’t be written, so the roster isn’t shown. Try again.
        </Alert>
      </>,
    )
  }

  return page(
    <>
      {chooser}
      <RosterReportView report={report} associationName={loaded.data.associationName} states={loaded.data.states} generatedOn={today} />
      <LegalDisclaimer>{VERIFY_DISCLAIMER}</LegalDisclaimer>
    </>,
  )
}
