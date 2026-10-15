import { cn } from '@homeowner-portal/ui'

/**
 * Horizontal ranked bars (plan mix, workflow usage). Server-rendered, no
 * chart library: a label, a value and a token-coloured bar per row. The
 * value is always printed, so nothing depends on reading the bar length.
 */
export interface BarListItem {
  key: string
  label: React.ReactNode
  value: number
  /** Printed value; defaults to the number. */
  display?: React.ReactNode
}

export function BarList({
  items,
  max,
  mono = false,
  className,
}: {
  items: BarListItem[]
  /** Scale reference; defaults to the largest value. */
  max?: number
  /** Monospace labels (ids such as workflow keys). */
  mono?: boolean
  className?: string
}) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((item) => {
        const pct = top > 0 ? Math.max((item.value / top) * 100, item.value > 0 ? 2 : 0) : 0
        return (
          <li key={item.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn('min-w-0 truncate text-foreground-secondary', mono && 'font-mono text-xs')}>
                {item.label}
              </span>
              <span className="num shrink-0 font-medium text-foreground">{item.display ?? item.value.toLocaleString()}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
