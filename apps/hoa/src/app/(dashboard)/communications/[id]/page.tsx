import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CheckCircle2, Eye, MailX, Reply, Sparkles, Users } from 'lucide-react'
import {
  Alert,
  Badge,
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
import { COMMUNICATION_CATEGORY, DELIVERY_STATUS, communicationStatusBadge } from '@/lib/status/community'
import {
  followUpAudience,
  groupRecipientsByHome,
  homeLabel,
  openedHint,
  resultsHeadline,
  rollupByHome,
  type HomeChannelChip,
  type HomeGroup,
} from '@/lib/communications/results'
import { draftHref } from '@/lib/communications/drafts'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { smsConfigured } from '@/lib/sms'
import { CommunicationActions } from './CommunicationActions'
import { FollowUpActions } from './FollowUpActions'

export const metadata = { title: 'Message' }

type Recipient = CommunicationDetail['recipients'][number]
type Home = HomeGroup<Recipient> & { label: string | null }

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'Text',
  portal: 'Portal',
  mail: 'Mail',
}

/** Recipient views, applied per home: a home shows when any of its rows
 *  match. "Problems" is what a board opens this page to find. */
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

const HOMES_PER_PAGE = 50

/** Units are read in chunks so the id list stays well inside a URL. */
const UNIT_CHUNK = 150

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
  // BL-102 A9: a draft has no results; it opens in the composer.
  if (comm.status === 'draft') redirect(draftHref(comm.id))

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

  // BL-102 A8: recipients grouped by home, one table row each, with the
  // per-channel rows on expand. Every row is loaded (counts above are over
  // all of them); the table filters and pages the homes in memory via the URL.
  const unitAddress = await loadUnitAddresses(comm.recipients)
  const homes: Home[] = groupRecipientsByHome(comm.recipients).map((g) => ({
    ...g,
    label: g.unitId ? homeLabel(unitAddress.get(g.unitId)) : null,
  }))
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : 'all'
  const homesIn = (v: View) => homes.filter((h) => h.rows.some(VIEWS[v].match))
  const viewHomes = homesIn(view)
  const page = parsePageParam(sp.page)
  const pageHomes = viewHomes.slice((page - 1) * HOMES_PER_PAGE, page * HOMES_PER_PAGE)
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

  const columns: DataTableColumn<Home>[] = [
    {
      key: 'home',
      header: 'Home',
      mobilePrimary: true,
      cell: (h) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {h.label ?? h.names[0] ?? (h.unitId ? 'Home' : 'Recipient')}
          </p>
          {h.label && h.names.length > 0 ? (
            <p className="truncate text-xs text-muted">{h.names.join(', ')}</p>
          ) : h.names.length > 1 ? (
            <p className="truncate text-xs text-muted">{h.names.slice(1).join(', ')}</p>
          ) : null}
          {h.unitId ? null : <p className="text-xs text-muted">Not linked to a home</p>}
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-primary">
              {h.rows.length === 1 ? 'Delivery details' : `Delivery details (${h.rows.length})`}
              {/* Every row has this summary; say whose it is. */}
              <span className="sr-only">{` for ${h.label ?? h.names[0] ?? 'this recipient'}`}</span>
            </summary>
            <ul className="mt-2 space-y-2 border-l border-border pl-3">
              {h.rows.map((r) => (
                <RecipientDetail key={r.id} r={r} displaySubject={displaySubject.text} />
              ))}
            </ul>
          </details>
        </div>
      ),
    },
    {
      key: 'channels',
      header: 'Channels',
      cell: (h) => (
        <ul className="flex flex-wrap gap-1.5" aria-label="Channels">
          {h.channels.map((c) => (
            <li key={c.channel}>
              <ChannelChip chip={c} />
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: 'last',
      header: 'Last activity',
      className: 'whitespace-nowrap text-foreground-secondary',
      cell: (h) => <LastActivity rows={h.rows} />,
    },
  ]

  return (
    <Page
      width="wide"
      linkAs={Link}
      breadcrumbs={[{ label: 'Messages', href: '/communications' }, { label: displaySubject.text }]}
      title={displaySubject.text}
      meta={
        <>
          <StatusBadge {...communicationStatusBadge(comm)} />
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
          hint={openedHint(emailOpened)}
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
              <FollowUpActions commId={comm.id} count={followUp.unitIds.length} textingReady={textingReady} />
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
            Homes <span className="num font-normal text-muted">({homes.length})</span>
          </h2>
          {comm.recipients.length > 0 ? (
            <FilterChips
              label="Filter recipients"
              linkAs={Link}
              items={(Object.keys(VIEWS) as View[]).map((v) => ({
                label: VIEWS[v].label,
                href: hrefFor(v),
                active: view === v,
                count: homesIn(v).length,
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
            caption="Homes and delivery status, one row per home"
            columns={columns}
            rows={pageHomes}
            rowKey={(h) => h.key}
            mobile="cards"
            empty={
              <EmptyState
                variant="compact"
                title={`No homes: ${VIEWS[view].label.toLowerCase()}`}
                description="Nothing in this view."
              />
            }
            footer={
              viewHomes.length > HOMES_PER_PAGE ? (
                <Pager
                  page={page}
                  pageSize={HOMES_PER_PAGE}
                  total={viewHomes.length}
                  rowCount={pageHomes.length}
                  hrefFor={(p) => hrefFor(view, p)}
                  linkAs={Link}
                  noun="homes"
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

/** The most recent thing that happened to these rows, with its time. */
function LastActivity({ rows }: { rows: readonly Recipient[] }) {
  const events: [string, string][] = []
  for (const r of rows) {
    const candidates: [string, string | null][] = [
      ['Failed', r.failed_at],
      ['Replied', r.replied_at],
      ['Opened', r.opened_at],
      ['Delivered', r.delivered_at],
      ['Sent', r.sent_at],
    ]
    for (const [label, at] of candidates) if (at) events.push([label, at])
  }
  const latest = events.sort((a, b) => b[1].localeCompare(a[1]))[0]
  if (!latest) return <span className="text-muted">—</span>
  return <LocalDateTime iso={latest[1]} variant="short" prefix={latest[0]} />
}

const REACHED = new Set(['sent', 'delivered', 'opened', 'clicked', 'replied'])

/**
 * One channel of one home: "Email: Opened", "Texted", "In portal". A text
 * or portal row is never "not opened" (BL-102 A8).
 */
function chipLabel(c: HomeChannelChip): string {
  const status = DELIVERY_STATUS.labels[c.status] ?? c.status
  const base =
    c.channel === 'sms' && REACHED.has(c.status)
      ? 'Texted'
      : c.channel === 'portal' && REACHED.has(c.status)
        ? 'In portal'
        : `${CHANNEL_LABEL[c.channel] ?? c.channel}: ${status}`
  return c.count > 1 ? `${base} ×${c.count}` : base
}

function ChannelChip({ chip }: { chip: HomeChannelChip }) {
  return (
    <StatusBadge
      status={chip.status}
      tones={DELIVERY_STATUS.tones}
      labels={{ [chip.status]: chipLabel(chip) }}
    />
  )
}

/** The per-channel row, as the table showed it before homes were grouped. */
function RecipientDetail({ r, displaySubject }: { r: Recipient; displaySubject: string }) {
  return (
    <li className="space-y-0.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-foreground">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
        <StatusBadge status={r.delivery_status} tones={DELIVERY_STATUS.tones} labels={DELIVERY_STATUS.labels} />
      </p>
      <p className="truncate text-muted">
        {r.recipient_name ?? 'Resident'}
        {' · '}
        {r.channel === 'email' ? (r.email ?? '—') : r.channel === 'sms' ? (r.phone ?? '—') : 'Portal'}
      </p>
      {/* Null means unknown (pre-dates rendered_subject, or the render
          threw) — not empty, so it stays silent rather than showing "—". */}
      {r.rendered_subject && r.rendered_subject !== displaySubject ? (
        <p className="max-w-xs truncate text-muted" title={r.rendered_subject}>
          Subject: {r.rendered_subject}
        </p>
      ) : null}
      {r.error_message ? <p className="max-w-[20rem] text-danger">{r.error_message}</p> : null}
      <p className="text-foreground-secondary">
        <LastActivity rows={[r]} />
      </p>
    </li>
  )
}

/**
 * Each home's address for the grouped table. A failed read only costs the
 * address (homes then show the resident's name), never the results.
 */
async function loadUnitAddresses(
  recipients: readonly Recipient[],
): Promise<Map<string, { address_line1: string | null; unit_number: string | null }>> {
  const ids = [...new Set(recipients.map((r) => r.unit_id).filter((x): x is string => Boolean(x)))]
  const out = new Map<string, { address_line1: string | null; unit_number: string | null }>()
  if (ids.length === 0) return out
  const supabase = await getSupabaseServerClient()
  for (let i = 0; i < ids.length; i += UNIT_CHUNK) {
    const res = await loadOrFail(
      'home addresses',
      supabase.from('units').select('id, address_line1, unit_number').in('id', ids.slice(i, i + UNIT_CHUNK)),
    )
    if (!res.ok) return out
    for (const u of (res.data ?? []) as { id: string; address_line1: string | null; unit_number: string | null }[]) {
      out.set(u.id, { address_line1: u.address_line1, unit_number: u.unit_number })
    }
  }
  return out
}
