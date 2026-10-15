import Link from 'next/link'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { TriageSnapshot } from '@/lib/dashboard/triage'
import { FailedNote } from './BreakdownList'

/**
 * Two-tier by design: the property-matched count is the headline, the
 * unmatched backlog is a quiet footer link. See lib/dashboard/triage.ts
 * for why the quiet number is reported rather than hidden.
 */
export function MailTriageCard({ snapshot }: { snapshot: TriageSnapshot }) {
  const waiting = snapshot.needsReply.count
  return (
    <Card>
      <CardHeader
        className="pb-3"
        actions={
          !snapshot.failed && waiting > 0 ? (
            <Badge variant="neutral" className="num">
              {waiting} waiting
            </Badge>
          ) : null
        }
      >
        <CardTitle as="h2">Resident mail</CardTitle>
        <p className="text-sm text-muted">
          {!snapshot.failed && waiting > 0 && snapshot.needsReply.oldestWaitingDays !== null
            ? `Needs a reply · oldest ${snapshot.needsReply.oldestWaitingDays} ${
                snapshot.needsReply.oldestWaitingDays === 1 ? 'day' : 'days'
              }`
            : 'Threads matched to a property'}
        </p>
      </CardHeader>
      {snapshot.failed ? (
        // Never "0" — a false zero reads as "nothing to do".
        <CardContent>
          <FailedNote what="your mail queue" />
        </CardContent>
      ) : waiting === 0 ? (
        <CardContent>
          <p className="flex items-center gap-2 text-sm text-foreground-secondary">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            Every matched thread has a reply.
          </p>
        </CardContent>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {snapshot.threads.map((thread) => (
            <li key={thread.id}>
              <Link
                href={`/inbox/${thread.id}`}
                className="group flex items-center gap-3 px-5 py-2.5 text-sm transition-colors duration-fast hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{thread.subject ?? '(no subject)'}</span>
                <span className="num shrink-0 text-xs text-muted">
                  {thread.waitingDays === 0 ? 'today' : `${thread.waitingDays}d`}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!snapshot.failed && snapshot.untriaged.count > 0 ? (
        <Link
          href="/inbox?filter=needs_review"
          className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted transition-colors hover:bg-subtle hover:text-foreground"
        >
          <span className="num">{snapshot.untriaged.count.toLocaleString()} unmatched, not yet triaged</span>
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </Card>
  )
}
