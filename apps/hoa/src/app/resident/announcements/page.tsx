import { CalendarClock, Megaphone } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Announcements' }

interface CommRow {
  id: string
  subject: string
  body_text: string | null
  body_html: string
  category: string
  sent_at: string | null
  created_at: string
}

const CATEGORY_LABEL: Record<string, string> = {
  welcome: 'Welcome',
  dues: 'Dues',
  meeting: 'Meeting',
  violation: 'Violation',
  arc: 'ARC',
  financial: 'Financial',
  emergency: 'Emergency',
  announcement: 'Announcement',
  custom: 'Custom',
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export default async function ResidentAnnouncementsPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('communications' as never)
    .select('id, subject, body_text, body_html, category, sent_at, created_at')
    .eq('organization_id', org.id)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(50)

  const comms = (data ?? []) as unknown as CommRow[]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" aria-hidden />
            Announcements
          </span>
        }
        description="Recent communications from your board."
      />

      {comms.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" aria-hidden />}
          title="No announcements yet"
          description="When the board sends a communication, it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {comms.map((c) => {
            const body = c.body_text ?? stripHtml(c.body_html)
            const dateStr = c.sent_at ?? c.created_at
            return (
              <li key={c.id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-base">{c.subject}</CardTitle>
                      <Badge variant="outline" size="sm">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {format(new Date(dateStr), 'PPp')}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm">{body}</p>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
