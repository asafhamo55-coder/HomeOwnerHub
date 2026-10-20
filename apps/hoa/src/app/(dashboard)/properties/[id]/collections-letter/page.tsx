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
import { CollectionsLetter } from './CollectionsLetter'

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
      <CollectionsLetter input={input} today={today} events={events} pending={pending ? view(pending) : null} approved={approved ? view(approved) : null} />
      {printed.length > 0 ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle as="h2">Letters printed for this case</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {printed.map((r) => (
                <li key={r.id} className="num flex flex-wrap justify-between gap-2">
                  <span>{LETTER_KIND_LABELS[r.payload.kind]}</span>
                  <span className="text-foreground-secondary">
                    {usdCents(r.payload.totalCents)} · printed {formatStamp(r.printedAt)}
                  </span>
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
