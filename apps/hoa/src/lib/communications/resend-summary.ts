/**
 * The toast after "Resend to failed" (BL-109). Rows the outbound safety
 * guard held back are reported apart from real failures, in the words the
 * status badges use ("Held by safety guard (N)"), and are not offered for
 * another retry — they are `suppressed` now, not `failed`.
 */
export function resendSummary(r: { sentCount: number; failedCount: number; heldCount: number }): string {
  const parts: string[] = []
  if (r.sentCount > 0 || (r.failedCount === 0 && r.heldCount === 0)) {
    parts.push(`Resent to ${r.sentCount} recipient${r.sentCount === 1 ? '' : 's'}`)
  } else {
    parts.push('Nothing was resent')
  }
  if (r.failedCount > 0) parts.push(`${r.failedCount} still failing`)
  if (r.heldCount > 0) parts.push(`held by safety guard (${r.heldCount})`)
  return `${parts.join('; ')}.`
}
