import { ChevronDown, Home } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import type { StripModel } from '@/lib/inbox/mobile-strip'

/** The rail block below the conversation that the strip jumps to. */
export const THREAD_CONTEXT_ANCHOR = 'thread-context'

const BALANCE_TONE: Record<NonNullable<StripModel['balance']>['tone'], string> = {
  owed: 'bg-warning-subtle text-warning',
  clear: 'bg-success-subtle text-success',
  unknown: 'bg-subtle text-foreground-secondary',
}

/**
 * BL-101 A7 — below `xl` the property rail has no column and sits after
 * the conversation, so a phone never saw the home until it scrolled past
 * the reply. This one-line strip sits above the messages instead: the
 * home, its balance, what is open; tap to jump to the full rail.
 */
export function ContextStrip({ model }: { model: StripModel }) {
  return (
    <a
      href={`#${THREAD_CONTEXT_ANCHOR}`}
      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs no-underline transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
    >
      <Home className="size-3.5 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block truncate font-medium text-foreground">{model.home}</span>
        {model.balance || model.open.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {model.balance ? (
              <span className={cn('num rounded px-1.5 py-0.5 font-medium', BALANCE_TONE[model.balance.tone])}>{model.balance.label}</span>
            ) : null}
            {model.open.length > 0 ? <span className="text-muted">{model.open.join(' · ')}</span> : null}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-muted">
        Details
        <ChevronDown className="size-3.5" aria-hidden />
      </span>
    </a>
  )
}
