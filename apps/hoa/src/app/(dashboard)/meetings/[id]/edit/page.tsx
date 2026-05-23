import { notFound } from 'next/navigation'
import { BackLink, PageHeader } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { EditMeetingForm } from './EditMeetingForm'

export default async function EditMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, attendees, ai_summary')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) notFound()
  const m = data as {
    id: string
    meeting_date: string
    meeting_type: string | null
    attendees: string[] | null
    ai_summary: string | null
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href={`/meetings/${id}`} label="Back to meeting" />
      <PageHeader title="Edit meeting" />
      <EditMeetingForm
        meetingId={m.id}
        defaultValues={{
          meetingDate: m.meeting_date,
          meetingType: (m.meeting_type as 'regular' | 'special' | 'annual' | 'emergency') ?? 'regular',
          attendees: (m.attendees ?? []).join(', '),
          approvedSummary: m.ai_summary ?? '',
        }}
      />
    </div>
  )
}
