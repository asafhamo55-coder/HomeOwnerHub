/**
 * Pure helpers that pre-fill a forward. No `'use server'` — see blanks.ts.
 *
 * The quoted block uses the `---------- Forwarded message ----------`
 * marker deliberately: stripQuotedReply (packages/mailbox/src/quote.ts)
 * lists it as a cut pattern, so when the vendor replies and their message
 * syncs back, the stripper can cut this history off instead of feeding it to
 * the reply drafter as if it were new content.
 */

import type { ThreadMessage } from '@/lib/inbox/queries'
import { formatMessageTimestamp } from '@/lib/format-datetime'

export function buildForwardSubject(subject: string | null): string {
  const base = subject?.trim() || '(no subject)'
  return /^fwd:/i.test(base) ? base : `Fwd: ${base}`
}

export function buildForwardBody(messages: ThreadMessage[]): string {
  // Two newlines first: the cursor lands above the quoted block, which is
  // where a person writes "can you take a look at this?".
  const opening = '\n\n'
  if (messages.length === 0) return opening

  // The most recent message, by sent_at. getThreadDetail already orders
  // ascending, but this must not depend on that — a forward that quoted the
  // wrong message would be silently, confusingly wrong.
  const latest = messages.reduce((newest, candidate) =>
    (candidate.sentAt ?? '') > (newest.sentAt ?? '') ? candidate : newest,
  )

  const sender = latest.fromName
    ? `${latest.fromName}${latest.fromEmail ? ` <${latest.fromEmail}>` : ''}`
    : (latest.fromEmail ?? 'Unknown')

  return [
    opening,
    '---------- Forwarded message ----------',
    `From: ${sender}`,
    `Date: ${formatMessageTimestamp(latest.sentAt)}`,
    `Subject: ${latest.subject ?? '(no subject)'}`,
    `To: ${latest.toEmails.join(', ') || '—'}`,
    '',
    // bodyText, NOT strippedText. A forward exists to carry the history
    // onward; handing a vendor a message with its own quoted context removed
    // would strip exactly the thread they need to understand the request.
    latest.bodyText ?? '(no body)',
  ].join('\n')
}
