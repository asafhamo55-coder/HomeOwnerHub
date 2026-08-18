import Link from 'next/link'
import {
  Bell,
  CheckCheck,
  Eye,
  Mail,
  MessageSquare,
  Plus,
  Reply,
  Send,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Select } from '@homeowner-portal/ui'
import { LocalDateTime } from '@/components/ui/LocalDateTime'
import { getPrimaryAssociation } from '@/lib/vendors'
import { listCommunications } from '@/lib/communications/queries'
import { pickDisplaySubject } from '@/lib/communications/display'

export const metadata = { title: 'Communications' }
export const dynamic = 'force-dynamic'

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

/** Icon per channel, so the row is scannable without reading the word
 *  "EMAIL" in every line. Ordered — a multi-channel comm shows the icon
 *  of the first channel it actually used. */
const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  portal: Bell,
}

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  portal: 'Portal',
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
            {comms.map((c) => {
              // What a resident actually received, not the template. Exact
              // when every recipient got the same rendered subject;
              // otherwise per-recipient fields fall back to labels and the
              // row is marked personalized rather than implying one value.
              const subject = pickDisplaySubject({
                subject: c.subject,
                associationName: assoc.name,
                renderedSubjects: c.renderedSubjects,
              })
              const failed = c.failedCount > 0

              return (
                <li key={c.id}>
                  <Link
                    href={`/communications/${c.id}`}
                    className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-background/50"
                  >
                    <ChannelTile channels={c.channels} failed={failed} />

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate font-medium text-foreground">
                          {subject.text}
                        </p>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          {subject.personalizedFields.length > 0 ? (
                            <Badge
                              variant="neutral"
                              size="sm"
                              title={`Each recipient saw their own ${subject.personalizedFields
                                .map((f) => f.replace(/_/g, ' '))
                                .join(', ')}.`}
                            >
                              Personalized
                            </Badge>
                          ) : null}
                          <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'} size="sm">
                            {STATUS_LABEL[c.status] ?? c.status}
                          </Badge>
                        </div>
                      </div>

                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                        <span className="font-medium text-foreground/70">
                          {CATEGORY_LABEL[c.category] ?? c.category}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{c.channels.map((ch) => CHANNEL_LABEL[ch] ?? ch).join(' + ')}</span>
                        {c.audience_summary ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{c.audience_summary}</span>
                          </>
                        ) : null}
                        <span aria-hidden>·</span>
                        {c.sent_at ? (
                          <LocalDateTime iso={c.sent_at} variant="short" prefix="sent" />
                        ) : c.scheduled_for ? (
                          <LocalDateTime
                            iso={c.scheduled_for}
                            variant="short"
                            prefix="scheduled"
                          />
                        ) : (
                          <LocalDateTime iso={c.created_at} variant="date-only" />
                        )}
                      </p>

                      {c.totalRecipients > 0 ? (
                        <DeliveryBar
                          sent={c.sentCount}
                          failed={c.failedCount}
                          total={c.totalRecipients}
                          opened={c.openedCount}
                          replied={c.repliedCount}
                        />
                      ) : null}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

/**
 * The channel glyph, tinted red when any recipient failed. The tint is
 * the point: a row reading "10 of 47 delivered · 37 failed" used to sit
 * at exactly the same visual weight as one that reached everybody.
 */
function ChannelTile({ channels, failed }: { channels: string[]; failed: boolean }) {
  const Icon = CHANNEL_ICON[channels[0]] ?? Mail
  return (
    <span
      className={
        failed
          ? 'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700'
          : 'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600'
      }
      aria-hidden
    >
      <Icon className="h-4 w-4" />
    </span>
  )
}

/**
 * Delivery as a proportion rather than a fraction to be parsed.
 *
 * `total` is the number of communication_recipients rows, which can be
 * lower than the headline audience count: send.ts skips a recipient with
 * no address on the chosen channel. Percentages are therefore of what was
 * attempted, and the counts are shown alongside so the bar is never the
 * only source of the number.
 */
function DeliveryBar({
  sent,
  failed,
  total,
  opened,
  replied,
}: {
  sent: number
  failed: number
  total: number
  opened: number
  replied: number
}) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  return (
    <div className="space-y-1">
      <div
        className="flex h-1 w-full overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${sent} of ${total} delivered, ${failed} failed`}
      >
        <span className="bg-emerald-500" style={{ width: `${pct(sent)}%` }} />
        <span className="bg-red-500" style={{ width: `${pct(failed)}%` }} />
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        <Send className="h-3 w-3" aria-hidden />
        <span>
          {sent} of {total} delivered
        </span>
        {opened > 0 ? (
          <>
            <span aria-hidden>·</span>
            <Eye className="h-3 w-3" aria-hidden />
            <span>{opened} opened</span>
          </>
        ) : null}
        {replied > 0 ? (
          <>
            <span aria-hidden>·</span>
            <Reply className="h-3 w-3" aria-hidden />
            <span>{replied} replied</span>
          </>
        ) : null}
        {failed > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="font-medium text-destructive">{failed} failed</span>
          </>
        ) : null}
      </p>
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
