import Link from 'next/link'
import { Briefcase, ClipboardList, Home, Megaphone, MessageSquare, Sparkles, Wallet } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { getResidentSummary } from '@/lib/resident'

export const metadata = { title: 'My Home' }

export default async function ResidentDashboard() {
  const summary = await getResidentSummary()

  const description = `${summary.associationName ?? summary.orgName ?? 'Your community'}${
    summary.units.length > 0
      ? ` · ${summary.units.length} unit${summary.units.length === 1 ? '' : 's'} on file`
      : ''
  }`

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="My Home" description={description} />

      {summary.units.length === 0 ? (
        <EmptyState
          icon={<Home className="h-10 w-10" aria-hidden />}
          title="No unit linked to your account yet"
          description="Your HOA administrator hasn't linked this account to a unit. Reach out to them so the rest of the resident portal can be activated for you."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My units</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.units.map((u) => (
                <li
                  key={u.unit_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-foreground/5 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{u.unit_number ?? '(no unit number)'}</p>
                    {u.address ? <p className="text-xs text-muted">{u.address}</p> : null}
                  </div>
                  <Badge variant="outline" size="sm">
                    {u.ownership_pct ? `${u.ownership_pct}% owner` : 'Owner'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          icon={<Wallet className="h-4 w-4 text-primary" />}
          title="Dues"
          description="Check your current balance and payment history."
          cta="View dues"
          href="/resident/dues"
        />
        <ActionCard
          icon={<Megaphone className="h-4 w-4 text-primary" />}
          title="Announcements"
          description="Recent community updates from the board."
          cta="Read updates"
          href="/resident/announcements"
          badge={summary.recentAnnouncements > 0 ? `${summary.recentAnnouncements} new` : null}
        />
        <ActionCard
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          title="Ask the Docs"
          description="Get cited answers from your governing documents."
          cta="Ask a question"
          href="/resident/ask"
        />
        <ActionCard
          icon={<ClipboardList className="h-4 w-4 text-primary" />}
          title="ARC application"
          description="Submit a request for an architectural change (fence, paint, addition)."
          cta="Start application"
          href="/resident/arc/new"
        />
        <ActionCard
          icon={<Briefcase className="h-4 w-4 text-primary" />}
          title="Report a concern"
          description="Submit a violation report or community concern to the board."
          cta="Submit report"
          href="/resident/report-violation"
        />
        <ActionCard
          icon={<MessageSquare className="h-4 w-4 text-primary" />}
          title="Tickets"
          description="Open a support ticket or check the status of an existing one."
          cta="My tickets"
          href="/resident/tickets"
        />
      </div>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  description,
  cta,
  href,
  badge,
}: {
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  href: string
  badge?: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {badge ? <Badge variant="warning" size="sm">{badge}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted">{description}</p>
        <Link
          href={href}
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          {cta} →
        </Link>
      </CardContent>
    </Card>
  )
}
