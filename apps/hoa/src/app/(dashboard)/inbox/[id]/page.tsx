import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, StatusBadge } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSignedInUser } from '@/lib/orgs'
import { timed } from '@/lib/perf/timing'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  getDraftById,
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
import { ThreadConnections } from './ContextSections'
import { getThreadRailContext } from '@/lib/inbox/thread-context'
import { VendorRail, type RailVendor } from './VendorRail'
import { VendorRequestButton } from './VendorRequestButton'
import { VendorRequestLinks } from './VendorRequestLinks'
import {
  getOutgoingVendorRequests,
  getIncomingVendorRequest,
} from '@/lib/inbox/vendor-request-links'
import { isVendorIncomplete } from '@/lib/inbox/vendor/schema'
import { loadAutoDraftDecision } from '@/lib/inbox/autodraft'
import { listAssignees, type Assignee } from '@/lib/inbox/assignees'
import { inboxQuery, neighbours, nextNeedingReply, parseOwnerFilter } from '@/lib/inbox/navigation'
import { loadInboxSlaHours, waitingInfo } from '@/lib/inbox/waiting'
import { InboxKeyboard } from '../InboxKeyboard'
import { ThreadTriageControls } from './ThreadTriageControls'
import { UndoSendBanner } from './UndoSendBanner'
import { ConvertMenu } from './ConvertMenu'
import { SENDER_AUTH_COLUMN_LIVE } from '@homeowner-portal/mailbox'
import {
  arcPrefillFromEmail,
  boardArcHref,
  contactPrefillFromEmail,
  ticketPrefillFromEmail,
} from '@/lib/inbox/convert/model'
import { arcAck } from '@/lib/inbox/convert/ack'
import { insertOnOpenText } from '@/lib/inbox/reply-insert'
import { contextStripModel } from '@/lib/inbox/mobile-strip'
import { ContextStrip, THREAD_CONTEXT_ANCHOR } from './ContextStrip'
import { MobileActionBar, REPLY_ANCHOR, THREAD_TOP_ANCHOR } from './MobileActionBar'
import { appUrl } from '@/lib/app-origin'

export const dynamic = 'force-dynamic'

const R = '/inbox/[id]'

/**
 * Start a read now and await it later (BL-099 static pass). The no-op
 * catch only marks the promise handled so a rejection that lands while
 * the page awaits something else is not reported as unhandled; awaiting
 * the returned promise still rethrows, exactly as an inline await did.
 */
function early<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {})
  return p
}

