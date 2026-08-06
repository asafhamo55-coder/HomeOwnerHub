import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { TriageSnapshot } from '@/lib/dashboard/triage'

/**
 * Two-tier by design: the property-matched count is the headline, the
 * unmatched backlog is a quiet footer link. See lib/dashboard/triage.ts
 * for why the quiet number is reported rather than hidden.
 */
export function MailTriageCard({ snapshot }: { snapshot: TriageSnapshot }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
        <Mail className="h-4 w-4 text-muted" />
        <CardTitle className="text-base">Resident mail needing a reply</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshot.failed ? (
          // Never "0" — a false zero reads as "nothing to do".
          <p className="text-sm text-muted">
            Couldn&apos;t load your mail queue.{' '}
            <Link href="/inbox" className="underline">
              Open the inbox
            </Link>
          </p>
        ) : snapshot.needsReply.count === 0 ? (
          <p className="text-sm text-muted">
            Nothing waiting on a reply. Every matched thread has been answered.
          </p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              <span className="text-2xl font-semibold tabular-nums">
                {snapshot.needsReply.count}
              </span>{' '}
              waiting
              {snapshot.needsReply.oldestWaitingDays !== null ? (
                <span className="text-muted">
                  {' '}
                  · oldest {snapshot.needsReply.oldestWaitingDays}d
                </span>
              ) : null}
            </p>

            <ul className="divide-y divide-border border-t border-border">
              {snapshot.threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/inbox/${thread.id}`}
                    className="flex items-baseline justify-between gap-3 py-2 text-sm hover:bg-foreground/5"
                  >
                    <span className="truncate text-foreground">
                      {thread.subject ?? '(no subject)'}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted">
                      {thread.waitingDays}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {!snapshot.failed && snapshot.untriaged.count > 0 ? (
          <Link
            href="/inbox?filter=needs_review"
            className="block border-t border-border pt-2 text-xs text-muted underline"
          >
            {snapshot.untriaged.count.toLocaleString()} unmatched, untriaged ›
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}
