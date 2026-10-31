import Link from 'next/link'
import { ArrowLeft, ArrowRight, Home, MessageSquareReply, Sparkles } from 'lucide-react'
import { Alert, Button, EmptyState, PageHeader, Pager, StatusPill, cn } from '@homeowner-portal/ui'
import { LocalDateTime } from '@/components/ui/LocalDateTime'
import { SplitPaneFrame, SplitPaneHeader, SplitPanePlaceholder } from '@/components/split-pane/SplitPane'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import type { PropertyContext } from '@/lib/inbox/queries'
import {
  ANNOUNCEMENT_REPLIES_PAGE_SIZE,
  replyPreview,
  type AnnouncementReply,
} from '@/lib/messages/announcement-replies'
import { announcementReplyHref } from '@/lib/messages/tabs'
import { MessagesTabs } from './MessagesTabs'
import { NewMessageMenu } from './NewMessageMenu'
import { InboxSourceChips } from './InboxSourceChips'
import { usd } from '@/lib/money/format'

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', sms: 'Text', portal: 'Portal' }

/**
 * The Inbox tab's read-only "Replies to announcements" view (BL-102 A11,
 * Phase A). Same split-pane frame as the inbox list; the right pane shows
 * one reply, its home (dues, violations, ARC) and a link to the
 * announcement's results. No reply-from-here: answering goes through
 * New message → To one resident.
 */
