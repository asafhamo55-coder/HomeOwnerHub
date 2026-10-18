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
import { loadArcSection, loadBillSection, loadVendorCountsByAssociation, loadW18Section, loadW3Section } from '@/lib/approvals-inbox/load'
import {
  APPROVAL_SOURCES,
  SOURCE_META,
  buildInbox,
  parseApprovalFilter,
  vendorSection,
  type ApprovalFilter,
  type AssociationVendorCount,
  type InboxItem,
  type InboxSection,
} from '@/lib/approvals-inbox/model'
import { formatStamp, usd } from '@/lib/money/format'
import { loadBillEditOptions } from '@/lib/bill-scan/load'
import { vendorLabel } from '@/lib/bill-scan/proposal'
import { ApprovalActions } from '@/components/approvals/ApprovalActions'
import { ArcReviewActions } from '@/components/arc-review/ArcReviewActions'
import { BillDetails } from './BillDetails'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'

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

  const [w18, bills, w3, arc, vendors, byAssociation] = await Promise.all([
    loadW18Section(supabase, org.id),
    loadBillSection(supabase, org.id)
      .then((s) => withBillLinks(supabase, s))
      .then((s) => withBillEditOptions(supabase, org.id, s)),
    loadW3Section(supabase, org.id),
    loadArcSection(supabase, org.id),
    listVendorsResult().then(vendorSection, () => ({ source: 'vendor', ok: false }) as const),
    loadVendorCountsByAssociation(supabase, org.id),
  ])
  const inbox = buildInbox([w18, bills, w3, arc, vendors], filter)

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
      description="Everything the AI has proposed that needs a board decision — deposits to post, bills to enter, violation letters, ARC reviews, vendors. Nothing here happens until someone approves it."
      linkAs={Link}
      meta={inbox.total ? <StatusPill tone="ai" label={`${inbox.total} waiting`} /> : undefined}
      tabs={<Tabs items={tabs} aria-label="Approval types" linkAs={Link} />}
    >
      {inbox.allClear ? (
        <EmptyState
          icon={<CheckCircle2 aria-hidden />}
          title="Nothing waiting on the board"
          secondaryAction={<HowThisWorks href={guideHref('approvals-queue')} />}
          description="New AI proposals — deposit matches, scanned bills, violation drafts, ARC reviews, vendor results — land here for a decision."
          action={
            <Button asChild variant="secondary">
              <Link href="/">Back to the dashboard</Link>
            </Button>
          }
        />
      ) : (
        inbox.sections.map((section) => (
          <SourceSection
            key={section.source}
            section={section}
            filter={filter}
            byAssociation={section.source === 'vendor' ? byAssociation : undefined}
          />
        ))
      )}
    </Page>
  )
}

/**
 * BL-021: a short-lived link to each uploaded bill so the approver can
 * check the AI against it. Signed with the board member's own client
 * (hoa-documents is org-prefix scoped); a signing failure just omits the
 * link — the card says the bill isn't available rather than hiding that.
 */
async function withBillLinks(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  section: InboxSection,
): Promise<InboxSection> {
  if (!section.ok) return section
  const items = await Promise.all(
    section.items.map(async (item) => {
      const path = item.bill?.payload.storagePath
      if (!item.bill || !path) return item
      const { data, error } = await supabase.storage.from('hoa-documents').createSignedUrl(path, 10 * 60)
      // No link on failure; BillDetails then says the bill isn't available.
      if (error || !data) return item
      return { ...item, bill: { ...item.bill, documentUrl: data.signedUrl } }
    }),
  )
  return { ...section, items }
}

/**
 * BL-059: the vendors and expense accounts Edit details offers, loaded once
 * per association the waiting bills belong to (almost always one). A failed
 * load leaves editOptions null; the card then says editing is unavailable.
 */
async function withBillEditOptions(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  section: InboxSection,
): Promise<InboxSection> {
  if (!section.ok) return section
  const ids = [...new Set(section.items.flatMap((i) => (i.bill ? [i.bill.payload.associationId] : [])))]
  if (ids.length === 0) return section
  const loaded = new Map(
    await Promise.all(
      ids.map(async (id) => {
        const r = await loadBillEditOptions(supabase, orgId, id)
        return [
          id,
          r.ok
            ? {
                vendors: r.vendors.map((v) => ({ id: v.id, label: vendorLabel(v) })),
                accounts: r.accounts.map((a) => ({ id: a.id, label: `${a.accountNumber} — ${a.accountName}` })),
                today: r.today,
              }
            : null,
        ] as const
      }),
    ),
  )
  return {
    ...section,
    items: section.items.map((item) =>
      item.bill ? { ...item, bill: { ...item.bill, editOptions: loaded.get(item.bill.payload.associationId) ?? null } } : item,
    ),
  }
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
        {item.bill ? <BillDetails bill={item.bill} approvalRequestId={item.id} /> : null}
        {item.arc && item.arc.conditions.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground-secondary" aria-label="Suggested conditions">
            {item.arc.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        {item.arc?.warnings.map((w) => (
          <p key={w} className="text-xs text-warning">
            {w}
          </p>
        ))}
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
    cell: (item) =>
      item.arc ? (
        // BL-027: decided by the existing ARC actions; the AI draft only pre-fills the text.
        <div className="flex flex-col items-end gap-2">
          <ArcReviewActions arcId={item.arc.arcId} title={item.title} drafts={item.arc.drafts} suggestion={item.arc.suggestion} />
          <Link href={item.href} className="text-xs font-medium text-primary">
            Open application
          </Link>
        </div>
      ) : (
        <ApprovalActions
          decision={item.decision?.kind === 'arc' ? null : item.decision}
          title={item.title}
          amountLabel={amountLabel(item)}
          href={item.href}
        />
      ),
  },
]

/**
 * BL-048: in a multi-association org, how many vendors need the board in
 * each association. The list shows the primary association only (vendor
 * compliance is per association), so the others are counted, not hidden.
 */
function AssociationCounts({ result }: { result: { ok: true; rows: AssociationVendorCount[] } | { ok: false } }) {
  if (!result.ok) {
    return <p className="text-xs text-muted">Couldn’t load the per-association vendor counts.</p>
  }
  if (result.rows.length === 0) return null
  const primary = result.rows.find((r) => r.primary)
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted" id="approvals-vendor-assoc">
        Waiting by association{primary ? ` — the list shows ${primary.name}` : ''}
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-labelledby="approvals-vendor-assoc">
        {result.rows.map((r) => (
          <li key={r.associationId}>
            <Badge variant={r.primary ? 'default' : 'neutral'}>
              {r.name}
              <span className="num">&nbsp;·&nbsp;{r.count === null ? 'couldn’t count' : r.count}</span>
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SourceSection({
  section,
  filter,
  byAssociation,
}: {
  section: InboxSection
  filter: ApprovalFilter
  byAssociation?: { ok: true; rows: AssociationVendorCount[] } | { ok: false }
}) {
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
        {byAssociation && (!byAssociation.ok || byAssociation.rows.length > 0) ? (
          <div className="px-5 pb-4">
            <AssociationCounts result={byAssociation} />
          </div>
        ) : null}
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
