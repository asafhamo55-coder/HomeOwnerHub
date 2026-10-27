import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { Button, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { countAudiences } from '@/lib/communications/audience'
import { loadStreetOptions } from '@/lib/communications/streets'
import { SCHEDULING_ENABLED } from '@/lib/communications/scheduling'
import { smsConfigured } from '@/lib/sms'
import { todayIn } from '@/lib/association-time'
import { getOccasion, isIsoDate } from '@/lib/announcements/occasions'
import { AnnouncementFlow } from './AnnouncementFlow'

export const metadata = { title: 'New announcement' }
export const dynamic = 'force-dynamic'

const BREADCRUMBS = [{ label: 'Messages', href: '/communications' }, { label: 'New announcement' }]

/**
 * BL-173: "New announcement". Pick an occasion, check the draft, review and
 * send. Opens on the grid, or straight on the draft when the dashboard
 * nudge links here with ?occasion=<id>&date=<YYYY-MM-DD>.
 */
export default async function AnnouncePage({
  searchParams,
}: {
  searchParams: Promise<{ occasion?: string; date?: string }>
}) {
  await requireBoardOrAdmin()
  const sp = await searchParams
  const assocRes = await getPrimaryAssociationResult()

  if (!assocRes.ok) {
    return (
      <Page width="narrow" title="New announcement" breadcrumbs={BREADCRUMBS} linkAs={Link}>
        <LoadFailed what="your association" />
      </Page>
    )
  }
  const assoc = assocRes.data
  if (!assoc) {
    return (
      <Page width="narrow" title="New announcement" breadcrumbs={BREADCRUMBS} linkAs={Link}>
        <EmptyState
          icon={<MessageSquare aria-hidden />}
          title="No HOA association configured"
          description="Set up an association before sending announcements."
          action={
            <Button asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const supabase = await getSupabaseServerClient()
  const [counts, streets] = await Promise.all([
    countAudiences(supabase, assoc.id),
    // The same street list the full composer offers (BL-102 A5, BL-146).
    loadStreetOptions(supabase, assoc.id),
  ])

  const initialOccasion = getOccasion(sp.occasion)?.id ?? null
  const initialDate = sp.date && isIsoDate(sp.date) ? sp.date : ''

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={BREADCRUMBS}
      title="New announcement"
      description="Pick what it is about, check the draft, press Send. Nothing goes out until you do."
    >
      <AnnouncementFlow
        associationName={assoc.name}
        today={todayIn(assoc.timeZone)}
        streets={streets}
        everyoneCount={counts.everyone}
        smsAvailable={smsConfigured()}
        schedulingEnabled={SCHEDULING_ENABLED}
        initialOccasionId={initialOccasion}
        initialDate={initialDate}
      />
    </Page>
  )
}
