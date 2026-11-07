import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { loadRosterInput, readRosterAssociations } from '@/lib/properties/statutory-roster/load'
import { buildOwnerRoster } from '@/lib/properties/statutory-roster/model'
import { LABELS_PER_SHEET, buildLabels, paginate } from '@/lib/properties/roster/labels'
import { LabelSheets } from './LabelSheets'
import { PrintLabelsButton } from './PrintLabelsButton'

export const metadata = { title: 'Mailing labels' }
export const dynamic = 'force-dynamic'

const LABELS_PATH = '/properties/roster/labels'
const linkClass = 'inline-flex min-h-11 items-center font-medium text-primary underline'

/**
 * /properties/roster/labels: owner mailing addresses on 30-up labels
 * (Avery 5160 / 8160), for owners who get paper. Board and admins only;
 * anyone else gets a 404 before any database client is made. The whole
 * roster is read (readAll, inside loadRosterInput). Nothing is logged here:
 * addresses never leave the page.
 */
export default async function MailingLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ noEmail?: string | string[] }>
}) {
  const ctx = await getCurrentUserRole()
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  const raw = await searchParams
  const onlyWithoutEmail = (Array.isArray(raw.noEmail) ? raw.noEmail[0] : raw.noEmail) === '1'

  const page = (body: React.ReactNode) => (
    <Page
      width="wide"
      title="Mailing labels"
      description="Owner addresses on standard 30-up address labels, for owners who get paper."
      breadcrumbs={[{ label: 'People', href: '/settings/members' }, { label: 'Mailing labels' }]}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  const supabase = await getSupabaseServerClient()
  const assoc = await tryLoad('associations', () => readRosterAssociations(supabase, ctx.org.id))
  if (!assoc.ok) return page(<LoadFailed what="your association" retryHref={LABELS_PATH} />)

  const asOf = todayIn(assoc.data.timeZone)
  const loaded = await tryLoad('mailing labels roster', () => loadRosterInput(supabase, ctx.org.id, 'owners', asOf, assoc.data))
  if (!loaded.ok) return page(<LoadFailed what="the owner list" retryHref={onlyWithoutEmail ? `${LABELS_PATH}?noEmail=1` : LABELS_PATH} />)

  const roster = buildOwnerRoster(loaded.data.input, asOf)
  const labels = buildLabels(roster.rows, { onlyWithoutEmail })
  const sheets = paginate(labels, LABELS_PER_SHEET)

  return page(
    <div className="space-y-5">
      <div className="space-y-3 print:hidden">
        <p className="text-sm text-foreground-secondary">
          Load Avery 5160 or 8160 labels (3 across, 10 down) and print at 100% scale with margins set to none. Each label uses the
          mailing address on file, or the property address when there is none.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          {onlyWithoutEmail ? (
            <Link href={LABELS_PATH} className={linkClass}>
              Show every owner
            </Link>
          ) : (
            <Link href={`${LABELS_PATH}?noEmail=1`} className={linkClass}>
              Only owners without email
            </Link>
          )}
          <span className="text-sm text-foreground-secondary" role="status">
            {onlyWithoutEmail ? 'Showing owners without email. ' : 'Showing every owner. '}
            {labels.length === 1 ? '1 label' : `${labels.length} labels`}
            {sheets.length > 0 ? `, ${sheets.length === 1 ? '1 sheet' : `${sheets.length} sheets`}.` : '.'}
          </span>
        </div>
        {labels.length > 0 ? <PrintLabelsButton /> : null}
      </div>
      {labels.length === 0 ? (
        <Alert variant="info" title={onlyWithoutEmail ? 'Every owner on file has an email' : 'No addresses to print yet'}>
          {onlyWithoutEmail
            ? 'There is nobody to mail. Choose Show every owner to print labels for all of them.'
            : 'Add owners and addresses on the Properties page, then come back.'}
        </Alert>
      ) : (
        <LabelSheets sheets={sheets} />
      )}
    </div>,
  )
}
