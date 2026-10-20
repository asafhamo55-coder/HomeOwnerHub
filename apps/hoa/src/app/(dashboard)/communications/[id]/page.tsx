import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Eye, Mail, MailX, MessageSquareText, Reply, Sparkles, Users } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  FilterChips,
  Kpi,
  Page,
  Pager,
  StatusBadge,
  StatusPill,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { LocalDateTime } from '@/components/ui/LocalDateTime'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getCommunication, type CommunicationDetail } from '@/lib/communications/queries'
import { pickDisplaySubject, resolveHtmlForDisplay } from '@/lib/communications/display'
import { COMMUNICATION_CATEGORY, COMMUNICATION_STATUS, DELIVERY_STATUS } from '@/lib/status/community'
import { followUpAudience, resultsHeadline, rollupByHome } from '@/lib/communications/results'
import { smsConfigured } from '@/lib/sms'
import { CommunicationActions } from './CommunicationActions'

export const metadata = { title: 'Message' }

type Recipient = CommunicationDetail['recipients'][number]

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'Text',
  portal: 'Portal',
  mail: 'Mail',
}

/** Recipient views. "Problems" is what a board opens this page to find. */
const VIEWS = {
  all: { label: 'All', match: () => true },
  problems: {
    label: 'Failed',
    match: (r: Recipient) => ['failed', 'bounced', 'suppressed'].includes(r.delivery_status),
  },
  opened: {
    label: 'Opened',
    match: (r: Recipient) => ['opened', 'clicked', 'replied'].includes(r.delivery_status),
  },
  // BL-102 A8: email rows only. A text or portal row can never be
  // "opened", so counting them made every texted home look ignored.
  pending: {
    label: 'Email not opened',
    match: (r: Recipient) => r.channel === 'email' && ['sent', 'delivered'].includes(r.delivery_status),
  },
} as const
type View = keyof typeof VIEWS

const RECIPIENTS_PER_PAGE = 50

/** Point the typography plugin's colours at the theme tokens, so the body
 *  preview reads correctly in both themes with no per-theme class. */
const PROSE_TOKENS = [
  '[--tw-prose-body:hsl(var(--foreground))]',
  '[--tw-prose-headings:hsl(var(--foreground))]',
  '[--tw-prose-bold:hsl(var(--foreground))]',
  '[--tw-prose-links:hsl(var(--primary))]',
  '[--tw-prose-bullets:hsl(var(--muted))]',
  '[--tw-prose-counters:hsl(var(--muted))]',
  '[--tw-prose-quotes:hsl(var(--foreground-secondary))]',
  '[--tw-prose-quote-borders:hsl(var(--border))]',
  '[--tw-prose-hr:hsl(var(--border))]',
  '[--tw-prose-th-borders:hsl(var(--border))]',
  '[--tw-prose-td-borders:hsl(var(--border))]',
].join(' ')

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string; page?: string }>
}

