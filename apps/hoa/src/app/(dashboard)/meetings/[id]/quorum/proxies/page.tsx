import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { proxyLaw } from '@/lib/meeting-quorum/law'
import { chaseList, kitIsOpen, kitMeetingLabel, printableHomes } from '@/lib/meeting-quorum/quorum'
import { PrintPacketButton } from '../../packet/PrintPacketButton'
import { loadKitPage } from '../load-page'
import { ProxyForm } from '../print'

export const metadata = { title: 'Proxy forms' }
export const dynamic = 'force-dynamic'

/**
 * BL-122: printable proxy forms, one page per home. `?home=<id>` prints
 * one home's form; `?missing=1` only the homes with no proxy and no
 * check-in yet. Names and addresses only. Printed by the board and handed
 * or mailed by hand — never sent from the app.
 */
export default async function ProxyFormsPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ home?: string | string[]; missing?: string | string[] }>
}) {
  const { id } = await props.params
  const res = await loadKitPage(id)
  const sp = await props.searchParams
  const crumbs = [
    { label: 'Meetings', href: '/meetings' },
    { label: 'Quorum kit', href: `/meetings/${id}/quorum` },
    { label: 'Proxy forms' },
  ]
  if (!res.ok) {
    return (
      <Page title="Proxy forms" breadcrumbs={crumbs} linkAs={Link}>
        <LoadFailed what="the roster" hint="Nothing was printed." />
      </Page>
    )
  }
  const { ctx } = res
  if (!kitIsOpen(ctx.eligibility)) notFound()

  const one = typeof sp.home === 'string' ? sp.home : null
  const missingOnly = sp.missing === '1'
  let homes = printableHomes(ctx.rows)
  if (one) homes = homes.filter((h) => h.propertyId === one)
  else if (missingOnly) homes = chaseList(homes, ctx.kit)

  const header = {
    associationName: ctx.association?.name ?? null,
    meetingLabel: kitMeetingLabel(ctx.meeting.meeting_type),
    meetingDate: formatDay(ctx.meeting.meeting_date, 'medium'),
  }
  const law = proxyLaw(ctx.state)

  return (
    <Page
      width="narrow"
      title="Proxy forms"
      description={`${homes.length.toLocaleString()} ${homes.length === 1 ? 'form' : 'forms'}, one page each. Fill in the meeting time and place before you hand them out.`}
      breadcrumbs={crumbs}
      linkAs={Link}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      {homes.length === 0 ? (
        <EmptyState
          variant="compact"
          title={one ? 'That home isn’t on the roster' : 'No forms to print'}
          description={missingOnly ? 'Every home has a proxy or has checked in.' : 'Add homes on the Properties page first.'}
        />
      ) : (
        homes.map((h) => <ProxyForm key={h.propertyId} header={header} home={h} law={law} />)
      )}
    </Page>
  )
}
