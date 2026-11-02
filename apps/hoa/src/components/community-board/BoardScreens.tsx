import Link from 'next/link'
import { LoadFailed } from '@homeowner-portal/ui'
import {
  loadBoardPageContext,
  loadOpenReports,
  loadThreadDetail,
  loadThreadList,
} from '@/lib/community-board/queries'
import { postVisibleTo } from '@/lib/community-board/rules'
import { formatDateTime } from '@/lib/format-datetime'
import { ModerateButton, NewThreadForm, ReplyForm, ReportButton } from './BoardClient'

// Server screens shared by the resident portal (/resident/board) and the board
// dashboard (/community-board). Privacy is RLS (0078); these only lay it out.

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-border bg-surface p-4 text-base">{children}</p>
}

export async function BoardHomeScreen({
  basePath,
  association,
  page,
}: {
  basePath: string
  association?: string
  page: number
}) {
  const c = await loadBoardPageContext(association)
  if (!c.current) {
    return <Notice>There is no community board for you yet. It opens once you are linked to a home.</Notice>
  }
  const [list, reports] = await Promise.all([loadThreadList(c, page), loadOpenReports(c)])
  const pageHref = (p: number) => {
    const q = new URLSearchParams()
    if (c.associations.length > 1) q.set('a', c.current!.id)
    q.set('page', String(p))
    return `${basePath}?${q.toString()}`
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Community board</h1>
        <p className="mt-1 text-base text-foreground-secondary">
          {c.current.name}. Only residents and the board of this community can read this.
        </p>
      </header>

      {c.associations.length > 1 && (
        <nav aria-label="Communities" className="flex flex-wrap gap-2">
          {c.associations.map((a) => (
            <Link
              key={a.id}
              href={`${basePath}?a=${a.id}`}
              className={`min-h-11 rounded-md border px-3 py-2 text-base ${a.id === c.current!.id ? 'border-primary font-semibold' : 'border-border'}`}
            >
              {a.name}
            </Link>
          ))}
        </nav>
      )}

      {c.moderator && reports.length > 0 && (
        <section aria-label="Reported posts" className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-base font-semibold">Reported posts ({reports.length})</h2>
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
                <p className="text-base">{r.reason}</p>
                <p className="text-sm text-foreground-secondary">Reported {formatDateTime(r.created_at)}</p>
                <div className="flex flex-wrap gap-2">
                  <ModerateButton action="resolve_report" target={{ reportId: r.id }} label="Hide the post and close the report" />
                  <ModerateButton action="dismiss_report" target={{ reportId: r.id }} label="Keep the post" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NewThreadForm associationId={c.current.id} basePath={basePath} />

      {!list.ok ? (
        <LoadFailed what="topics" />
      ) : list.threads.length === 0 ? (
        <Notice>No topics yet. Be the first to start one.</Notice>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {list.threads.map((t) => (
            <li key={t.id}>
              <Link href={`${basePath}/${t.id}`} className="block min-h-14 px-4 py-3 hover:bg-subtle">
                <span className="block text-base font-semibold">{t.title}</span>
                <span className="block text-sm text-foreground-secondary">
                  {t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}. Last activity {formatDateTime(t.last_activity_at)}
                  {t.closed_at ? '. Closed' : ''}
                  {t.hidden_at ? '. Hidden from residents' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.ok && (page > 1 || list.hasMore) && (
        <div className="flex gap-4 text-base">
          {page > 1 && <Link href={pageHref(page - 1)}>Newer topics</Link>}
          {list.hasMore && <Link href={pageHref(page + 1)}>Older topics</Link>}
        </div>
      )}
    </div>
  )
}

export async function BoardThreadScreen({ basePath, threadId }: { basePath: string; threadId: string }) {
  const c = await loadBoardPageContext()
  const detail = await loadThreadDetail(c, threadId)
  if (!detail) {
    return <Notice>We could not find this topic. It may have been removed.</Notice>
  }
  const { thread, posts, reports, reportedByMe } = detail
  const canReply = !thread.closed_at || c.moderator
  const openReportByPost = new Map(reports.map((r) => [r.post_id, r]))

  return (
    <div className="space-y-5">
      <Link href={basePath} className="inline-flex min-h-11 items-center text-base">
        Back to the community board
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{thread.title}</h1>
        {thread.closed_at && <p className="text-base text-foreground-secondary">The board closed this topic. You can still read it.</p>}
        {c.moderator && (
          <div className="pt-2">
            <ModerateButton
              action={thread.closed_at ? 'reopen_thread' : 'close_thread'}
              target={{ threadId: thread.id }}
              label={thread.closed_at ? 'Open this topic again' : 'Close this topic'}
            />
          </div>
        )}
      </header>

      <ul className="space-y-3">
        {posts
          .filter((p) => postVisibleTo(c.role, p))
          .map((p) => (
            <li key={p.id} className="space-y-2 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-foreground-secondary">
                <span className="font-semibold text-foreground">{p.author_label}</span>
                {p.author_is_board ? ' (board)' : ''}. {formatDateTime(p.created_at)}
              </p>
              {p.hidden_at ? (
                <p className="text-base italic text-foreground-secondary">
                  Hidden from residents{p.hidden_reason ? `: ${p.hidden_reason}` : ''}.
                </p>
              ) : null}
              <p className="whitespace-pre-wrap break-words text-base">{p.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                {c.moderator ? (
                  <ModerateButton
                    action={p.hidden_at ? 'unhide_post' : 'hide_post'}
                    target={{ postId: p.id }}
                    label={p.hidden_at ? 'Show this post again' : 'Hide this post'}
                  />
                ) : (
                  <ReportButton postId={p.id} already={reportedByMe.includes(p.id)} />
                )}
              </div>
              {openReportByPost.has(p.id) && (
                <div className="space-y-2 rounded-md bg-subtle p-3">
                  <p className="text-base">Reported: {openReportByPost.get(p.id)!.reason}</p>
                  <div className="flex flex-wrap gap-2">
                    <ModerateButton action="resolve_report" target={{ reportId: openReportByPost.get(p.id)!.id }} label="Hide the post and close the report" />
                    <ModerateButton action="dismiss_report" target={{ reportId: openReportByPost.get(p.id)!.id }} label="Keep the post" />
                  </div>
                </div>
              )}
            </li>
          ))}
      </ul>

      {canReply ? <ReplyForm threadId={thread.id} /> : <Notice>This topic is closed, so new replies are off.</Notice>}
    </div>
  )
}
