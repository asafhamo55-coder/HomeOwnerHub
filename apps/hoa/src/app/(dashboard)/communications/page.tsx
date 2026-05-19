import Link from 'next/link'
import { CheckCheck, Eye, Mail, MessageSquare, Plus, Reply, Send } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState, Select } from '@homeowner-portal/ui'
import { getPrimaryAssociation } from '@/lib/vendors'
import { listCommunications } from '@/lib/communications/queries'

export const metadata = { title: 'Communications' }

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

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  draft: 'outline',
  scheduled: 'warning',
  sending: 'warning',
  sent: 'success',
  failed: 'destructive',
  cancelled: 'outline',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

interface PageProps {
  searchParams: Promise<{ category?: string; status?: string }>
}

export default async function CommunicationsPage({ searchParams }: PageProps) {
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden />}
          title="No HOA association configured"
          description="Set up an association before sending communications."
        />
      </div>
    )
  }

  const sp = await searchParams
  const comms = await listCommunications(assoc.id, {
    category: sp.category,
    status: sp.status,
  })

  // Top-of-page summary numbers — only count fully-sent comms so a draft
  // doesn't inflate the "delivery rate" reading.
  const sentRecipients = comms.reduce((s, c) => s + c.sentCount, 0)
  const totalRecipients = comms.reduce((s, c) => s + c.totalRecipients, 0)
  const totalOpened = comms.reduce((s, c) => s + c.openedCount, 0)
  const totalReplies = comms.reduce((s, c) => s + c.repliedCount, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Communications</h1>
          <p className="text-sm text-muted">
            Every message sent to your community — welcomes, dues reminders,
            violation notices, ARC decisions, and ad-hoc announcements.
          </p>
        </div>
        <Button asChild>
          <Link href="/communications/new">
            <Plus className="h-4 w-4" />
            New message
          </Link>
        </Button>
      </header>

      {comms.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={<Send className="h-4 w-4" />}
            label="Sent"
            value={String(sentRecipients)}
            hint={`of ${totalRecipients} recipient${totalRecipients === 1 ? '' : 's'}`}
          />
          <SummaryCard
            icon={<Eye className="h-4 w-4" />}
            label="Opened"
            value={String(totalOpened)}
            hint={sentRecipients > 0 ? `${Math.round((totalOpened / sentRecipients) * 100)}% open rate` : '—'}
          />
          <SummaryCard
            icon={<Reply className="h-4 w-4" />}
            label="Replies"
            value={String(totalReplies)}
            hint={totalReplies === 1 ? 'response' : 'responses'}
          />
          <SummaryCard
            icon={<CheckCheck className="h-4 w-4" />}
            label="Messages"
            value={String(comms.length)}
            hint={`${comms.filter((c) => c.status === 'sent').length} sent`}
          />
        </div>
      ) : null}

      <Card>
        <form className="flex flex-wrap items-end gap-3 px-4 py-3">
          <div className="flex w-full flex-col gap-1 sm:w-52">
            <label htmlFor="filter-category" className="text-xs font-medium text-muted">
              Category
            </label>
            <Select
              id="filter-category"
              name="category"
              defaultValue={sp.category ?? ''}
              placeholder="All categories"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-52">
            <label htmlFor="filter-status" className="text-xs font-medium text-muted">
              Status
            </label>
            <Select
              id="filter-status"
              name="status"
              defaultValue={sp.status ?? ''}
              placeholder="All statuses"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm">
            Filter
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/communications">Reset</Link>
          </Button>
        </form>
      </Card>

      {comms.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-10 w-10" aria-hidden />}
          title="No messages yet"
          description="Send your first communication. Choose a topic, pick the audience, pick a template, and ship — the history of every message lives here."
          action={
            <Button asChild>
              <Link href="/communications/new">
                <Plus className="h-4 w-4" />
                Send first message
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {comms.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/communications/${c.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{c.subject}</p>
                    <p className="text-xs text-muted">
                      {CATEGORY_LABEL[c.category] ?? c.category}
                      {c.audience_summary ? ` · ${c.audience_summary}` : ''}
                      {c.sent_at
                        ? ` · sent ${format(new Date(c.sent_at), 'PP p')}`
                        : c.scheduled_for
                          ? ` · scheduled ${format(new Date(c.scheduled_for), 'PP p')}`
                          : ` · ${format(new Date(c.created_at), 'PP')}`}
                    </p>
                    {c.totalRecipients > 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        <Send className="mr-1 inline h-3 w-3" />
                        {c.sentCount}/{c.totalRecipients} sent
                        {c.openedCount > 0 ? <> · <Eye className="mr-1 inline h-3 w-3" />{c.openedCount} opened</> : null}
                        {c.repliedCount > 0 ? <> · <Reply className="mr-1 inline h-3 w-3" />{c.repliedCount} replied</> : null}
                        {c.failedCount > 0 ? (
                          <> · <span className="text-destructive">{c.failedCount} failed</span></>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
                      {c.channels.join(' · ')}
                    </span>
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'} size="sm">
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          {icon}
          {label}
        </div>
        <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
    </Card>
  )
}