export default async function CommunicationDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const assoc = await getPrimaryAssociation()
  if (!assoc) notFound()
  const comm = await getCommunication(assoc.id, id)
  if (!comm) notFound()

  // Subject/body are stored as templates ({{amount_summary}}, ...); resolve them
  // to what recipients actually saw before rendering, per communications/display.ts.
  const displaySubject = pickDisplaySubject({
    subject: comm.subject,
    associationName: assoc.name,
    renderedSubjects: comm.renderedSubjects,
  })
  const displayBody = resolveHtmlForDisplay(comm.body_html, { associationName: assoc.name })

  // Drives the resend button. Narrower than comm.failedCount, which also
  // counts bounces and non-email channels — neither of which
  // resendFailedRecipients will act on, so counting them here would label
  // the button with a number it cannot deliver.
  const failedEmailCount = comm.recipients.filter(
    (r) => r.channel === 'email' && r.delivery_status === 'failed',
  ).length

  // Recipients: every row is loaded (counts above are over all of them);
  // the table filters and pages that list in memory via the URL.
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : 'all'
  const viewRows = comm.recipients.filter(VIEWS[view].match)
  const page = parsePageParam(sp.page)
  const pageRows = viewRows.slice((page - 1) * RECIPIENTS_PER_PAGE, page * RECIPIENTS_PER_PAGE)
  const base = `/communications/${comm.id}`
  const hrefFor = (v: View, p = 1) => {
    const q = new URLSearchParams()
    if (v !== 'all') q.set('view', v)
    if (p > 1) q.set('page', String(p))
    const qs = q.toString()
    return `${qs ? `${base}?${qs}` : base}#recipients`
  }

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')

  // BL-102 A8: per home, not per row; email and text only count as
  // "delivered" (a portal row just sits in the portal).
  const rollup = rollupByHome(comm.recipients)
  const externalRows = comm.recipients.filter((r) => r.channel === 'email' || r.channel === 'sms')
  const externalReached = externalRows.filter((r) =>
    ['sent', 'delivered', 'opened', 'clicked', 'replied'].includes(r.delivery_status),
  ).length
  const emailRows = comm.recipients.filter((r) =>
    r.channel === 'email' && ['sent', 'delivered', 'opened', 'clicked', 'replied'].includes(r.delivery_status),
  )
  const emailOpened = emailRows.filter((r) => ['opened', 'clicked', 'replied'].includes(r.delivery_status)).length
  const followUp = comm.status === 'sent' ? followUpAudience(comm.audience_definition, rollup) : null
  const textingReady = smsConfigured()

  const columns: DataTableColumn<Recipient>[] = [
    {
      key: 'recipient',
      header: 'Recipient',
      mobilePrimary: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{r.recipient_name ?? 'Resident'}</p>
          <p className="truncate text-xs text-muted">
            {r.channel === 'email' ? r.email ?? '—' : r.channel === 'sms' ? r.phone ?? '—' : 'Portal'}
          </p>
          {/* Null means unknown (pre-dates rendered_subject, or the render
              threw) — not empty, so it stays silent rather than showing "—". */}
          {r.rendered_subject && r.rendered_subject !== displaySubject.text ? (
            <p className="mt-0.5 max-w-xs truncate text-xs text-muted" title={r.rendered_subject}>
              Subject: {r.rendered_subject}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      hideBelowLg: true,
      cell: (r) => <span className="text-foreground-secondary">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="space-y-1">
          <StatusBadge status={r.delivery_status} tones={DELIVERY_STATUS.tones} labels={DELIVERY_STATUS.labels} />
          {r.error_message ? <p className="max-w-[16rem] text-xs text-danger">{r.error_message}</p> : null}
        </div>
      ),
    },
    {
      key: 'last',
      header: 'Last activity',
      className: 'whitespace-nowrap text-foreground-secondary',
      cell: (r) => <LastActivity r={r} />,
    },
  ]

  return (
    <Page
      width="wide"
      linkAs={Link}
      breadcrumbs={[{ label: 'Communications', href: '/communications' }, { label: displaySubject.text }]}
      title={displaySubject.text}
      meta={
        <>
          <StatusBadge status={comm.status} tones={COMMUNICATION_STATUS.tones} labels={COMMUNICATION_STATUS.labels} />
          {!displaySubject.exact && displaySubject.personalizedFields.length > 0 ? (
            <Badge
              variant="neutral"
              title={`Each recipient saw their own ${displaySubject.personalizedFields.join(', ').replace(/_/g, ' ')} here`}
            >
              Personalized
            </Badge>
          ) : null}
          {comm.ai_generated ? <StatusPill tone="ai" label="AI drafted" icon={<Sparkles aria-hidden />} /> : null}
        </>
      }
      description={
        <>
          {COMMUNICATION_CATEGORY[comm.category] ?? comm.category}
          {' · '}
          {comm.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(' + ')}
          {' · '}
          {comm.sent_at ? (
            <LocalDateTime iso={comm.sent_at} variant="long" prefix="sent" />
          ) : comm.scheduled_for ? (
            <LocalDateTime iso={comm.scheduled_for} variant="long" prefix="scheduled for" />
          ) : (
            <LocalDateTime iso={comm.created_at} variant="long" prefix="created" />
          )}
          {comm.audience_summary ? ` · ${comm.audience_summary}` : ''}
          {comm.template ? ` · template: ${comm.template.name}` : ''}
        </>
      }
      actions={
        <CommunicationActions
          commId={comm.id}
          subject={displaySubject.text}
          failedEmailCount={failedEmailCount}
          status={comm.status}
        />
      }
    >
      {comm.status === 'scheduled' ? (
        <Alert variant="info" title="Scheduled, not sent yet">
          It goes out within 5 minutes of the scheduled time. Recipients were set when you scheduled this, so
          someone who moved in since won’t get it. Residents who opt out before then are skipped.
        </Alert>
      ) : null}
      <section aria-label="Delivery summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Delivered"
          icon={<CheckCircle2 />}
          value={externalRows.length > 0 ? pct(externalReached, externalRows.length) : '—'}
          hint={`${externalReached} of ${externalRows.length} emails and texts`}
        />
        <Kpi
          label="Opened"
          icon={<Eye />}
          value={emailRows.length > 0 ? pct(emailOpened, emailRows.length) : '—'}
          hint={`${emailOpened} emails opened (approximate)`}
        />
        <Kpi
          label="Replied"
          icon={<Reply />}
          value={comm.repliedCount}
          hint={comm.replies.length > 0 ? `${comm.replies.length} in the replies below` : 'no replies yet'}
        />
        <Kpi
          label="Failed"
          icon={<MailX />}
          value={comm.failedCount}
          hint={comm.failedCount > 0 ? 'bounced or failed — see below' : 'none'}
          href={comm.failedCount > 0 ? hrefFor('problems') : undefined}
          linkAs={Link}
        />
      </section>

      {comm.status === 'sent' && rollup.homes > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Did people get it?</CardTitle>
            <CardDescription>{resultsHeadline(rollup)}</CardDescription>
          </CardHeader>
          {followUp ? (
            <CardContent className="space-y-2">
              <p className="text-sm text-foreground-secondary">
                {followUp.unitIds.length} {followUp.unitIds.length === 1 ? 'home hasn’t' : 'homes haven’t'} opened the
                email. Opens are approximate: some mail apps open every email automatically, and some block the count.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <Link href={`/communications/new?followUp=${comm.id}&via=email`}>
                    <Mail aria-hidden />
                    Email again to the {followUp.unitIds.length} who haven’t opened
                  </Link>
                </Button>
                {textingReady ? (
                  <Button asChild variant="secondary">
                    <Link href={`/communications/new?followUp=${comm.id}&via=text`}>
                      <MessageSquareText aria-hidden />
                      Text them
                    </Link>
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                Opens a new message for you to check. Nothing is sent until you press Send.
              </p>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Message</CardTitle>
          <CardDescription>As residents received it.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`prose prose-sm max-w-none rounded-lg border border-border bg-background p-5 ${PROSE_TOKENS}`}>
            <div dangerouslySetInnerHTML={{ __html: displayBody.html }} />
          </div>
        </CardContent>
      </Card>

      <section id="recipients" className="scroll-mt-20 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Recipients <span className="num font-normal text-muted">({comm.recipients.length})</span>
          </h2>
          {comm.recipients.length > 0 ? (
            <FilterChips
              label="Filter recipients"
              linkAs={Link}
              items={(Object.keys(VIEWS) as View[]).map((v) => ({
                label: VIEWS[v].label,
                href: hrefFor(v),
                active: view === v,
                count: comm.recipients.filter(VIEWS[v].match).length,
              }))}
            />
          ) : null}
        </div>
        {comm.recipients.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden />}
            title={comm.status === 'draft' || comm.status === 'scheduled' ? 'Not sent yet' : 'No recipients'}
            description={
              comm.status === 'draft' || comm.status === 'scheduled'
                ? 'Recipients appear here, with delivery status, once the message goes out.'
                : 'Either the audience matched no units, or none had contact info on file for the chosen channel.'
            }
          />
        ) : (
          <DataTable
            caption="Recipients and delivery status"
            columns={columns}
            rows={pageRows}
            rowKey={(r) => r.id}
            mobile="cards"
            empty={
              <EmptyState
                variant="compact"
                title={`No ${VIEWS[view].label.toLowerCase()} recipients`}
                description="Nothing in this view."
              />
            }
            footer={
              viewRows.length > RECIPIENTS_PER_PAGE ? (
                <Pager
                  page={page}
                  pageSize={RECIPIENTS_PER_PAGE}
                  total={viewRows.length}
                  rowCount={pageRows.length}
                  hrefFor={(p) => hrefFor(view, p)}
                  linkAs={Link}
                  noun="recipients"
                />
              ) : undefined
            }
          />
        )}
      </section>

      {comm.replies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">
              Replies <span className="num font-normal text-muted">({comm.replies.length})</span>
            </CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border border-t border-border">
            {comm.replies.map((r) => (
              <li key={r.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {r.from_email ?? r.from_phone ?? 'Anonymous'}
                    {r.read_at ? null : <StatusPill tone="brand" label="Unread" icon={null} />}
                  </p>
                  <p className="text-xs text-muted">
                    <LocalDateTime iso={r.received_at} variant="long" />
                  </p>
                </div>
                {r.subject ? <p className="text-xs text-muted">Re: {r.subject}</p> : null}
                {r.ai_summary ? (
                  <p className="flex gap-2 rounded-lg bg-accent-subtle px-3 py-2 text-xs text-accent-fg">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      <span className="sr-only">AI summary: </span>
                      {r.ai_summary}
                    </span>
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-sm text-foreground">{r.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Page>
  )
}

/** The most recent thing that happened to this recipient, with its time. */
function LastActivity({ r }: { r: Recipient }) {
  const events: [string, string | null][] = [
    ['Failed', r.failed_at],
    ['Replied', r.replied_at],
    ['Opened', r.opened_at],
    ['Delivered', r.delivered_at],
    ['Sent', r.sent_at],
  ]
  const latest = events
    .filter((e): e is [string, string] => Boolean(e[1]))
    .sort((a, b) => b[1].localeCompare(a[1]))[0]
  if (!latest) return <span className="text-muted">—</span>
  return <LocalDateTime iso={latest[1]} variant="short" prefix={latest[0]} />
}
