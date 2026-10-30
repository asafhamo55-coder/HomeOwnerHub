import { Suspense, cache } from 'react'
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
  Skeleton,
  StatusPill,
  Tabs,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { timed } from '@/lib/perf/timing'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { authSubmitterEmails } from '@/lib/contact-updates/submitter-email'
import { listVendorsResult } from '@/lib/vendors'
import { loadArcSection, loadBillSection, loadContactSection, loadJoinSection, loadLetterSection, loadOpeningSection, loadProSection, loadVendorCountsByAssociation, loadW18Section, loadW3Section } from '@/lib/approvals-inbox/load'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import {
  APPROVAL_SOURCES,
  SOURCE_META,
  buildInbox,
  decisionId,
  parseApprovalFilter,
  vendorSection,
  type ApprovalFilter,
  type ApprovalSource,
  type AssociationVendorCount,
  type Inbox,
  type InboxItem,
  type InboxSection,
} from '@/lib/approvals-inbox/model'
import { formatStamp, usd } from '@/lib/money/format'
import { loadBillEditOptions } from '@/lib/bill-scan/load'
import { vendorLabel } from '@/lib/bill-scan/proposal'
import { SummaryStrip } from './SummaryStrip'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { ApprovalActions } from '@/components/approvals/ApprovalActions'
import { BulkApproveProvider, BulkRowCheckbox, BulkSelectAll } from '@/components/approvals/BulkApprove'
import { isBulkEligible, isBulkSource } from '@/lib/approvals-inbox/bulk'
import { ArcReviewActions } from '@/components/arc-review/ArcReviewActions'
import { BillDetails } from './BillDetails'
import { ContactDetails } from './ContactDetails'
import { JoinDetails } from './JoinDetails'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'

export const metadata = { title: 'Approvals' }
export const dynamic = 'force-dynamic'

// BL-014: every AI-proposed action waiting on the board, in one place.
// Each source is read where its module keeps it and decided by that
// module's own action (lib/approvals-inbox). A source that fails to load
// shows "Couldn't load" in its own section; the others still render.

// ── Per-source loaders (BL-099) ────────────────────────────────────────
// Each source is read once per request (React cache()) and timed. The
// page streams: a section renders as soon as ITS source is in, and only
// the parts that genuinely need every source — the tab badges, the
// "N waiting" pill, inbox zero — wait for all of them.
const R = '/approvals'
type Db = Awaited<ReturnType<typeof getSupabaseServerClient>>
const db = (): Promise<Db> => getSupabaseServerClient()

const SOURCE_LOADERS: Record<ApprovalSource, (orgId: string, orgName: string) => Promise<InboxSection>> = {
  w18: cache((orgId: string) => timed(R, 'approvals.w18', async () => loadW18Section(await db(), orgId))),
  bill: cache((orgId: string) =>
    timed(R, 'approvals.bill', async () => {
      const supabase = await db()
      return loadBillSection(supabase, orgId)
        .then((s) => withBillLinks(supabase, s))
        .then((s) => withBillEditOptions(supabase, orgId, s))
    }),
  ),
  opening: cache((orgId: string) => timed(R, 'approvals.opening', async () => loadOpeningSection(await db(), orgId))),
  w3: cache((orgId: string) => timed(R, 'approvals.w3', async () => loadW3Section(await db(), orgId))),
  collections: cache((orgId: string) => timed(R, 'approvals.collections', async () => loadLetterSection(await db(), orgId))),
  arc: cache((orgId: string, orgName: string) =>
    timed(R, 'approvals.arc', async () => loadArcSection(await db(), orgId, { associationName: orgName })),
  ),
  contact: cache((orgId: string) => timed(R, 'approvals.contact', async () => loadContactSection(await db(), orgId, { submitterEmails: authSubmitterEmails }))),
  join: cache((orgId: string) => timed(R, 'approvals.join', async () => loadJoinSection(await db(), orgId))),
  pro: cache((orgId: string) => timed(R, 'approvals.pro', async () => loadProSection(await db(), orgId))),
  vendor: cache(() =>
    timed(R, 'approvals.vendor', () =>
      listVendorsResult().then(vendorSection, () => ({ source: 'vendor', ok: false }) as const),
    ),
  ),
}

