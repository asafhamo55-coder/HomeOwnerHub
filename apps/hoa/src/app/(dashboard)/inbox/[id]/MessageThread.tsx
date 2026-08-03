import type { ThreadMessage } from '@/lib/inbox/queries'
import { formatMessageTimestamp } from '@/lib/format-datetime'

// No `text-warning` utility exists in the shared Tailwind config
// (packages/ui/tailwind.config.ts only defines primary/accent/background/
// surface/border/foreground/muted/destructive as CSS-variable tokens).
// The "couldn't retrieve" attachment state uses the same literal
// amber/dark: pair already used for this exact distinction elsewhere in
// the inbox (ThreadList.tsx's confidenceTone).
export function MessageThread({ messages }: { messages: ThreadMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`rounded-lg border p-3 ${
            message.direction === 'outbound'
              ? 'border-primary/40 bg-primary/5'
              : 'border-border bg-muted/5'
          }`}
        >
          <header className="mb-2 flex flex-wrap items-baseline gap-2 text-xs text-muted">
            <span className="font-semibold text-foreground">
              {message.fromName ?? message.fromEmail ?? 'Unknown'}
            </span>
            {message.direction === 'outbound' ? (
              // Phase B: threads are two-sided now that sent mail syncs.
              // Colour alone is not enough — a manager scanning a long
              // thread needs to know instantly which messages the HOA sent,
              // because the whole point is not replying twice. Phase 4:
              // "Forwarded by HOA" further distinguishes a message that went
              // to a vendor from one that went back to the resident.
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                {message.forwardedTo ? 'Forwarded by HOA' : 'Sent by HOA'}
              </span>
            ) : null}
            {message.forwardedTo && message.forwardedTo.length > 0 ? (
              <span className="text-muted">to {message.forwardedTo.join(', ')}</span>
            ) : null}
            <span>→ {message.toEmails.join(', ') || '—'}</span>
            <span className="ml-auto">
              {formatMessageTimestamp(message.sentAt)}
            </span>
          </header>

          {/* strippedText is the quote-stripped body and is what should be
              displayed; bodyText is the full message including quoted
              history and is only a fallback when stripping produced
              nothing. */}
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {message.strippedText ?? message.bodyText ?? '(no body)'}
          </p>

          {message.attachments.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-border pt-2">
              {message.attachments.map((file) => (
                <li key={file.id} className="text-xs">
                  {file.fetchStatus === 'stored' ? (
                    <a href={`/inbox/attachment/${file.id}`} className="underline">
                      📎 {file.fileName}
                    </a>
                  ) : file.fetchStatus === 'pending' ? (
                    <span className="text-muted">📎 {file.fileName} — downloading…</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">
                      📎 {file.fileName} — couldn&apos;t retrieve, open in Gmail
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  )
}
