// Community board reads for the pages (B5). They run on the caller's own
// session, so RLS (0078) decides what a resident may see: nothing outside their
// association and no hidden post. The role check here only picks the screen.

import { notFound } from 'next/navigation'
import { M13_APPLIED } from '@homeowner-portal/db/m13'
import { getCurrentUserRole } from '@/lib/auth'
import { loadOrFail } from '@/lib/load-or-fail'
import { looseSession, residentAssociationIds, type LooseDb, type PostRow, type ThreadRow } from './server'
import { BOARD_PAGE_SIZE, BOARD_POST_CAP, isBoardModerator, type BoardRole } from './rules'

export interface BoardAssociation {
  id: string
  name: string
}

export interface BoardPageContext {
  orgId: string
  role: BoardRole
  moderator: boolean
  db: LooseDb
  associations: BoardAssociation[]
  /** The association being shown (the ?a= choice, else the first). */
  current: BoardAssociation | null
}

/** Pages 404 while the feature is dark, and for anyone who is not a member. */
export async function loadBoardPageContext(requestedAssociationId?: string): Promise<BoardPageContext> {
  if (!M13_APPLIED) notFound()
  const ctx = await getCurrentUserRole()
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board' && ctx.role !== 'resident')) notFound()
  const role: BoardRole = ctx.role
  const db = await looseSession()

  let query = db.from('associations').select('id, name').eq('organization_id', ctx.org.id).order('name')
  if (!isBoardModerator(role)) {
    const ids = await residentAssociationIds(db).catch(() => [])
    if (ids.length === 0) return { orgId: ctx.org.id, role, moderator: false, db, associations: [], current: null }
    query = query.in('id', ids)
  }
  const res = await loadOrFail('community board associations', query)
  const associations = res.ok ? ((res.data ?? []) as BoardAssociation[]) : []
  const current = associations.find((a) => a.id === requestedAssociationId) ?? associations[0] ?? null
  return { orgId: ctx.org.id, role, moderator: isBoardModerator(role), db, associations, current }
}

export interface ThreadListItem extends ThreadRow {
  reply_count: number
}

export async function loadThreadList(
  c: BoardPageContext,
  page: number,
): Promise<{ ok: true; threads: ThreadListItem[]; hasMore: boolean } | { ok: false }> {
  if (!c.current) return { ok: true, threads: [], hasMore: false }
  const from = (page - 1) * BOARD_PAGE_SIZE
  const res = await loadOrFail(
    'community board threads',
    c.db
      .from('board_threads')
      .select('id, organization_id, association_id, title, created_by, closed_at, hidden_at, last_activity_at, created_at')
      .eq('association_id', c.current.id)
      .order('last_activity_at', { ascending: false })
      .range(from, from + BOARD_PAGE_SIZE), // one extra row says whether there is a next page
  )
  if (!res.ok) return { ok: false }
  const rows = (res.data ?? []) as ThreadRow[]
  const hasMore = rows.length > BOARD_PAGE_SIZE
  const threads = rows.slice(0, BOARD_PAGE_SIZE)
  const counts = new Map<string, number>()
  if (threads.length > 0) {
    const posts = await loadOrFail(
      'community board reply counts',
      c.db
        .from('board_posts')
        .select('thread_id')
        .in('thread_id', threads.map((t) => t.id))
        .eq('is_opening', false)
        .limit(BOARD_PAGE_SIZE * BOARD_POST_CAP),
    )
    if (posts.ok) {
      for (const p of (posts.data ?? []) as Array<{ thread_id: string }>) {
        counts.set(p.thread_id, (counts.get(p.thread_id) ?? 0) + 1)
      }
    }
  }
  return { ok: true, threads: threads.map((t) => ({ ...t, reply_count: counts.get(t.id) ?? 0 })), hasMore }
}

export interface OpenReport {
  id: string
  post_id: string
  reason: string
  created_at: string
}

export async function loadOpenReports(c: BoardPageContext): Promise<OpenReport[]> {
  if (!c.moderator || !c.current) return []
  const res = await loadOrFail(
    'community board reports',
    c.db
      .from('board_post_reports')
      .select('id, post_id, reason, created_at')
      .eq('association_id', c.current.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50),
  )
  return res.ok ? ((res.data ?? []) as OpenReport[]) : []
}

export async function loadThreadDetail(
  c: BoardPageContext,
  threadId: string,
  postLimit: number = BOARD_POST_CAP,
): Promise<{ thread: ThreadRow; posts: PostRow[]; reports: OpenReport[]; reportedByMe: string[]; hasMorePosts: boolean } | null> {
  const t = await c.db
    .from('board_threads')
    .select('id, organization_id, association_id, title, created_by, closed_at, hidden_at, last_activity_at, created_at')
    .eq('id', threadId)
    .maybeSingle()
  const thread = t.data as ThreadRow | null
  if (t.error || !thread) return null
  const p = await loadOrFail(
    'community board posts',
    c.db
      .from('board_posts')
      .select('id, organization_id, association_id, thread_id, author_id, author_label, author_is_board, is_opening, body, hidden_at, hidden_reason, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(postLimit + 1),
  )
  if (!p.ok) return null
  const fetched = (p.data ?? []) as PostRow[]
  const hasMorePosts = fetched.length > postLimit
  const posts = fetched.slice(0, postLimit)
  const postIds = posts.map((x) => x.id)
  let reports: OpenReport[] = []
  let reportedByMe: string[] = []
  if (postIds.length > 0) {
    // The board sees the open queue for this thread; everyone else only their own reports (RLS).
    const r = await loadOrFail(
      'community board thread reports',
      c.db.from('board_post_reports').select('id, post_id, reason, created_at, status, reported_by').in('post_id', postIds),
    )
    if (r.ok) {
      const rows = (r.data ?? []) as Array<OpenReport & { status: string; reported_by: string }>
      if (c.moderator) reports = rows.filter((x) => x.status === 'open')
      reportedByMe = rows.map((x) => x.post_id)
    }
  }
  return { thread, posts, reports, reportedByMe, hasMorePosts }
}
