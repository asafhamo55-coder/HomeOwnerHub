import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Card, CardContent, CardHeader, CardTitle, LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay, formatStamp } from '@/lib/money/format'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import { LETTER_DISCLAIMER } from '@/lib/collections/letters/law'
import { loadLetterContext } from '@/lib/collections/letters/load'
import { LETTER_KIND_LABELS } from '@/lib/collections/letters/proposal'
import { usdCents } from '@/lib/collections/letters/model'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { M7_APPLIED } from '@homeowner-portal/db/m7'
import {
  GA_FEE_NOTICE_WAIT_DAYS,
  clockStartOf,
  describeMail,
  feeNoticeCleanOn,
  foreclosureEligibleOnFor,
  foreclosureWaitDays,
  type MailRecord,
} from '@/lib/collections/mail-tracking'
import { CollectionsLetter } from './CollectionsLetter'
import { MailingForm } from './MailingForm'

/** BL-166: the Georgia notices whose waiting period runs from delivery. */
const GA_MAIL_KINDS = ['ga_fee_notice', 'ga_pre_foreclosure', 'ga_condo_pre_foreclosure'] as const

export const metadata = { title: 'Collections letter' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /properties/[id]/collections-letter — draft, approve and print a
 * statute-aware collections letter for one home (BL-089). Board and
 * admins only: anyone else gets a 404, decided before any database client
 * is made. The letter is built in code from the ledger and the state rule;
 * nothing is emailed.
 */
export default async function CollectionsLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, getCurrentUserRole()])
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()
  const propertyId = asPropertyId(id)
  const back = { href: propertyHref(propertyId), label: 'Property' }

  const page = (body: React.ReactNode) => (
    <Page width="default" title="Collections letter" back={back} linkAs={Link}>
      <div className="space-y-5">
        <p className="text-sm text-foreground-secondary print:hidden">
          A past-due or lien notice built from this home’s ledger and your state’s rules. The board approves it in Approvals, then you print it and send it.
        </p>
        {body}
      </div>
    </Page>
  )

  const supabase = await getSupabaseServerClient()
  const loaded = await timed('/properties/[id]/collections-letter', 'collections.letterContext', () =>
    tryLoad('collections letter', () => loadLetterContext(supabase, ctx.org.id, propertyId)),
  )
  if (!loaded.ok) return page(<LoadFailed what="this home’s account" hint="No letter was drafted." />)
  if (!loaded.data) notFound()
  const { input, today, collectionCase, events, requests } = loaded.data

  if (!collectionCase) {
    return page(
      <Alert variant="warning" title="No open collections case">
        Letters are drafted from a collections case. Open a case in the property’s Collections file first.
      </Alert>,
    )
  }

  const pending = requests.find((r) => r.status === 'proposed') ?? null
  const approved = requests.find((r) => r.status === 'posted' && r.printedAt === null) ?? null
  const latest = requests[0] ?? null
  const printed = requests.filter((r) => r.printedAt !== null)
  const view = (r: (typeof requests)[number]) => ({ id: r.id, proposedAt: r.proposedAt, payload: r.payload })

  return page(
    <div className="space-y-5">
      {input.unitId === null ? (
        <Alert variant="warning" title="No unit linked to this home" className="print:hidden">
          Dues are recorded on a unit, and this home has none, so the letter shows no charges.
        </Alert>
      ) : null}
      {latest && (latest.status === 'rejected' || latest.status === 'failed') && !pending ? (
        <Alert variant="warning" title={latest.status === 'rejected' ? 'The last letter was rejected' : 'The last letter wasn’t approved'} className="print:hidden">
          {LETTER_KIND_LABELS[latest.payload.kind]}, drafted {formatDay(latest.payload.draftedOn)}
          {latest.decisionReason ? `: “${latest.decisionReason}”` : latest.error ? `: ${latest.error}` : '.'}
        </Alert>
      ) : null}
      <CollectionsLetter
        input={input}
        today={today}
        events={events}
        pending={pending ? view(pending) : null}
        approved={approved ? view(approved) : null}
        printed={printed.map((r) => ({ kind: r.payload.kind, printedAt: r.printedAt! }))}
      />
      {printed.length > 0 ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle as="h2">Letters printed for this case</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {printed.map((r) => (
                <li key={r.id} className="space-y-1">
                  <div className="num flex flex-wrap justify-between gap-2">
                    <span>{LETTER_KIND_LABELS[r.payload.kind]}</span>
                    <span className="text-foreground-secondary">
                      {usdCents(r.payload.totalCents)} · printed {formatStamp(r.printedAt)}
                    </span>
                  </div>
                  {M7_APPLIED && (GA_MAIL_KINDS as readonly string[]).includes(r.payload.kind) ? (
                    <MailingBlock request={r} today={today} propertyId={id} />
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <div className="print:hidden">
        <LegalDisclaimer>{LETTER_DISCLAIMER}</LegalDisclaimer>
      </div>
    </div>,
  )
}

/** BL-166: the mailing record of one printed Georgia notice, the clock it starts, and the form to record it. */
function MailingBlock({ request: r, today, propertyId }: { request: { id: string; printedAt: string | null; payload: { kind: string }; mail?: MailRecord | null }; today: string; propertyId: string }) {
  const start = clockStartOf(r.mail)
  const sentOn = r.mail?.mailedOn ?? r.printedAt?.slice(0, 10) ?? today
  let clock: string | null = null
  if (start && r.payload.kind === 'ga_fee_notice') {
    const on = feeNoticeCleanOn(start)
    clock = on <= today
      ? `The owner’s ${GA_FEE_NOTICE_WAIT_DAYS} days from receipt ran out ${formatDay(on)}. Attorney’s fees can follow.`
      : `The owner has until ${formatDay(on)} (${GA_FEE_NOTICE_WAIT_DAYS} days from receipt on ${formatDay(start)}).`
  } else if (start) {
    const on = foreclosureEligibleOnFor(r.payload.kind, sentOn, start)
    const days = r.payload.kind === 'ga_condo_pre_foreclosure' ? 30 : foreclosureWaitDays(sentOn)
    clock = `Earliest foreclosure date: ${formatDay(on)} (${days} days from receipt on ${formatDay(start)}).`
  } else if (r.mail) {
    clock = r.mail.method && r.mail.method !== 'certified' && r.mail.method !== 'statutory_overnight'
      ? 'This method does not start Georgia’s clock. Only certified mail or statutory overnight delivery does.'
      : 'Add the delivery date to start the clock.'
  } else {
    clock = 'Not recorded yet. The waiting period counts from the day the owner received it.'
  }
  return (
    <div className="text-sm">
      {r.mail ? <p className="text-foreground-secondary">{describeMail(r.mail)}</p> : null}
      <p className="text-foreground-secondary">{clock}</p>
      <details>
        <summary className="cursor-pointer text-xs underline">{r.mail ? 'Add or update the mailing record' : 'Record how and when it was mailed'}</summary>
        <MailingForm propertyId={propertyId} approvalRequestId={r.id} initial={r.mail ?? null} today={today} />
      </details>
    </div>
  )
}
