import { AlertTriangle, Download, Loader2, Paperclip } from 'lucide-react'
import { Avatar, Badge, cn } from '@homeowner-portal/ui'
import type { ThreadMessage } from '@/lib/inbox/queries'
import { formatMessageTimestamp } from '@/lib/format-datetime'

export function MessageThread({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol aria-label="Messages" className="space-y-3">
      {messages.map((message) => {
        const outbound = message.direction === 'outbound'
        const sender = message.fromName ?? message.fromEmail ?? 'Unknown'
        return (
          <li key={message.id}>
            <article
              className={cn(
                'rounded-xl border bg-surface',
                outbound ? 'border-primary/30' : 'border-border',
              )}
            >
              <header
                className={cn(
                  'flex flex-wrap items-start gap-x-3 gap-y-1 border-b px-4 py-3',
                  outbound ? 'border-primary/20 bg-primary-subtle/60' : 'border-border',
                )}
              >
                <Avatar name={sender} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{sender}</span>
                    {outbound ? (
                      // Threads are two-sided now that sent mail syncs. Colour
                      // alone is not enough — a manager scanning a long thread
                      // needs to know instantly which messages the HOA sent,
                      // because the whole point is not replying twice.
                      // "Forwarded by HOA" further distinguishes a message
                      // that went to a vendor from one back to the resident.
                      <Badge variant="default" size="sm">
                        {message.forwardedTo ? 'Forwarded by HOA' : 'Sent by HOA'}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted">
                    to {message.toEmails.join(', ') || '—'}
                    {message.forwardedTo && message.forwardedTo.length > 0
                      ? ` · forwarded to ${message.forwardedTo.join(', ')}`
                      : ''}
                  </p>
                </div>
                <time
                  dateTime={message.sentAt ?? undefined}
                  className="num shrink-0 text-xs text-muted"
                >
                  {formatMessageTimestamp(message.sentAt)}
                </time>
              </header>

              {/* strippedText is the quote-stripped body and is what should be
                  displayed; bodyText is the full message including quoted
                  history and is only a fallback when stripping produced
                  nothing. */}
              <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed text-foreground">
                {message.strippedText ?? message.bodyText ?? '(no body)'}
              </p>

              {message.attachments.length > 0 ? (
                <ul aria-label="Attachments" className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                  {message.attachments.map((file) => (
                    <li key={file.id} className="min-w-0 max-w-full">
                      {file.fetchStatus === 'stored' ? (
                        <a
                          href={`/inbox/attachment/${file.id}`}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-subtle px-2.5 py-1.5 text-xs font-medium text-foreground no-underline transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />
                          <span className="truncate">{file.fileName}</span>
                          <Download className="size-3.5 shrink-0 text-muted" aria-hidden />
                        </a>
                      ) : file.fetchStatus === 'pending' ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted">
                          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                          <span className="truncate">{file.fileName} — downloading…</span>
                        </span>
                      ) : (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-warning/30 bg-warning-subtle px-2.5 py-1.5 text-xs text-warning">
                          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">
                            {file.fileName} — couldn&apos;t retrieve, open in Gmail
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          </li>
        )
      })}
    </ol>
  )
}