/** The tabs and sections shown: the professionals' one only once M6 is applied (BL-168). */
const VISIBLE_SOURCES = APPROVAL_SOURCES.filter((s) => s !== 'pro' || M6_APPLIED)

const vendorCountsByAssociation = cache((orgId: string) =>
  timed(R, 'approvals.vendorCountsByAssociation', async () => loadVendorCountsByAssociation(await db(), orgId)),
)

/** Every source, for what needs them all. Same memoized reads as the sections. */
const allSections = cache((orgId: string, orgName: string) =>
  Promise.all(APPROVAL_SOURCES.map((s) => SOURCE_LOADERS[s](orgId, orgName))),
)

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  // Board/admin only. The dashboard layout already sends residents away;
  // this keeps the page safe if it is ever mounted elsewhere.
  const { org } = await requireBoardOrAdmin()
  const filter = parseApprovalFilter((await searchParams).type)
  const shown = filter === 'all' ? VISIBLE_SOURCES : VISIBLE_SOURCES.filter((s) => s === filter)

  // Start every read now, so the tabs, the pill and the sections all wait
  // on reads that are already in flight.
  // (.catch only keeps a rejection from being "unhandled" before a
  // component awaits it; each component still sees the same outcome.)
  allSections(org.id, org.name).catch(() => {})
  vendorCountsByAssociation(org.id).catch(() => {})

  return (
    <Page
      title="Approvals"
      description="Everything waiting on a board decision — deposits to post, bills to enter, violation and collections letters, ARC reviews, residents’ contact updates, requests to join, vendors. Nothing here happens until someone approves it."
      linkAs={Link}
      meta={
        <Suspense fallback={null}>
          <WaitingPill orgId={org.id} orgName={org.name} />
        </Suspense>
      }
      tabs={
        <div className="space-y-6">
          <Suspense fallback={<SummaryStrip inbox={null} sections={[]} timeZone={DEFAULT_ASSOCIATION_TIME_ZONE} />}>
            <StreamedSummary orgId={org.id} orgName={org.name} />
          </Suspense>
          <Suspense fallback={<ApprovalTabs filter={filter} inbox={null} />}>
            <StreamedTabs orgId={org.id} orgName={org.name} filter={filter} />
          </Suspense>
        </div>
      }
    >
      <Suspense fallback={null}>
        <InboxZero orgId={org.id} orgName={org.name} />
      </Suspense>
      <BulkApproveProvider>
        {shown.map((source) => (
          <Suspense key={source} fallback={<SourceSectionSkeleton source={source} />}>
            <StreamedSection source={source} orgId={org.id} orgName={org.name} filter={filter} />
          </Suspense>
        ))}
      </BulkApproveProvider>
    </Page>
  )
}

async function loadInbox(orgId: string, orgName: string, filter: ApprovalFilter) {
  return buildInbox(await allSections(orgId, orgName), filter)
}

async function WaitingPill({ orgId, orgName }: { orgId: string; orgName: string }) {
  const inbox = await loadInbox(orgId, orgName, 'all')
  return inbox.total ? <StatusPill tone="ai" label={`${inbox.total} waiting`} /> : null
}

