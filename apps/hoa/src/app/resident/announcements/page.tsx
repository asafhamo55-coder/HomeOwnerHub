import { Megaphone } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Announcements' }
export const dynamic = 'force-dynamic'

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
    <div className="space-y-6">
      <ScreenHeader title="Announcements" subtitle="Recent updates from your board." />

      {comms.length === 0 ? (
        <ScreenEmpty
          icon={<Megaphone className="h-6 w-6" />}
          title="No announcements yet"
          description="When the board sends a communication, it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {comms.map((c) => {
            const body = c.body_text ?? stripHtml(c.body_html)
            const dateStr = c.sent_at ?? c.created_at
            return (
              <li key={c.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-[15px] font-semibold text-foreground">{c.subject}</h2>
                  <Badge variant="outline" size="sm">
                    {CATEGORY_LABEL[c.category] ?? c.category}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{format(new Date(dateStr), 'PPp')}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{body}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
