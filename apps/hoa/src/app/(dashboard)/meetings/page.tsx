import Link from 'next/link'
import { CalendarDays, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Meetings' }

interface MeetingRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  approved_at: string | null
  attendees: string[] | null
  ai_summary: string | null
}

export default async function MeetingsPage() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status, approved_at, attendees, ai_summary')
    .order('meeting_date', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as MeetingRow[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">Meetings</h1>
          <p className="text-sm text-muted-fg">
            Paste a transcript, get an AI-drafted minutes, approve it through BarBGate.
          </p>
        </div>
        <Button asChild>
          <Link href="/meetings/new">
            <Plus className="h-4 w-4" />
            New minutes
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-10 w-10" aria-hidden />}
          title="No minutes yet"
          description="Run your first meeting through the transcript wizard."
          action={
            <Button asChild>
              <Link href="/meetings/new">
                <Plus className="h-4 w-4" />
                File first minutes
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-muted">
                      {format(new Date(m.meeting_date), 'PPP')}
                      {m.meeting_type ? (
                        <span className="ml-2 text-xs font-normal text-muted-fg">
                          · {m.meeting_type}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-fg">
                      {m.attendees && m.attendees.length > 0
                        ? `${m.attendees.length} attendees`
                        : 'No attendee list'}
                    </p>
                  </div>
                  <Badge variant={m.status === 'approved' ? 'success' : 'outline'} size="sm">
                    {m.status ?? 'draft'}
                  </Badge>
                </div>
                {m.ai_summary ? (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-fg">
                    {m.ai_summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
