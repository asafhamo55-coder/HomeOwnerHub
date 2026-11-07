import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page, PageHeader } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { getPrimaryAssociation } from '@/lib/vendors'
import { loadNoConsentEmails } from '@/lib/properties/roster/label-consent'
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
 * addresses never leave the page. The header is screen-only, so on paper
 * nothing sits above sheet 1.
 */
export default async function MailingLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string | string[] }>
}) {
  const ctx = await getCurrentUserRole()
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  const raw = await searchParams
  const onlyPaper = (Array.isArray(raw.paper) ? raw.paper[0] : raw.paper) === '1'

  const page = (body: React.ReactNode) => (
    <Page
      width="wide"
      linkAs={Link}
      className="print:m-0 print:max-w-none print:space-y-0 print:p-0"
      header={
        <div className="print:hidden">
          <PageHeader
            title="Mailing labels"
            description="Owner addresses on standard 30-up address labels, for owners who get paper."
            breadcrumbs={[{ label: 'People', href: '/settings/members' }, { label: 'Mailing labels' }]}
            linkAs={Link}
          />
        </div>
      }
    >
      {body}
    </Page>
  )

  const retryHref = onlyPaper ? `${LABELS_PATH}?paper=1` : LABELS_PATH
  const supabase = await getSupabaseServerClient()
  const assoc = await tryLoad('associations', () => readRosterAssociations(supabase, ctx.org.id))
  if (!assoc.ok) return page(<LoadFailed what="your association" retryHref={retryHref} />)

  const asOf = todayIn(assoc.data.timeZone)
  const loaded = await tryLoad('mailing labels roster', () => loadRosterInput(supabase, ctx.org.id, 'owners', asOf, assoc.data))
  if (!loaded.ok) return page(<LoadFailed what="the owner list" retryHref={retryHref} />)

  let noConsentEmails: Set<string> | undefined
  if (onlyPaper) {
    const primary = await getPrimaryAssociation()
    const consent = await tryLoad('mailing labels consent', async () => {
      const set = await loadNoConsentEmails(supabase, {
        orgId: ctx.org.id,
        associationId: primary?.id ?? null,
        state: assoc.data.primary?.governing_law_state ?? assoc.data.primary?.state,
      })
      if (!set) throw new Error('consent unavailable')
      return set
    })
    if (!consent.ok) return page(<LoadFailed what="who agreed to electronic notices" retryHref={retryHref} />)
    noConsentEmails = consent.data
  }

  const roster = buildOwnerRoster(loaded.data.input, asOf)
  const { labels, duplicates, shortened } = buildLabels(roster.rows, { onlyPaper, noConsentEmails })
  const sheets = paginate(labels, LABELS_PER_SHEET)

  return page(
    <div className="space-y-5 print:space-y-0">
      <div className="space-y-4 print:hidden">
        <ol
          className="list-decimal space-y-1 rounded-lg border-2 border-foreground/30 bg-surface-subtle p-4 pl-9 text-base text-foreground"
          aria-label="How to print"
        >
          <li>Print one test page on plain paper and hold it against a label sheet to check it lines up.</li>
          <li>In the print window set Scale to 100. Do not choose Fit to page or Shrink to fit.</li>
          <li>Turn off Headers and footers.</li>
        </ol>
        <p className="text-sm text-foreground-secondary">
          For Avery 5160 or 8160 labels (3 across, 10 down). Each label uses the mailing address on file, or the property address
          when there is none.
          {onlyPaper
            ? ' Only homes where every owner has no email on file, or has not agreed to electronic notices, are listed.'
            : ''}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          {onlyPaper ? (
            <Link href={LABELS_PATH} className={linkClass}>
              Show every owner
            </Link>
          ) : (
            <Link href={`${LABELS_PATH}?paper=1`} className={linkClass}>
              Only owners who get notices on paper
            </Link>
          )}
          <span className="text-sm text-foreground-secondary" role="status">
            {onlyPaper ? 'Showing owners who get notices on paper. ' : 'Showing every owner. '}
            {labels.length === 1 ? '1 label' : `${labels.length} labels`}
            {sheets.length > 0 ? `, ${sheets.length === 1 ? '1 sheet' : `${sheets.length} sheets`}` : ''}
            {duplicates > 0 ? `, ${duplicates} ${duplicates === 1 ? 'duplicate' : 'duplicates'} merged` : ''}.
          </span>
        </div>
        {shortened > 0 ? (
          <Alert variant="warning" title={`${shortened} ${shortened === 1 ? 'label was' : 'labels were'} shortened to fit`}>
            A name or street was too long for the label and ends in an ellipsis. Check the preview below before you print.
          </Alert>
        ) : null}
        {labels.length > 0 ? <PrintLabelsButton /> : null}
      </div>
      {labels.length === 0 ? (
        <Alert variant="info" title={onlyPaper ? 'Nobody needs a paper notice' : 'No addresses to print yet'}>
          {onlyPaper
            ? 'Every owner on file can be reached by email. Choose Show every owner to print labels for all of them.'
            : 'Add owners and addresses on the Properties page, then come back.'}
        </Alert>
      ) : (
        <LabelSheets sheets={sheets} />
      )}
    </div>,
  )
}
