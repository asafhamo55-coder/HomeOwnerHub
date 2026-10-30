import type { ReactNode } from 'react'
import Link from 'next/link'
import { Kpi } from '@homeowner-portal/ui'

/**
 * A row of count tiles above a list. Presentational and pure: callers pass
 * finished strings, so a 'use client' file may import it too. It reaches no
 * server code.
 *
 * A tile whose `value` is null shows a dash and "Not available" (or the
 * caller's own hint), never 0: an unknown count is not zero.
 */
export interface SummaryTile {
  label: string
  /** Display string. Null means the count could not be loaded. */
  value: string | null
  /** One line under the value. Used when the value is known. */
  hint?: string
  /** Shown instead of `hint` when the value is null. Defaults to "Not available". */
  unavailableHint?: string
  /** Link the whole tile to the filtered list. */
  href?: string
  icon?: ReactNode
  /** Colours the figure. The hint must still say what it means; colour never carries it alone. */
  tone?: 'default' | 'warning' | 'danger'
}

const TONE_CLASS = { default: '', warning: 'text-warning', danger: 'text-danger' } as const

const COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
}

export function SummaryStrip({
  ariaLabel,
  testId,
  tiles,
  loading = false,
}: {
  ariaLabel: string
  testId?: string
  tiles: readonly SummaryTile[]
  /** True while the sources load: the tiles show their loading state. */
  loading?: boolean
}) {
  const odd = tiles.length % 2 === 1
  return (
    <section
      aria-label={ariaLabel}
      data-testid={testId}
      className={`grid grid-cols-2 gap-3 sm:gap-4 ${COLUMNS[tiles.length] ?? 'lg:grid-cols-4'}`}
    >
      {tiles.map((t, i) => {
        const unknown = t.value === null
        const tone = TONE_CLASS[t.tone ?? 'default']
        return (
          <Kpi
            key={t.label}
            // An odd last tile spans the row on two columns, so it never sits alone beside a gap.
            className={odd && i === tiles.length - 1 ? 'col-span-2 lg:col-span-1' : undefined}
            label={t.label}
            state={loading ? 'loading' : 'ready'}
            icon={t.icon}
            href={t.href}
            linkAs={t.href ? Link : undefined}
            value={unknown ? '—' : tone ? <span className={tone}>{t.value}</span> : t.value}
            hint={unknown ? (t.unavailableHint ?? 'Not available') : t.hint}
          />
        )
      })}
    </section>
  )
}
