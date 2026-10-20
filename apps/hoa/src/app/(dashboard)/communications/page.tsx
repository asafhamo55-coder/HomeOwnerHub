import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import { AlertTriangle, Bell, Eye, Mail, MessageSquare, Plus, Reply, Send, SearchX } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChips,
  Kpi,
  ListToolbar,
  LoadFailed,
  Page,
  Pager,
  StatusBadge,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { LocalDateTime } from '@/components/ui/LocalDateTime'
import { getPrimaryAssociation } from '@/lib/vendors'
import { countDrafts, listCommunications, type CommunicationSummary } from '@/lib/communications/queries'
import { draftHref, draftTitle } from '@/lib/communications/drafts'
import { DeleteDraftButton } from './DeleteDraftButton'
import { pickDisplaySubject } from '@/lib/communications/display'
import { COMMUNICATION_CATEGORY, COMMUNICATION_STATUS, communicationStatusBadge } from '@/lib/status/community'
import { CategoryFilter } from './CategoryFilter'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'
import { getCurrentUserRole } from '@/lib/auth'
import { activeMessagesTab, canSeeInboxTab } from '@/lib/messages/tabs'
import { MessagesTabs } from '@/components/messages/MessagesTabs'
import { NewMessageMenu } from '@/components/messages/NewMessageMenu'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  BROADCAST_DRAFT_LABEL,
  combinedDraftCount,
  listWaitingReplyDrafts,
  type ReplyDraftItem,
  type ReplyDraftsResult,
} from '@/lib/messages/drafts'

export const metadata = { title: 'Messages' }
export const dynamic = 'force-dynamic'

/** Icon per channel, so a row is scannable without reading "Email" each time. */
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

/**
 * Status chips on the "Sent to residents" tab, in the order a board thinks
 * about them. Drafts are their own Messages tab (BL-102 A11), so they are
 * not a chip here; A9 already keeps them out of "All".
 */
const STATUS_FILTERS = ['scheduled', 'sent', 'failed'] as const

const STATUS_CHIP_LABEL: Record<(typeof STATUS_FILTERS)[number], string> = {
  scheduled: COMMUNICATION_STATUS.labels.scheduled,
  sent: COMMUNICATION_STATUS.labels.sent,
  failed: COMMUNICATION_STATUS.labels.failed,
}

interface PageProps {
  searchParams: Promise<{ category?: string; status?: string; page?: string }>
}

// Was a silent `.limit(100)` inside listCommunications.
const PAGE_SIZE = 100

type Row = CommunicationSummary & { displaySubject: ReturnType<typeof pickDisplaySubject> }

