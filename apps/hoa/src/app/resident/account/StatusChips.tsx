import Link from 'next/link'
import type { StatusChip } from './status-chips'

const TONE: Record<StatusChip['tone'], string> = {
  on: 'border-success/30 bg-success-subtle text-success',
  off: 'border-border bg-subtle text-muted',
  unknown: 'border-border bg-subtle text-muted',
}

/** Each chip says its state in words, so colour never carries it alone. */
export function StatusChips({ chips }: { chips: readonly StatusChip[] }) {
  if (chips.length === 0) return null
  return (
    <ul aria-label="Your settings" className="flex flex-wrap gap-2" data-testid="account-status-chips">
      {chips.map((c) => (
        <li key={c.key}>
          <Link
            href={c.href}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${TONE[c.tone]}`}
          >
            <span className="text-muted">{c.label}:</span> {c.value}
          </Link>
        </li>
      ))}
    </ul>
  )
}
