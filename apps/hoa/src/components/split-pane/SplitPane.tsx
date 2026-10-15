import * as React from 'react'
import { cn } from '@homeowner-portal/ui'

/**
 * Full-bleed, full-height frame for the two split-pane workspaces (inbox,
 * properties). Not a `<Page>`: a fixed-width container would break their
 * independently scrolling panes (UX plan decision 9).
 *
 * It cancels AppShellContent's padding (px-4/6/8, pt-6/8, pb-16) so the
 * panes run edge to edge under the 56px top bar, and sizes itself to the
 * rest of the viewport so only the panes scroll — never the page.
 */
export function SplitPaneFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        '-mx-4 -mb-16 -mt-6 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background sm:-mx-6 md:-mt-8 lg:-mx-8',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The workspace header strip: title row, then an optional toolbar row. */
export function SplitPaneHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('shrink-0 space-y-3 border-b border-border bg-surface px-4 py-4 sm:px-6', className)}>
      {children}
    </div>
  )
}

/** Placeholder for the detail pane before anything is selected (desktop only). */
export function SplitPanePlaceholder({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
}) {
  return (
    <section className="hidden flex-1 flex-col items-center justify-center gap-3 p-8 text-center lg:flex">
      <div
        aria-hidden
        className="flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-muted shadow-xs [&_svg]:size-6"
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? <p className="max-w-xs text-xs text-muted">{hint}</p> : null}
      </div>
    </section>
  )
}
