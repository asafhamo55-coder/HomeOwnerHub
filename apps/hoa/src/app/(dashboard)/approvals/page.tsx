import Link from 'next/link'
import { CheckCircle2, Inbox as InboxIcon, Sparkles } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
  Tabs,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listVendorsResult } from '@/lib/vendors'
import { loadW18Section, loadW3Section } from '@/lib/approvals-inbox/load'
import {
  APPROVAL_SOURCES,
  SOURCE_META,
  buildInbox,
  parseApprovalFilter,
  vendorSection,
  type ApprovalFilter,
  type InboxItem,
  type InboxSection,
} from '@/lib/approvals-inbox/model'
import { formatStamp, usd } from '@/lib/money/format'
import { ApprovalActions } from './ApprovalActions'

export const metadata = { title: 'Approvals' }
export const dynamic = 'force-dynamic'

// BL-014: every AI-proposed action waiting on the board, in one place.
// Each source is read where its module keeps it and decided by that
// module's own action (lib/approvals-inbox). A source that fails to load
// shows "Couldn't load" in its own section; the others still render.

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  // Board/admin only. The dashboard layout already sends residents away;
  // this keeps the page safe if it is ever mounted elsewhere.
  const { org } = await requireBoardOrAdmin()
  const filter = parseApprovalFilter((await searchParams).type)
  const supabase = await getSupabaseServerClient()

  const [w18, w3, vendors] = await Promise.all([
    loadW18Section(supabase, org.id),
    loadW3Section(supabase, org.id),
    listVendorsResult().then(vendorSection, () => ({ source: 'vendor', ok: false }) as const),
  ])
  const inbox = buildInbox([w18, w3, vendors], filter)

  const tabs = [
    { label: 'All', href: '/approvals', active: filter === 'all', badge: inbox.total || null },
    ...APPROVAL_SOURCES.map((s) => ({
      label: SOURCE_META[s].tab,
      href: `/approvals?type=${s}`,
      active: filter === s,
      badge: inbox.counts[s] || null,
    })),
  ]

  return (
    <Page
      title="Approvals"
      description="Everything the AI has proposed that needs a board decision — deposits to post, violation letters, vendors. Nothing here happens until someone approves it."
      linkAs={Link}
      meta={inbox.total ? <StatusPill tone="ai" label={`${inbox.total} waiting`} /> : undefined}
      tabs={<Tabs items={tabs} aria-label="Approval types" linkAs={Link} />}
    >
      {inbox.allClear ? (
        <EmptyState
          icon={<CheckCircle2 aria-hidden />}
          title="Nothing waiting on the board"
          description="New AI proposals — deposit matches, violation drafts, vendor results — land here for a decision."
          action={
            <Button asChild variant="secondary">
              <Link href="/">Back to the dashboard</Link>
            </Button>
          }
        />
      ) : (
        inbox.sections.map((section) => <SourceSection key={section.source} section={section} filter={filter} />)
      )}
    </Page>
  )
}

function amountLabel(item: InboxItem): string | null {
  if (item.amount === null) return null
  return `${usd(item.amount)}${item.amountNote ? ` ${item.amountNote}` : ''}`
}

const COLUMNS: DataTableColumn<InboxItem>[] = [
  {
    key: 'item',
    header: 'Item',
    mobilePrimary: true,
    cell: (item) => (
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">{item.title}</p>
        {item.detail ? <p className="line-clamp-2 text-xs text-foreground-secondary">{item.detail}</p> : null}
        {item.reasoning ? (
          <p className="flex items-start gap-1.5 text-xs text-foreground-secondary">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent-fg" aria-hidden />
            <span className="line-clamp-3">
              <span className="sr-only">AI reasoning: </span>
              {item.reasoning}
            </span>
          </p>
        ) : null}
        {item.citations.length > 0 || item.confidenceLabel ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.citations.map((c) => (
              <Badge key={c} variant="neutral">
                {c}
              </Badge>
            ))}
            {item.confidenceLabel ? <span className="text-xs text-muted">{item.confidenceLabel}</span> : null}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    className: 'whitespace-nowrap',
    cell: (item) => amountLabel(item) ?? <span className="text-muted">—</span>,
  },
  {
    key: 'created',
    header: 'Waiting since',
    cell: (item) => <span className="whitespace-nowrap text-foreground-secondary">{formatStamp(item.createdAt)}</span>,
  },
  {
    key: 'actions',
    header: <span className="sr-only">Decision</span>,
    className: 'md:w-px md:whitespace-nowrap',
    cell: (item) => (
      <ApprovalActions decision={item.decision} title={item.title} amountLabel={amountLabel(item)} href={item.href} />
    ),
  },
]

function SourceSection({ section, filter }: { section: InboxSection; filter: ApprovalFilter }) {
  const meta = SOURCE_META[section.source]
  const headingId = `approvals-${section.source}`
  return (
    <section aria-labelledby={headingId}>
      <Card className="overflow-hidden">
        <CardHeader
          actions={section.ok && section.total > 0 ? <StatusPill tone="ai" size="sm" label={`${section.total} waiting`} /> : undefined}
        >
          <CardTitle as="h2" id={headingId}>
            {meta.title}
          </CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        {!section.ok ? (
          <div className="px-5 pb-5">
            <LoadFailed
              what={meta.what}
              retryHref={filter === 'all' ? '/approvals' : `/approvals?type=${section.source}`}
              hint="The other sections on this page loaded normally."
            />
          </div>
        ) : (
          <>
            {section.notesFailed ? (
              <div className="px-5 pb-4">
                <Alert variant="warning" title="Couldn’t load the AI’s notes">
                  The postings below are complete, but the matcher’s reasoning for them didn’t load. Check the matching queue before
                  approving.
                </Alert>
              </div>
            ) : null}
            <div className="border-t border-border">
              <DataTable
                framed={false}
                mobile="cards"
                caption={meta.title}
                columns={COLUMNS}
                rows={section.items}
                rowKey={(item) => item.id}
                empty={
                  <EmptyState
                    variant="compact"
                    icon={<InboxIcon aria-hidden />}
                    title="Nothing waiting here"
                    action={
                      <Button asChild size="sm" variant="secondary">
                        <Link href={meta.queueHref}>{meta.queueLabel}</Link>
                      </Button>
                    }
                  />
                }
                footer={
                  section.total > section.items.length ? (
                    <p className="px-5 py-3 text-xs text-muted">
                      Showing the oldest {section.items.length} of {section.total}.{' '}
                      <Link href={meta.queueHref} className="font-medium text-primary">
                        {meta.queueLabel}
                      </Link>{' '}
                      to see the rest.
                    </p>
                  ) : undefined
                }
              />
            </div>
          </>
        )}
      </Card>
    </section>
  )
}