export function AnnouncementReplies({
  replies,
  total,
  page,
  selected,
  home,
  homeFailed,
}: {
  replies: AnnouncementReply[]
  total: number
  page: number
  selected: AnnouncementReply | null
  home: PropertyContext | null
  homeFailed: boolean
}) {
  return (
    <SplitPaneFrame>
      <SplitPaneHeader>
        <PageHeader
          title="Messages"
          description="Residents’ replies to your announcements. Read-only here."
          actions={<NewMessageMenu />}
        />
        <MessagesTabs active="inbox" showInbox />
        <InboxSourceChips view="replies" />
      </SplitPaneHeader>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Replies to announcements"
          className={cn(
            'w-full shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex lg:w-[26rem]',
            selected ? 'hidden' : 'flex',
          )}
        >
          {replies.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<MessageSquareReply aria-hidden />}
              title="No replies yet"
              description="When a resident answers an announcement by email, the reply shows here."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/communications">See sent messages</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {replies.map((r) => {
                const active = selected?.id === r.id
                return (
                  <li key={r.id}>
                    <Link
                      href={announcementReplyHref(r.id, page)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'block space-y-1 px-4 py-3 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        active ? 'bg-primary-subtle' : 'hover:bg-subtle',
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-sm text-foreground', r.unread && 'font-semibold')}>
                          {/* Bold alone doesn't reach a screen reader. */}
                          {r.unread ? <span className="sr-only">Unread: </span> : null}
                          {r.from}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          <LocalDateTime iso={r.receivedAt} variant="short" />
                        </span>
                      </span>
                      <span className="block truncate text-xs text-foreground-secondary">
                        Re: {r.announcementSubject}
                      </span>
                      <span className="block truncate text-xs text-muted">{replyPreview(r)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          <Pager
            page={page}
            pageSize={ANNOUNCEMENT_REPLIES_PAGE_SIZE}
            total={total}
            rowCount={replies.length}
            hrefFor={(p) => (p > 1 ? `/inbox?view=replies&page=${p}` : '/inbox?view=replies')}
            linkAs={Link}
            noun="replies"
            className="mt-auto border-t border-border"
          />
        </aside>

        {selected ? (
          <ReplyDetail reply={selected} home={home} homeFailed={homeFailed} page={page} />
        ) : (
          <SplitPanePlaceholder
            icon={<MessageSquareReply aria-hidden />}
            title="Select a reply"
            hint="Read what the resident wrote, see their home at a glance, and jump to the announcement’s results."
          />
        )}
      </div>
    </SplitPaneFrame>
  )
}

function ReplyDetail({
  reply,
  home,
  homeFailed,
  page,
}: {
  reply: AnnouncementReply
  home: PropertyContext | null
  homeFailed: boolean
  page: number
}) {
  return (
    <section aria-label="Reply" className="flex min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row">
      <div className="min-w-0 flex-1 space-y-4 p-4 sm:p-6">
        <Link
          href={page > 1 ? `/inbox?view=replies&page=${page}` : '/inbox?view=replies'}
          className="inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All replies
        </Link>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Re: {reply.announcementSubject}</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-foreground-secondary">
            <span>{reply.from}</span>
            <span aria-hidden>·</span>
            <span>{CHANNEL_LABEL[reply.channel] ?? reply.channel}</span>
            <span aria-hidden>·</span>
            <LocalDateTime iso={reply.receivedAt} variant="long" />
            {reply.unread ? <StatusPill tone="brand" label="Unread" icon={null} /> : null}
          </p>
        </div>
        {reply.aiSummary ? (
          <p className="flex gap-2 rounded-lg bg-accent-subtle px-3 py-2 text-xs text-accent-fg">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="sr-only">AI summary: </span>
              {reply.aiSummary}
            </span>
          </p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm text-foreground">{reply.body}</p>
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/communications/${reply.communicationId}`}>See the announcement’s results</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/inbox/compose">Email this resident</Link>
          </Button>
        </div>
        <p className="text-xs text-muted">
          Replies to announcements are read-only here. To answer, send an email from the HOA mailbox.
        </p>
      </div>
      <aside aria-label="Home" className="shrink-0 border-t border-border bg-surface lg:w-80 lg:border-l lg:border-t-0">
        <HomePanel unitId={reply.unitId} home={home} failed={homeFailed} />
      </aside>
    </section>
  )
}

/** The reply's home at a glance: dues, violations, ARC (same facts as the inbox rail). */
function HomePanel({ unitId, home, failed }: { unitId: string | null; home: PropertyContext | null; failed: boolean }) {
  const label = <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Home</h3>
  if (!unitId) {
    return (
      <div className="space-y-2 p-4">
        {label}
        <p className="text-sm text-muted">This reply isn’t linked to a home.</p>
      </div>
    )
  }
  if (failed || !home) {
    return (
      <div className="space-y-2 p-4">
        {label}
        <Alert variant="warning" title="Home details unavailable">
          The home’s dues, violations and ARC couldn’t be loaded right now. Refresh to try again.
        </Alert>
      </div>
    )
  }
  const degraded = (k: PropertyContext['degraded'][number]) => home.degraded.includes(k)
  const address = `${home.address}${home.unitNumber ? ` #${home.unitNumber}` : ''}`
  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        {label}
        {home.propertyId ? (
          <Link
            href={propertyHref(asPropertyId(home.propertyId))}
            className="group flex items-start gap-2 rounded-lg no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Home className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-semibold text-foreground group-hover:text-primary">{address}</span>
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
          </Link>
        ) : (
          <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
            <Home className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            {address}
          </p>
        )}
      </div>
      <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
        <Fact label="Dues" failed={degraded('dues')}>
          {home.duesBalance > 0 ? (
            <StatusPill
              tone="danger"
              label={`${usd(home.duesBalance)} owed${home.duesOverdueCount > 0 ? ` · ${home.duesOverdueCount} overdue` : ''}`}
            />
          ) : (
            <StatusPill tone="success" label="Current" />
          )}
        </Fact>
        <Fact label="Open violations" failed={degraded('violations')}>
          {home.openViolations > 0 ? (
            <StatusPill tone="warning" label={String(home.openViolations)} />
          ) : (
            <span className="text-muted">None</span>
          )}
        </Fact>
        <Fact label="Open ARC" failed={degraded('arc')}>
          {home.openArcRequests.length > 0 ? (
            <ul className="space-y-1 text-right">
              {home.openArcRequests.map((a) => (
                <li key={a.id}>
                  <Link href={`/arc/${a.id}`} className="font-medium text-primary">
                    {a.summary}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">None</span>
          )}
        </Fact>
      </dl>
    </div>
  )
}

function Fact({ label, failed, children }: { label: string; failed: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">
        {failed ? <span className="text-xs font-medium text-warning">Couldn’t load</span> : children}
      </dd>
    </div>
  )
}
