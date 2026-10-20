import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { kitIsOpen, kitMeetingLabel, printableHomes, sharesWorthPrinting } from '@/lib/meeting-quorum/quorum'
import { PrintPacketButton } from '../../packet/PrintPacketButton'
import { loadKitPage } from '../load-page'
import { SignInSheet } from '../print'

export const metadata = { title: 'Sign-in sheet' }
export const dynamic = 'force-dynamic'

/** BL-122: the printable sign-in sheet. Names, addresses, lots and shares — no contact details. */
export default async function SignInSheetPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const res = await loadKitPage(id)
  const crumbs = [
    { label: 'Meetings', href: '/meetings' },
    { label: 'Quorum kit', href: `/meetings/${id}/quorum` },
    { label: 'Sign-in sheet' },
  ]
  if (!res.ok) {
    return (
      <Page title="Sign-in sheet" breadcrumbs={crumbs} linkAs={Link}>
        <LoadFailed what="the roster" hint="Nothing was printed." />
      </Page>
    )
  }
  const { ctx } = res
  if (!kitIsOpen(ctx.eligibility)) notFound()
  const homes = printableHomes(ctx.rows)
  return (
    <Page
      width="wide"
      title="Sign-in sheet"
      description={`Owners as of ${formatDay(ctx.asOf, 'medium')}. ${homes.length.toLocaleString()} homes.`}
      breadcrumbs={crumbs}
      linkAs={Link}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      <SignInSheet
        header={{
          associationName: ctx.association?.name ?? null,
          meetingLabel: kitMeetingLabel(ctx.meeting.meeting_type),
          meetingDate: formatDay(ctx.meeting.meeting_date, 'medium'),
        }}
        homes={homes}
        showShares={sharesWorthPrinting(homes)}
      />
    </Page>
  )
}
