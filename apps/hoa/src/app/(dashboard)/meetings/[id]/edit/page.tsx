import { formatDay } from '@/lib/money/format'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { todayIn } from '@/lib/association-time'
import { currentTimeZone } from '@/lib/association-time-current'
import { loadAgendaContext } from '@/lib/meetings/agenda-queries'
import { EditMeetingForm } from './EditMeetingForm'

export const metadata = { title: 'Edit meeting' }

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const result = await loadOrFail(
    'meeting',
    supabase
      .from('hoa_meeting_minutes')
      .select('id, meeting_date, meeting_type, attendees, ai_summary')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  )

  if (!result.ok) {
    return (
      <Page
        width="narrow"
        title="Edit meeting"
        breadcrumbs={[
          { label: 'Meetings', href: '/meetings' },
          { label: 'Meeting', href: `/meetings/${id}` },
          { label: 'Edit' },
        ]}
        linkAs={Link}
      >
        <LoadFailed what="this meeting" />
      </Page>
    )
  }
  if (!result.data) notFound()
  const m = result.data as {
    id: string
    meeting_date: string
    meeting_type: string | null
    attendees: string[] | null
    ai_summary: string | null
  }
  const upcoming = m.meeting_date >= todayIn(await currentTimeZone())
  const agendaContext = upcoming ? await loadAgendaContext() : undefined
  const dateLabel = formatDay(m.meeting_date)

  return (
    <Page
      width="narrow"
      title="Edit meeting"
      description="Correct the date, type, attendees or the minutes text. Changes apply to the board record immediately."
      breadcrumbs={[
        { label: 'Meetings', href: '/meetings' },
        { label: dateLabel, href: `/meetings/${id}` },
        { label: 'Edit' },
      ]}
      linkAs={Link}
    >
      <EditMeetingForm
        meetingId={m.id}
        upcoming={upcoming}
        agendaContext={agendaContext}
        defaultValues={{
          meetingDate: m.meeting_date,
          meetingType: (m.meeting_type as 'regular' | 'special' | 'annual' | 'emergency') ?? 'regular',
          attendees: (m.attendees ?? []).join(', '),
          approvedSummary: m.ai_summary ?? '',
        }}
      />
    </Page>
  )
}
