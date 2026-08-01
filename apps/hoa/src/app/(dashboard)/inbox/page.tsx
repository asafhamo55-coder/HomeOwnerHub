import Link from 'next/link'
import { Alert } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  getMailboxStatus,
  listThreads,
  type InboxFilter,
} from '@/lib/inbox/queries'
import { ThreadList } from './ThreadList'

export const metadata = { title: 'Inbox' }
export const dynamic = 'force-dynamic'

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'needs_review', label: 'Needs review' },
  { key: 'open', label: 'Open' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const params = await searchParams
  // Inbox tables are gated by auth_is_board_or_admin at the RLS layer
  // (migration 0012 + the inbox migrations); requireBoardOrAdmin matches
  // that bar exactly. settings/mailbox/page.tsx currently uses
  // requireAdmin (admin-only) — that's a known inconsistency being
  // triaged separately, not a pattern to copy here.
  const { org } = await requireBoardOrAdmin()

  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ??
    'needs_review') as InboxFilter

  const supabase = await getSupabaseServerClient()
  const [status, counts, threads] = await Promise.all([
    getMailboxStatus(supabase, org.id),
    countThreadsByStatus(supabase, org.id),
    listThreads(supabase, org.id, filter),
  ])

  if (!status) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="info" title="No mailbox connected">
          Connect your HOA mailbox to see resident email here.{' '}
          <Link href="/settings/mailbox" className="underline">
            Connect
          </Link>
        </Alert>
      </main>
    )
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      {status.syncStatus !== 'ok' ? (
        <Alert
          variant={status.syncStatus === 'auth_failed' ? 'error' : 'warning'}
          title={
            status.syncStatus === 'auth_failed'
              ? 'Mailbox disconnected — reconnect required'
              : 'Mail sync has stalled'
          }
          className="m-3"
        >
          {/* sync_error is written from a caught error's .message by the
              jobs layer (packages/jobs) — operator-facing diagnostic text,
              not user input. React escapes it as plain text content below,
              so it can't inject markup; it is never interpolated into an
              href, dangerouslySetInnerHTML, or any other raw sink. */}
          {status.syncError ?? 'Resident email may not be arriving.'}{' '}
          <Link href="/settings/mailbox" className="underline">
            Fix
          </Link>
        </Alert>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border xl:max-w-xs">
          <nav className="flex flex-wrap gap-1 border-b border-border p-2 text-xs">
            {FILTERS.map((option) => (
              <Link
                key={option.key}
                href={`/inbox?filter=${option.key}`}
                className={`rounded-full px-2.5 py-1 ${
                  option.key === filter
                    ? 'bg-primary text-primary-fg'
                    : 'text-muted hover:bg-muted/10'
                }`}
              >
                {option.label} {counts[option.key] ?? 0}
              </Link>
            ))}
          </nav>
          <ThreadList threads={threads} filter={filter} />
        </aside>

        <section className="hidden flex-1 items-center justify-center text-sm text-muted lg:flex">
          Select a conversation
        </section>
      </div>
    </main>
  )
}
