import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, StatusBadge } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  getLatestDraft,
  getPropertyContext,
  getThreadDetail,
  getUnitLabel,
  listAttachableDocuments,
  listDraftAttachments,
  listThreads,
  INBOX_PAGE_SIZE,
  type InboxFilter,
  type PropertyContext,
} from '@/lib/inbox/queries'
import { INBOX_THREAD_STATUS } from '@/lib/status/community'
import { SplitPaneFrame } from '@/components/split-pane/SplitPane'
import { ThreadList } from '../ThreadList'
import { INBOX_FILTERS, INBOX_FILTER_LABEL } from '../InboxChrome'
import { DraftPanel } from './DraftPanel'
import { ForwardButton } from './ForwardButton'
import { MessageThread } from './MessageThread'
import { PropertyRail } from './PropertyRail'
import { VendorRail, type RailVendor } from './VendorRail'
import { VendorRequestButton } from './VendorRequestButton'
import { VendorRequestLinks } from './VendorRequestLinks'
import {
  getOutgoingVendorRequests,
  getIncomingVendorRequest,
} from '@/lib/inbox/vendor-request-links'
import { isVendorIncomplete } from '@/lib/inbox/vendor/schema'

export const dynamic = 'force-dynamic'

const FILTER_KEYS: InboxFilter[] = INBOX_FILTERS.map((f) => f.key)

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const { id } = await params
  const { filter: filterParam, page: pageParam } = await searchParams
  const filter = (FILTER_KEYS.find((f) => f === filterParam) ?? 'needs_review') as InboxFilter

  // Inbox tables are gated by auth_is_board_or_admin at the RLS layer
  // (migration 0029 + the inbox migrations); requireBoardOrAdmin matches
  // that bar exactly and redirects on failure, same as /inbox/page.tsx.
  const { org } = await requireBoardOrAdmin()

  const supabase = await getSupabaseServerClient()

  const thread = await getThreadDetail(supabase, org.id, id)
  if (!thread) notFound()

  // Same pagination math as /inbox/page.tsx — counts land first so the
  // page/offset this list paginates over can never disagree with the
  // filter-chip counts, and deep-linking into a thread with `?page=N`
  // still resolves the same list page ThreadList's own links carry.
  const counts = await countThreadsByStatus(supabase, org.id)
  const total = counts[filter] ?? 0
  const totalPages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE))
  const requestedPage = Number.parseInt(pageParam ?? '1', 10)
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1
  const offset = (page - 1) * INBOX_PAGE_SIZE

  const suggestedUnitId = (thread.matchReason?.candidate_unit_ids as string[] | undefined)?.[0]

  const [threads, contextOutcome, suggestedProperty, draft] = await Promise.all([
    listThreads(supabase, org.id, filter, INBOX_PAGE_SIZE, offset),
    thread.unitId
      ? getPropertyContext(supabase, org.id, thread.unitId).catch((error: unknown) => {
          // getPropertyContext throws on a failed unit lookup (see its
          // docstring) precisely so this catch can distinguish "context
          // failed to load" from "thread has no unitId" — collapsing
          // those would misrepresent a filed thread as unmatched, the
          // exact bug just fixed in ThreadList.tsx. Message bodies are
          // never part of this error; only ids and the thrown message.
          console.error('ThreadPage: failed to load property context', {
            threadId: id,
            unitId: thread.unitId,
            message: error instanceof Error ? error.message : 'unknown error',
          })
          return 'error' as const
        })
      : Promise.resolve(null),
    !thread.unitId && suggestedUnitId
      ? getUnitLabel(supabase, org.id, suggestedUnitId)
      : Promise.resolve(null),
    // Page-defining, same as thread/context above — a swallowed error here
    // would show a "Draft a reply" button beside a reply already queued to
    // send (see getLatestDraft's docstring), so this is not wrapped in a
    // `.catch` the way the enrichment-only lookups above are.
    getLatestDraft(supabase, org.id, id),
  ])

  const contextLoadFailed = contextOutcome === 'error'
  const context: PropertyContext | null = contextLoadFailed ? null : contextOutcome

  // Page-defining, like the draft itself: an approver must never see a
  // message that appears to have no files beside one that will send three.
  const draftAttachments = draft ? await listDraftAttachments(supabase, org.id, draft.id) : []

  const libraryFiles = await listAttachableDocuments(supabase, org.id).catch((error: unknown) => {
    // Enrichment, not page-defining: an empty picker is a smaller harm than
    // a blank thread page, and every other attachment source still works.
    console.error('ThreadPage: failed to load the document library', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return []
  })

  const threadFiles = thread.messages.flatMap((message) =>
    message.attachments
      .filter((file) => file.fetchStatus === 'stored')
      .map((file) => ({ id: file.id, fileName: file.fileName, sizeBytes: file.sizeBytes ?? 0 })),
  )

  // Vendor rail data. Org-scoped like every other read on this page — a
  // thread's vendor_id is a real FK, but the join must still be scoped
  // rather than trusted.
  let railVendor: RailVendor | null = null
  // Kept beside railVendor rather than added to it: RailVendor is the shape
  // VendorRail renders, and the rail has no reason to know an address it
  // never displays. This one prefills the vendor-request composer's "Send to".
  let vendorEmail: string | null = null
  // A failed vendor read must not render as "the vendor no longer exists"
  // (which invites a needless re-file): the rail says it couldn't load.
  let vendorLoadFailed = false
  if (thread.vendorId) {
    const { data: vendorRow, error: vendorError } = await supabase
      .from('vendors' as never)
      .select('id, legal_name, trades, status, ein, primary_email')
      .eq('id', thread.vendorId)
      .eq('organization_id', org.id)
      .maybeSingle<{
        id: string
        legal_name: string
        trades: string[] | null
        status: string
        ein: string | null
        primary_email: string | null
      }>()

    if (vendorError) {
      console.error('ThreadPage: failed to load the filed vendor', {
        threadId: id,
        code: vendorError.code,
      })
      vendorLoadFailed = true
    } else if (vendorRow) {
      railVendor = {
        vendorId: vendorRow.id,
        legalName: vendorRow.legal_name,
        trades: vendorRow.trades,
        status: vendorRow.status,
        incomplete: isVendorIncomplete({ ein: vendorRow.ein, trades: vendorRow.trades }),
      }
      vendorEmail = vendorRow.primary_email
    }
  }

  // Both link directions, resolved through inbox_drafts.source_thread_id and
  // gmail_message_id. Each returns empty/null on a failed read rather than
  // throwing — a missing cross-reference is cosmetic, an unrenderable thread
  // is not.
  const [outgoingRequests, incomingRequest] = await Promise.all([
    getOutgoingVendorRequests(supabase as never, org.id, thread.id),
    getIncomingVendorRequest(supabase as never, org.id, thread.id),
  ])

  // The sender the quick-create modal seeds from: the newest INBOUND
  // message, matching what W33 reads server-side.
  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === 'inbound')

  const rail = (
    <>
      <PropertyRail
        thread={thread}
        context={context}
        contextLoadFailed={contextLoadFailed}
        suggestedProperty={suggestedProperty}
      />
      {/* Sibling of PropertyRail, never nested: property and vendor filings
          are independent, and PropertyRail early-returns on unitId. */}
      <VendorRail
        thread={thread}
        vendor={railVendor}
        loadFailed={vendorLoadFailed}
        senderEmail={lastInbound?.fromEmail ?? null}
        senderName={lastInbound?.fromName ?? null}
      />
    </>
  )

  const listHref = `/inbox?filter=${filter}${page > 1 ? `&page=${page}` : ''}`
  const subject = thread.subject ?? '(no subject)'

  return (
    <SplitPaneFrame>
      <div className="flex min-h-0 flex-1">
        {/* pane 1 — list */}
        <aside
          aria-label="Conversations"
          className="hidden w-80 shrink-0 flex-col border-r border-border bg-surface lg:flex"
        >
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <Link
              href={listHref}
              className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-foreground no-underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {INBOX_FILTER_LABEL[filter]}
            </Link>
            <span className="num text-xs text-muted">{counts[filter] ?? 0}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">No other conversations in this view.</p>
            ) : (
              <ThreadList threads={threads} selectedId={thread.id} filter={filter} page={page} />
            )}
          </div>
        </aside>

        {/* pane 2 — conversation */}
        <section aria-label="Conversation" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
            <PageHeader
              breadcrumbs={[{ label: 'Inbox', href: listHref }, { label: subject }]}
              linkAs={Link}
              title={subject}
              meta={
                <StatusBadge
                  status={thread.status}
                  tones={INBOX_THREAD_STATUS.tones}
                  labels={INBOX_THREAD_STATUS.labels}
                />
              }
              description={`${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'}`}
              actions={
                <>
                  {/* In the header so a forward is reachable in every draft
                      state — in particular after a reply has already been
                      sent, the most common case there is. The draft's status
                      rides along so the button can explain itself while a
                      live draft would be displaced; the server action
                      refuses regardless. See ForwardButton. */}
                  <ForwardButton threadId={thread.id} draftStatus={draft?.status ?? null} />
                  {/* Forward sends the resident's own email onward, quoted.
                      This writes a fresh work order instead and starts its
                      own thread — see the vendor request composer spec, D1
                      and D3. */}
                  <VendorRequestButton
                    threadId={thread.id}
                    vendorEmail={vendorEmail}
                    draftStatus={draft?.status ?? null}
                  />
                </>
              }
            />

            <VendorRequestLinks outgoing={outgoingRequests} incoming={incomingRequest} />

            <MessageThread messages={thread.messages} />

            <DraftPanel
              threadId={thread.id}
              draft={draft}
              attachments={draftAttachments}
              threadFiles={threadFiles}
              libraryFiles={libraryFiles}
            />

            {/* Below xl the rail has no column of its own, so it follows the
                conversation. It used to be hidden outright, which meant a
                phone or tablet never saw the property context at all. */}
            <div className="overflow-hidden rounded-xl border border-border bg-surface xl:hidden">
              {rail}
            </div>
          </div>
        </section>

        {/* pane 3 — property + vendor rail */}
        <aside
          aria-label="Property and vendor"
          className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface xl:block"
        >
          {rail}
        </aside>
      </div>
    </SplitPaneFrame>
  )
}
