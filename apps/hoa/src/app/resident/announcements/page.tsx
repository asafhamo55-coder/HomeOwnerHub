import { CalendarClock, ExternalLink, Megaphone } from 'lucide-react'
import { format } from 'date-fns'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Announcements' }

interface UpdateRow {
  id: string
  headline: string
  summary: string
  action_items: string[] | null
  category: string | null
  effective_date: string | null
  source_url: string | null
  posted_at: string
}

export default async function ResidentAnnouncementsPage() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('state_law_updates' as never)
    .select(
      'id, headline, summary, action_items, category, effective_date, source_url, posted_at',
    )
    .is('archived_at', null)
    .order('posted_at', { ascending: false })
    .limit(50)

  const updates = (data ?? []) as unknown as UpdateRow[]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" aria-hidden />
            Announcements
          </span>
        }
        description="Recent updates that affect your association and what to do about them."
      />

      <Alert variant="info" title="Informational only">
        <span className="block text-sm">
          Announcements posted here are informational and are not legal advice.
          If a notice affects your specific situation, contact your board or
          a licensed attorney.
        </span>
      </Alert>

      {updates.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" aria-hidden />}
          title="No announcements yet"
          description="When your board posts an update it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {updates.map((u) => (
            <li key={u.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-base">{u.headline}</CardTitle>
                    {u.effective_date ? (
                      <Badge variant="warning" size="sm">
                        <CalendarClock className="mr-1 h-3 w-3" />
                        Effective {format(new Date(u.effective_date), 'PP')}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">
                    {format(new Date(u.posted_at), 'PP')}
                    {u.category ? ` · ${u.category}` : ''}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm">{u.summary}</p>
                  {u.action_items && u.action_items.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        What to do
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {u.action_items.map((it, i) => (
                          <li key={i}>{it}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {u.source_url ? (
                    <a
                      href={u.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