/** The three counts above the tabs: the same memoized reads as the tabs and sections, no new query besides the cached association. */
async function StreamedSummary({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [sections, assoc] = await Promise.all([allSections(orgId, orgName), getPrimaryAssociationResult()])
  const timeZone = (assoc.ok && assoc.data?.timeZone) || DEFAULT_ASSOCIATION_TIME_ZONE
  return <SummaryStrip inbox={buildInbox(sections, 'all')} sections={sections} timeZone={timeZone} />
}

async function StreamedTabs({ orgId, orgName, filter }: { orgId: string; orgName: string; filter: ApprovalFilter }) {
  return <ApprovalTabs filter={filter} inbox={await loadInbox(orgId, orgName, filter)} />
}

/** The tabs; badges only once every count is known (null = still loading). */
function ApprovalTabs({ filter, inbox }: { filter: ApprovalFilter; inbox: Inbox | null }) {
  const tabs = [
    { label: 'All', href: '/approvals', active: filter === 'all', badge: inbox?.total || null },
    ...VISIBLE_SOURCES.map((s) => ({
      label: SOURCE_META[s].tab,
      href: `/approvals?type=${s}`,
      active: filter === s,
      badge: inbox?.counts[s] || null,
    })),
  ]
  return <Tabs items={tabs} aria-label="Approval types" linkAs={Link} />
}

/** Inbox zero: only when every source loaded and every one is empty. */
async function InboxZero({ orgId, orgName }: { orgId: string; orgName: string }) {
  const inbox = await loadInbox(orgId, orgName, 'all')
  if (!inbox.allClear) return null
  return (
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
  )
}

async function StreamedSection({
  source,
  orgId,
  orgName,
  filter,
}: {
  source: ApprovalSource
  orgId: string
  orgName: string
  filter: ApprovalFilter
}) {
  const section = await SOURCE_LOADERS[source](orgId, orgName)
  // An empty section could still be part of inbox zero, where the page
  // shows one empty state instead of seven empty cards — so only an empty
  // section waits for the rest. Loaded-with-items and failed sections
  // render at once.
  if (section.ok && section.total === 0) {
    const inbox = await loadInbox(orgId, orgName, 'all')
    if (inbox.allClear) return null
  }
  const byAssociation = source === 'vendor' ? await vendorCountsByAssociation(orgId) : undefined
  return <SourceSection section={section} filter={filter} byAssociation={byAssociation} />
}

/** A section's card while its source loads: the real title, placeholder rows. */
function SourceSectionSkeleton({ source }: { source: ApprovalSource }) {
  const meta = SOURCE_META[source]
  return (
    <section aria-busy="true">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle as="h2">{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <div className="space-y-3 border-t border-border px-5 py-4">
          <span className="sr-only">Loading {meta.title}</span>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    </section>
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

/** Bulk approve (non-money sources only): the checkbox column, shown for those sections. */
const SELECT_COLUMN: DataTableColumn<InboxItem> = {
  key: 'select',
  header: <span className="sr-only">Select</span>,
  className: 'md:w-px',
  cell: (item) =>
    isBulkEligible(item) && item.decision && isBulkSource(item.source) ? (
      <BulkRowCheckbox source={item.source} id={decisionId(item.decision)} title={item.title} />
    ) : null,
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
        {item.contact ? <ContactDetails contact={item.contact} /> : null}
        {item.join ? <JoinDetails join={item.join} /> : null}
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
          <ArcReviewActions arcId={item.arc.arcId} title={item.title} drafts={item.arc.drafts} suggestion={item.arc.suggestion} compact />
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
  const bulkIds =
    section.ok && isBulkSource(section.source)
      ? section.items.flatMap((i) => (isBulkEligible(i) && i.decision ? [decisionId(i.decision)] : []))
      : []
  const columns = bulkIds.length > 0 ? [SELECT_COLUMN, ...COLUMNS] : COLUMNS
  return (
    <section aria-labelledby={headingId}>
      <Card className="overflow-hidden">
        <CardHeader
          actions={
            section.ok && section.total > 0 ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {bulkIds.length > 0 && isBulkSource(section.source) ? (
                  <BulkSelectAll source={section.source} ids={bulkIds} sectionTitle={meta.title} />
                ) : null}
                <StatusPill tone="ai" size="sm" label={`${section.total} waiting`} />
              </div>
            ) : undefined
          }
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
                columns={columns}
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
