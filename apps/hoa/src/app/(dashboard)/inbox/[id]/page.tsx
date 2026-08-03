import Link from 'next/link'
import { notFound } from 'next/navigation'
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
import { ThreadList } from '../ThreadList'
import { DraftPanel } from './DraftPanel'
import { MessageThread } from './MessageThread'
import { PropertyRail } from './PropertyRail'

export const dynamic = 'force-dynamic'

const FILTER_KEYS: InboxFilter[] = ['needs_review', 'open', 'waiting', 'closed', 'all']

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

  return (
    <main className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* pane 1 — list */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border lg:block">
        <nav className="border-b border-border p-2 text-xs">
          <Link href={`/inbox?filter=${filter}&page=${page}`} className="text-muted underline">
            ← All conversations ({counts[filter] ?? 0})
          </Link>
        </nav>
        <ThreadList
          threads={threads}
          selectedId={thread.id}
          filter={filter}
          hasAnyThreads={counts.all > 0}
        />
      </aside>

      {/* pane 2 — conversation */}
      <section className="flex-1 overflow-y-auto p-4">
        <header className="mb-3">
          <h1 className="text-lg font-semibold text-foreground">
            {thread.subject ?? '(no subject)'}
          </h1>
          <p className="text-xs text-muted">
            {thread.messages.length} message
            {thread.messages.length === 1 ? '' : 's'} · {thread.status}
          </p>
        </header>

        <MessageThread messages={thread.messages} />

        <DraftPanel
          threadId={thread.id}
          draft={draft}
          attachments={draftAttachments}
          threadFiles={threadFiles}
          libraryFiles={libraryFiles}
        />
      </section>

      {/* pane 3 — property rail */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border xl:block">
        <PropertyRail
          thread={thread}
          context={context}
          contextLoadFailed={contextLoadFailed}
          suggestedProperty={suggestedProperty}
        />
      </aside>
    </main>
  )
}
