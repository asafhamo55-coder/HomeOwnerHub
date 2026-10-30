import Link from 'next/link'
import type {
  OutgoingVendorRequest,
  IncomingVendorRequest,
} from '@/lib/inbox/vendor-request-links'

/**
 * The cross-reference between a resident thread and the vendor thread its
 * work order started.
 *
 * A server component — these are two plain links and a status line, and
 * nothing here is interactive.
 *
 * The "Sending…" state is not a spinner and does not poll. A vendor request
 * becomes a real thread only when the ordinary 5-minute sync ingests the sent
 * message, so there is a genuine window where the link cannot exist yet.
 * Saying so plainly beats a link that 404s or a spinner implying something is
 * stuck.
 */
export function VendorRequestLinks({
  outgoing,
  incoming,
}: {
  outgoing: OutgoingVendorRequest[]
  incoming: IncomingVendorRequest | null
}) {
  if (outgoing.length === 0 && !incoming) return null

  return (
    <div className="mb-3 space-y-1 rounded-lg border border-border bg-subtle px-3 py-2 text-xs">
      {incoming ? (
        <p className="text-muted">
          From resident thread:{' '}
          <Link
            href={`/inbox/${incoming.sourceThreadId}`}
            className="font-medium text-primary hover:underline"
          >
            {incoming.sourceSubject ?? '(no subject)'}
          </Link>
        </p>
      ) : null}

      {outgoing.map((request) => (
        <p key={request.draftId} className="text-muted">
          Vendor request to {request.toEmails.join(', ') || '—'}:{' '}
          {request.vendorThreadId ? (
            <Link
              href={`/inbox/${request.vendorThreadId}`}
              className="font-medium text-primary hover:underline"
            >
              open conversation
            </Link>
          ) : (
            <span className="text-foreground">
              {request.status === 'sent' ? 'sending…' : request.status}
            </span>
          )}
        </p>
      ))}
    </div>
  )
}