export default async function CommunicationsPage({ searchParams }: PageProps) {
  const assoc = await timed('/communications', 'communications.association', () => getPrimaryAssociation())
  if (!assoc) {
    return (
      <Page title="Messages" width="narrow">
        <EmptyState
          icon={<MessageSquare aria-hidden />}
          title="No HOA association configured"
          description="Set up an association before sending communications."
          action={
            <Button asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const sp = await searchParams
  // Memoized per request (lib/orgs), so the Inbox-tab gate costs no query.
  const roleCtx = await getCurrentUserRole()
  const showInboxTab = canSeeInboxTab(roleCtx?.role)
  const category = sp.category && sp.category in COMMUNICATION_CATEGORY ? sp.category : undefined
  const status = sp.status && sp.status in COMMUNICATION_STATUS.labels ? sp.status : undefined
  const page = parsePageParam(sp.page)
  const showingDrafts = status === 'draft'
  // Inbox reply drafts waiting for the board (BL-102 A11 step 4). Read only
  // for roles that can read the inbox, with the inbox's org scope; they feed
  // the Drafts tab and its badge on every Messages tab of this page.
  const replyDraftsRead: Promise<ReplyDraftsResult | null> =
    showInboxTab && roleCtx
      ? getSupabaseServerClient().then((db) => listWaitingReplyDrafts(db, roleCtx.org.id))
      : Promise.resolve(null)
  const [result, draftCount, replyDrafts] = await Promise.all([
    timed('/communications', 'communications.list', () =>
      listCommunications(assoc.id, {
        category,
        status,
        // Drafts never count in the list's delivery figures (BL-102 A9).
        excludeDrafts: true,
        page,
        pageSize: PAGE_SIZE,
      }),
    ),
    countDrafts(assoc.id),
    replyDraftsRead,
  ])
  const replyDraftRows: ReplyDraftItem[] = replyDrafts?.ok ? replyDrafts.rows : []
  const allDraftsCount = combinedDraftCount(draftCount, replyDrafts?.ok ? replyDrafts.rows.length : null)
  const comms = result.ok ? result.rows : []
  const total = result.ok ? result.total : 0
  const filtered = Boolean(category || status)

  const hrefFor = (next: { status?: string; page?: number }): string => {
    const q = new URLSearchParams()
    if (category) q.set('category', category)
    if (next.status) q.set('status', next.status)
    if (next.page && next.page > 1) q.set('page', String(next.page))
    const qs = q.toString()
    return qs ? `/communications?${qs}` : '/communications'
  }

  // Delivery figures are summed over the rows on THIS page. When that is not
  // every matching message, the tiles say so instead of passing a page's
  // sums off as totals.
  const summaryIsPartial = total > comms.length
  const scope = summaryIsPartial ? `on this page (${comms.length} of ${total})` : null
  const attempted = comms.reduce((s, c) => s + c.totalRecipients, 0)
  const delivered = comms.reduce((s, c) => s + c.sentCount, 0)
  const opened = comms.reduce((s, c) => s + c.openedCount, 0)
  const replies = comms.reduce((s, c) => s + c.repliedCount, 0)
  const failedRecipients = comms.reduce((s, c) => s + c.failedCount, 0)
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')

  const rows: Row[] = comms.map((c) => ({
    ...c,
    // What a resident actually received, not the template. Exact when
    // every recipient got the same rendered subject; otherwise the row is
    // marked personalized rather than implying one value. A draft shows
    // what the board typed, or "Untitled draft".
    displaySubject:
      c.status === 'draft'
        ? { text: draftTitle(c.subject), exact: true, personalizedFields: [] }
        : pickDisplaySubject({
            subject: c.subject,
            associationName: assoc.name,
            renderedSubjects: c.renderedSubjects,
          }),
  }))

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'message',
      header: 'Message',
      mobilePrimary: true,
      cell: (c) => {
        const Icon = CHANNEL_ICON[c.channels[0]] ?? Mail
        return (
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={
                c.failedCount > 0
                  ? 'mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-lg bg-danger-subtle text-danger sm:flex'
                  : 'mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted sm:flex'
              }
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={c.status === 'draft' ? draftHref(c.id) : `/communications/${c.id}`}
                  className="font-medium text-foreground no-underline hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {c.displaySubject.text}
                </Link>
                {c.displaySubject.personalizedFields.length > 0 ? (
                  <Badge
                    variant="neutral"
                    title={`Each recipient saw their own ${c.displaySubject.personalizedFields
                      .map((f) => f.replace(/_/g, ' '))
                      .join(', ')}.`}
                  >
                    Personalized
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {c.status === 'draft' ? `${BROADCAST_DRAFT_LABEL} · ` : null}
                {COMMUNICATION_CATEGORY[c.category] ?? c.category}
                {' · '}
                {c.channels.map((ch) => CHANNEL_LABEL[ch] ?? ch).join(' + ')}
                {c.audience_summary ? ` · ${c.audience_summary}` : ''}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <StatusBadge {...communicationStatusBadge(c)} />
      ),
    },
    {
      key: 'delivery',
      header: 'Delivery',
      className: 'min-w-[12rem]',
      cell: (c) =>
        c.status === 'draft' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="xs">
              <Link href={draftHref(c.id)}>Resume</Link>
            </Button>
            <DeleteDraftButton draftId={c.id} title={c.displaySubject.text} size="xs" />
          </div>
        ) : c.totalRecipients > 0 ? (
          <DeliveryBar
            sent={c.sentCount}
            failed={c.failedCount}
            total={c.totalRecipients}
            opened={c.openedCount}
            replied={c.repliedCount}
          />
        ) : (
          <span className="text-xs text-muted">Not sent yet</span>
        ),
    },
    {
      key: 'date',
      header: 'Date',
      className: 'whitespace-nowrap text-foreground-secondary',
      cell: (c) =>
        c.sent_at ? (
          <LocalDateTime iso={c.sent_at} variant="short" prefix="Sent" />
        ) : c.scheduled_for ? (
          <LocalDateTime iso={c.scheduled_for} variant="short" prefix="Scheduled" />
        ) : (
          <LocalDateTime iso={c.created_at} variant="date-only" prefix={c.status === 'draft' ? 'Started' : 'Created'} />
        ),
    },
  ]

  return (
    <Page
      width="wide"
      title="Messages"
      description={
        showingDrafts
          ? 'Messages to residents you started and haven’t sent yet.'
          : 'Every message sent to your community — welcomes, dues reminders, violation notices, ARC decisions and announcements — with who received it.'
      }
      actions={<NewMessageMenu />}
      tabs={
        <MessagesTabs
          active={activeMessagesTab('/communications', status)}
          showInbox={showInboxTab}
          draftCount={allDraftsCount}
        />
      }
    >
      {!result.ok ? (
        <LoadFailed what="communications" />
      ) : total === 0 && !filtered && !draftCount ? (
        <EmptyState
          icon={<Mail aria-hidden />}
          title="No messages yet"
          secondaryAction={<HowThisWorks href={guideHref('communications-send-announcement')} />}
          description="Pick a template and who it goes to, write the message, then review and send. Every message and its delivery history will live here."
          action={
            <Button asChild>
              <Link href="/communications/new">
                <Plus aria-hidden />
                Send your first message
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {showingDrafts ? (
            <>
              <p className="text-sm text-foreground-secondary">
                Messages you started and haven’t sent. They save as you type, nobody receives them, and they aren’t
                counted in delivery results. Open one to finish it, or delete it.
                {replyDraftRows.length > 0
                  ? ' Email replies waiting for you are listed first; each opens its conversation in the Inbox.'
                  : null}
              </p>
              {replyDrafts && page === 1 ? (
                <ReplyDraftsSection result={replyDrafts} rows={replyDraftRows} />
              ) : null}
            </>
          ) : (
          <section aria-label="Delivery summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Messages"
              icon={<Mail />}
              value={total}
              hint={filtered ? 'matching these filters' : 'all time'}
            />
            <Kpi
              label="Delivered"
              icon={<Send />}
              value={attempted > 0 ? pct(delivered, attempted) : '—'}
              hint={attempted > 0 ? `${delivered} of ${attempted} recipients${scope ? ` ${scope}` : ''}` : 'Nothing sent in this view'}
            />
            <Kpi
              label="Opened"
              icon={<Eye />}
              value={delivered > 0 ? pct(opened, delivered) : '—'}
              hint={`${opened} opened · ${replies} ${replies === 1 ? 'reply' : 'replies'}${scope ? ` ${scope}` : ''}`}
            />
            <Kpi
              label="Failed"
              icon={<AlertTriangle />}
              value={failedRecipients}
              hint={
                failedRecipients > 0
                  ? `recipients bounced or failed${scope ? ` ${scope}` : ''}`
                  : `no failures${scope ? ` ${scope}` : ''}`
              }
            />
          </section>
          )}

          <ListToolbar>
            {showingDrafts ? null : (
              <FilterChips
                label="Filter by status"
                linkAs={Link}
                items={[
                  { label: 'All', href: hrefFor({}), active: !status },
                  ...STATUS_FILTERS.map((s) => ({
                    label: STATUS_CHIP_LABEL[s],
                    href: hrefFor({ status: s }),
                    active: status === s,
                  })),
                ]}
              />
            )}
            <CategoryFilter category={category} status={status} />
          </ListToolbar>

          <DataTable
            caption={showingDrafts ? 'Messages to many homes' : 'Sent to residents'}
            showCaption={showingDrafts && replyDraftRows.length > 0}
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            mobile="cards"
            empty={
              <EmptyState
                variant="compact"
                icon={<SearchX aria-hidden />}
                title={
                  showingDrafts
                    ? replyDraftRows.length > 0
                      ? 'No messages to many homes in progress'
                      : 'No drafts'
                    : 'No messages match these filters'
                }
                description={
                  showingDrafts
                    ? 'A message to many homes saves here as a draft until you send it.'
                    : 'Try another status or category.'
                }
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/communications">Clear filters</Link>
                  </Button>
                }
              />
            }
            footer={
              total <= PAGE_SIZE && page === 1 ? undefined : (
                <Pager
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  rowCount={comms.length}
                  hrefFor={(p) => hrefFor({ status, page: p })}
                  linkAs={Link}
                  noun="messages"
                />
              )
            }
          />
        </>
      )}
    </Page>
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
    <div className="space-y-1.5 text-left">
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-subtle"
        role="img"
        aria-label={`${sent} of ${total} delivered, ${failed} failed`}
      >
        <span className="bg-success-solid" style={{ width: `${pct(sent)}%` }} />
        <span className="bg-danger-solid" style={{ width: `${pct(failed)}%` }} />
      </div>
      <p className="num flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        <span>
          {sent}/{total} delivered
        </span>
        {opened > 0 ? (
          <>
            <span aria-hidden>·</span>
            <Eye className="size-3" aria-hidden />
            <span>
              {opened}
              <span className="sr-only"> opened</span>
            </span>
          </>
        ) : null}
        {replied > 0 ? (
          <>
            <span aria-hidden>·</span>
            <Reply className="size-3" aria-hidden />
            <span>
              {replied}
              <span className="sr-only"> replied</span>
            </span>
          </>
        ) : null}
        {failed > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="font-medium text-danger">{failed} failed</span>
          </>
        ) : null}
      </p>
    </div>
  )
}

/**
 * Inbox reply drafts on the Drafts tab (BL-102 A11 step 4): one row per
 * open conversation whose newest draft is still waiting for the board.
 * Each opens the conversation, where the draft is reviewed and sent.
 */
function ReplyDraftsSection({ result, rows }: { result: ReplyDraftsResult; rows: ReplyDraftItem[] }) {
  if (!result.ok) return <LoadFailed what="reply drafts" hint="Messages to many homes are listed below." />
  if (rows.length === 0) return null
  const columns: DataTableColumn<ReplyDraftItem>[] = [
    {
      key: 'message',
      header: 'Message',
      mobilePrimary: true,
      cell: (d) => (
        <div className="min-w-0">
          <Link
            href={d.href}
            className="font-medium text-foreground no-underline hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {d.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            Email reply to one resident{d.subject ? ` · ${d.subject}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (d) => (
        <Button asChild variant="secondary" size="xs">
          <Link href={d.href}>Review reply</Link>
        </Button>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      className: 'whitespace-nowrap text-foreground-secondary',
      cell: (d) => <LocalDateTime iso={d.createdAt} variant="short" prefix="Drafted" />,
    },
  ]
  return (
    <DataTable
      caption="Replies waiting for you"
      showCaption
      columns={columns}
      rows={rows}
      rowKey={(d) => d.draftId}
      mobile="cards"
    />
  )
}
