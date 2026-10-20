/**
 * The line the /dues dialog shows after a manual reminder send (BL-044).
 *
 * Recipients the outbound safety guard held back (a sandboxed org, or an
 * address off OUTBOUND_ALLOWLIST outside production) are reported as held,
 * apart from real failures — a board seeing "0 sent, 3 failed" goes looking
 * for a broken mailbox that is not broken.
 */
export function sendSummary(r: { sentCount: number; failedCount: number; heldCount: number }): string {
  const parts: string[] = []
  if (r.sentCount > 0 || (r.failedCount === 0 && r.heldCount === 0)) {
    parts.push(`Sent ${r.sentCount} reminder${r.sentCount === 1 ? '' : 's'}`)
  } else {
    parts.push('Nothing was sent')
  }
  if (r.failedCount > 0) parts.push(`${r.failedCount} failed`)
  if (r.heldCount > 0) parts.push(`held by safety guard (${r.heldCount})`)
  return `${parts.join(', ')}.`
}