const FILTER_KEYS: InboxFilter[] = INBOX_FILTERS.map((f) => f.key)

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string; page?: string; owner?: string; undo?: string; from?: string; insert?: string }>
}) {
  const { id } = await params
  const {
    filter: filterParam,
    page: pageParam,
    owner: ownerParam,
    undo: undoParam,
    from: fromParam,
    insert: insertParam,
  } = await searchParams
  const filter = (FILTER_KEYS.find((f) => f === filterParam) ?? 'needs_review') as InboxFilter
  const owner = parseOwnerFilter(ownerParam)

  // Inbox tables are gated by auth_is_board_or_admin at the RLS layer
  // (migration 0029 + the inbox migrations); requireBoardOrAdmin matches
  // that bar exactly and redirects on failure, same as /inbox/page.tsx.
  const { org } = await requireBoardOrAdmin()

  const supabase = await getSupabaseServerClient()

  // The thread, the signed-in user and the chip counts do not depend on
  // each other's results (the counts need only the user id), so they are
  // read together rather than one after another (BL-099 static pass).
  const threadP = early(timed(R, 'inbox.thread', () => getThreadDetail(supabase, org.id, id)))

  // Mine / Unassigned / All (BL-101 A6) needs the signed-in member's id;
  // requireBoardOrAdmin returns only { role, org }. getSignedInUser is the
  // request-memoized getUser the layout already made.
  const user = await getSignedInUser()
  const currentUserId = user?.id ?? null
  const ownerScope = { owner, userId: currentUserId }

  // Same pagination math as /inbox/page.tsx — counts land first so the
  // page/offset this list paginates over can never disagree with the
  // filter-chip counts, and deep-linking into a thread with `?page=N`
  // still resolves the same list page ThreadList's own links carry.
  const countsP = early(timed(R, 'inbox.counts', () => countThreadsByStatus(supabase, org.id, ownerScope)))
  const thread = await threadP
  if (!thread) notFound()

  // Reads that need only the thread or the org. Started here and awaited
  // where they were before, so none of them waits for the reads above it.
  const autoDraftP = early(timed(R, 'inbox.autoDraft', () => loadAutoDraftDecision(supabase, org.id, id)))
  const assigneesP = listAssignees(org.id).catch((): Assignee[] => [])
  const slaP = early(loadInboxSlaHours(supabase, org.id))
  // The reply "Approve and send" just queued on the previous thread, so
  // its Undo survives the move here. Org-scoped like every read.
  const undoDraftP =
    undoParam && /^[0-9a-f-]{36}$/i.test(undoParam)
      ? getDraftById(supabase, org.id, undoParam).catch(() => null)
      : Promise.resolve(null)
  const libraryFilesP = timed(R, 'inbox.library', () => listAttachableDocuments(supabase, org.id)).catch(
    (error: unknown) => {
      // Enrichment, not page-defining: an empty picker is a smaller harm than
      // a blank thread page, and every other attachment source still works.
      console.error('ThreadPage: failed to load the document library', {
        message: error instanceof Error ? error.message : 'unknown error',
      })
      return []
    },
  )
  // Both link directions, resolved through inbox_drafts.source_thread_id and
  // gmail_message_id. Each returns empty/null on a failed read rather than
  // throwing — a missing cross-reference is cosmetic, an unrenderable thread
  // is not.
  const vendorLinksP = early(
    Promise.all([
      getOutgoingVendorRequests(supabase as never, org.id, thread.id),
      getIncomingVendorRequest(supabase as never, org.id, thread.id),
    ]),
  )
  // Vendor rail data. Org-scoped like every other read on this page — a
  // thread's vendor_id is a real FK, but the join must still be scoped
  // rather than trusted.
  const vendorReadP = thread.vendorId
    ? early(
        Promise.resolve(
          supabase
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
            }>(),
        ),
      )
    : null

  const counts = await countsP
  const total = counts[filter] ?? 0
  const totalPages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE))
  const requestedPage = Number.parseInt(pageParam ?? '1', 10)
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1
  const offset = (page - 1) * INBOX_PAGE_SIZE

  const suggestedUnitId = (thread.matchReason?.candidate_unit_ids as string[] | undefined)?.[0]

  const unitId = thread.unitId
  const contextOutcomeP = unitId
    ? timed(R, 'inbox.propertyContext', () => getPropertyContext(supabase, org.id, unitId)).catch(
        (error: unknown) => {
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
        },
      )
    : Promise.resolve(null)

  // BL-101 A1: sender, ledger, linked records, earlier threads, matching
  // docs. Enrichment only — each section degrades on its own inside, and a
  // throw here falls back to the plain rail rather than failing the page.
  // Its reads need only the thread; the residents (from the property
  // context) only name the sender afterwards, so they are handed over as a
  // promise and the rail no longer waits for the property context and the
  // draft before it starts.
  const railContextP = timed(R, 'inbox.rail', () =>
    getThreadRailContext(
      supabase,
      org.id,
      thread,
      contextOutcomeP.then((c) => (c === 'error' ? null : (c?.residents ?? null))),
    ),
  ).catch((error: unknown) => {
    console.error('ThreadPage: failed to load rail context', {
      threadId: id,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  })

  const [threads, contextOutcome, suggestedProperty, draft] = await Promise.all([
    timed(R, 'inbox.list', () => listThreads(supabase, org.id, filter, INBOX_PAGE_SIZE, offset, ownerScope)),
    contextOutcomeP,
    !thread.unitId && suggestedUnitId
      ? getUnitLabel(supabase, org.id, suggestedUnitId)
      : Promise.resolve(null),
    // Page-defining, same as thread/context above — a swallowed error here
    // would show a "Draft a reply" button beside a reply already queued to
    // send (see getLatestDraft's docstring), so this is not wrapped in a
    // `.catch` the way the enrichment-only lookups above are.
    timed(R, 'inbox.draft', () => getLatestDraft(supabase, org.id, id)),
  ])

  // BL-101 A3/A6 — the queue around this thread. All enrichment: a failure
  // degrades to "no auto-draft", "back to the list" or "no names", never
  // a blank thread page.
  const [needsReply, autoDraft, assignees, sla, undoDraft] = await Promise.all([
    // "Next" walks the needs-reply queue (in the same Mine/Unassigned
    // scope), whichever chip the list pane shows.
    filter === 'needs_review'
      ? Promise.resolve(threads)
      : listThreads(supabase, org.id, 'needs_review', INBOX_PAGE_SIZE, 0, ownerScope).catch(() => []),
    autoDraftP,
    assigneesP,
    slaP,
    undoDraftP,
  ])
  const now = Date.now()
  const assigneeNames = Object.fromEntries(assignees.map((a) => [a.userId, a.name]))
  const waiting = waitingInfo(
    { status: thread.status, lastDirection: thread.lastDirection ?? null, lastMessageAt: thread.lastMessageAt ?? null },
    now,
    sla,
  )

  const contextLoadFailed = contextOutcome === 'error'
  const context: PropertyContext | null = contextLoadFailed ? null : contextOutcome

  const railContext = await railContextP

  // Page-defining, like the draft itself: an approver must never see a
  // message that appears to have no files beside one that will send three.
  const draftAttachments = draft ? await listDraftAttachments(supabase, org.id, draft.id) : []

  const libraryFiles = await libraryFilesP

  const threadFiles = thread.messages.flatMap((message) =>
    message.attachments
      .filter((file) => file.fetchStatus === 'stored')
      .map((file) => ({ id: file.id, fileName: file.fileName, sizeBytes: file.sizeBytes ?? 0 })),
  )

  // Vendor rail data (its read was started above).
  let railVendor: RailVendor | null = null
  // Kept beside railVendor rather than added to it: RailVendor is the shape
  // VendorRail renders, and the rail has no reason to know an address it
  // never displays. This one prefills the vendor-request composer's "Send to".
  let vendorEmail: string | null = null
  // A failed vendor read must not render as "the vendor no longer exists"
  // (which invites a needless re-file): the rail says it couldn't load.
  let vendorLoadFailed = false
  if (vendorReadP) {
    const { data: vendorRow, error: vendorError } = await vendorReadP

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

  const [outgoingRequests, incomingRequest] = await vendorLinksP

  // The sender the quick-create modal seeds from: the newest INBOUND
  // message, matching what W33 reads server-side.
  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === 'inbound')

  // BL-101 A4 — "Create from email" prefills, from the newest inbound
  // message only. Pure text rules (lib/inbox/convert/model.ts), no AI;
  // the board checks each one before anything is written.
  const inboundText = lastInbound?.strippedText || lastInbound?.bodyText || ''
  // BL-105: a sender whose email failed SPF/DKIM/DMARC gets no contact
  // prefill (the option is blocked too, and the server action refuses).
  const senderCheck = railContext?.sender.check
  const senderUnauthenticated = senderCheck?.verified === false && senderCheck.reason === 'sender_unauthenticated'
  const convert = {
    ticket: ticketPrefillFromEmail(thread.subject, inboundText),
    contact: senderUnauthenticated
      ? { phone: '', email: '', mailing: '' }
      : (() => {
          const c = contactPrefillFromEmail(inboundText, lastInbound?.fromEmail ?? null)
          // M-2: the server refuses an email change from a thread until
          // BL-105 is live, so don't prefill one.
          return SENDER_AUTH_COLUMN_LIVE ? c : { ...c, email: '' }
        })(),
    arcAck: arcAck(appUrl(boardArcHref(arcPrefillFromEmail(thread.subject, inboundText)))),
    violationHref: `/violations/new?from_thread=${thread.id}`,
  }

  const rail = (
    <>
      <PropertyRail
        thread={thread}
        context={context}
        contextLoadFailed={contextLoadFailed}
        suggestedProperty={suggestedProperty}
        rail={railContext}
      />
      {railContext ? (
        <div className="border-t border-border p-4">
          <ThreadConnections rail={railContext} />
        </div>
      ) : null}
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

  const qs = inboxQuery({ filter, owner, page })
  const listHref = `/inbox${qs}`
  const subject = thread.subject ?? '(no subject)'
  const threadHref = (threadId: string) => `/inbox/${threadId}${qs}`

  const { prevId, nextId } = neighbours(
    threads.map((t) => t.id),
    thread.id,
  )
  const nextReplyId = nextNeedingReply(
    needsReply.map((t) => t.id),
    thread.id,
  )
  const afterCloseHref = nextReplyId ? threadHref(nextReplyId) : listHref

  // BL-101 A7 — the phone/tablet strip above the messages.
  const strip = contextStripModel({
    filed: Boolean(thread.unitId),
    context: contextLoadFailed ? null : context,
    account: railContext?.home ? railContext.home.account : undefined,
  })

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
              <ThreadList
                threads={threads}
                selectedId={thread.id}
                filter={filter}
                owner={owner}
                page={page}
                now={now}
                sla={sla}
                assigneeNames={assigneeNames}
                currentUserId={currentUserId}
              />
            )}
          </div>
        </aside>

        {/* pane 2 — conversation */}
        <section aria-label="Conversation" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
            <div id={THREAD_TOP_ANCHOR} className="scroll-mt-4" aria-hidden />
            <PageHeader
              breadcrumbs={[{ label: 'Inbox', href: listHref }, { label: subject }]}
              linkAs={Link}
              title={subject}
              /* The thread column is ~512px at desktop: Forward, Request
                 from vendor, Create from email and shortcuts do not fit
                 beside the subject, so they wrap on their own row below. */
              actionsBelow
              meta={
                <>
                  <StatusBadge
                    status={thread.status}
                    tones={INBOX_THREAD_STATUS.tones}
                    labels={INBOX_THREAD_STATUS.labels}
                  />
                  {waiting ? (
                    <span
                      className={
                        waiting.tone === 'overdue'
                          ? 'num rounded bg-danger-subtle px-1.5 py-0.5 text-xs font-medium text-danger'
                          : waiting.tone === 'warn'
                            ? 'num rounded bg-warning-subtle px-1.5 py-0.5 text-xs font-medium text-warning'
                            : 'num rounded bg-subtle px-1.5 py-0.5 text-xs font-medium text-foreground-secondary'
                      }
                    >
                      {waiting.label}
                    </span>
                  ) : null}
                </>
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
                  <ConvertMenu
                    threadId={thread.id}
                    filed={Boolean(thread.unitId)}
                    senderVerified={railContext?.sender.check.verified === true}
                    senderUnauthenticated={senderUnauthenticated}
                    emailChangeBlocked={!SENDER_AUTH_COLUMN_LIVE}
                    ticket={convert.ticket}
                    contact={convert.contact}
                    arcAck={convert.arcAck}
                    violationHref={convert.violationHref}
                  />
                  {/* The shortcuts button is a keyboard affordance: hidden
                      below lg (a phone has no keyboard to use it with),
                      while the listener itself stays mounted. */}
                  <span className="hidden lg:contents">
                    <InboxKeyboard
                      prevHref={prevId ? threadHref(prevId) : null}
                      nextHref={nextId ? threadHref(nextId) : null}
                      threadId={thread.id}
                      afterCloseHref={afterCloseHref}
                      showButton
                    />
                  </span>
                </>
              }
            />

            <ThreadTriageControls
              threadId={thread.id}
              status={thread.status}
              assignedTo={thread.assignedTo ?? null}
              assignees={assignees}
              currentUserId={currentUserId}
              afterCloseHref={afterCloseHref}
            />

            {undoDraft && undoDraft.status === 'queued' && undoDraft.sendAfter ? (
              <UndoSendBanner
                draftId={undoDraft.id}
                sendAfter={undoDraft.sendAfter}
                subject={undoDraft.subject}
                threadHref={fromParam && /^[0-9a-f-]{36}$/i.test(fromParam) ? threadHref(fromParam) : null}
              />
            ) : null}

            <VendorRequestLinks outgoing={outgoingRequests} incoming={incomingRequest} />

            {thread.vendorId ? null : <ContextStrip model={strip} />}

            <MessageThread messages={thread.messages} />

            <div id={REPLY_ANCHOR} className="scroll-mt-4">
            <DraftPanel
              threadId={thread.id}
              draft={draft}
              attachments={draftAttachments}
              threadFiles={threadFiles}
              libraryFiles={libraryFiles}
              autoDraftVersion={autoDraft.draft ? autoDraft.version : null}
              nextHref={afterCloseHref}
              // A fixed key from the violation wizard's "Insert into the
              // reply", mapped to a fixed line; never text from the URL.
              insertOnOpen={draft?.kind === 'reply' || !draft ? insertOnOpenText(insertParam) : null}
            />
            </div>

            {/* Below xl the rail has no column of its own, so it follows the
                conversation. It used to be hidden outright, which meant a
                phone or tablet never saw the property context at all. */}
            <div id={THREAD_CONTEXT_ANCHOR} className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-surface xl:hidden">
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
      <MobileActionBar
        threadId={thread.id}
        hasDraft={draft?.status === 'draft'}
        status={thread.status}
        afterCloseHref={afterCloseHref}
      />
    </SplitPaneFrame>
  )
}
