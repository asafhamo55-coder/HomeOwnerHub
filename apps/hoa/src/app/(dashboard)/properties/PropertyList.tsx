import Link from 'next/link'
import type { PropertyListRow } from '@/lib/properties/list'
import type { PropertyListParams } from '@/lib/properties/list-params'
import {
  emptyListMessage,
  reasonPills,
  severityDotClass,
  severityLabel,
  severityTone,
  streetOf,
} from '@/lib/properties/severity'

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** Preserves the current filter/sort/search/page when linking to a property. */
function queryFor(params: PropertyListParams): string {
  const q = new URLSearchParams()
  if (params.filter !== 'attention') q.set('filter', params.filter)
  if (params.sort !== 'severity') q.set('sort', params.sort)
  if (params.search) q.set('q', params.search)
  if (params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function PropertyList({
  rows,
  selectedId,
  params,
  waitingIds,
}: {
  rows: PropertyListRow[]
  selectedId?: string
  params: PropertyListParams
  /** Ids with an open lease-waiting-list entry. Optional so the panel's
   *  own render of this list doesn't have to thread it through. */
  waitingIds?: Set<string>
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        {params.search
          ? `No properties match "${params.search}".`
          : emptyListMessage(params.filter)}
      </div>
    )
  }

  const qs = queryFor(params)

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const tone = severityTone(row.severityRank)
        const pills = reasonPills(row)
        const selected = row.id === selectedId
        const onWaitingList = waitingIds?.has(row.id) ?? false
        return (
          <li key={row.id}>
            <Link
              href={`/properties/${row.id}${qs}`}
              className={`block px-3 py-2.5 transition-colors hover:bg-muted/10 ${
                selected ? 'border-l-4 border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${severityDotClass(tone)}`}
                    title={severityLabel(row.severityRank)}
                    aria-hidden
                  />
                  <span className="sr-only">{severityLabel(row.severityRank)}</span>
                  <span
                    className="truncate text-sm font-semibold text-foreground"
                    title={row.address}
                  >
                    {streetOf(row.address)}
                    {row.unitNumber ? (
                      <span className="font-normal text-muted"> · {row.unitNumber}</span>
                    ) : null}
                  </span>
                </span>
                {row.balance > 0 ? (
                  <span className="shrink-0 text-xs font-bold tabular-nums text-destructive">
                    {money(row.balance)}
                  </span>
                ) : null}
              </div>
              <p className="truncate pl-4 text-xs text-muted">
                {/* `tenure` is an enum whose values include the literal
                    'unknown'. Rendering it printed the word "unknown"
                    beside every owner name on every row, which reads as
                    broken software rather than as absent data. An unknown
                    tenure now simply shows nothing. */}
                {[
                  row.ownerName ?? 'No owner on file',
                  row.tenure && row.tenure !== 'unknown'
                    ? row.tenure.replace(/_/g, '-')
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {pills.length > 0 || onWaitingList ? (
                <div className="flex flex-wrap gap-1 pl-4 pt-1">
                  {pills.map((p) => (
                    <span
                      key={p.text}
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                        p.tone === 'red'
                          ? 'bg-destructive/10 text-destructive'
                          : p.tone === 'amber'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : 'bg-muted/10 text-muted'
                      }`}
                    >
                      {p.text}
                    </span>
                  ))}
                  {/* Deliberately not a reasonPill: the severity pills all
                      mean "someone must act on this property", and sitting
                      in a queue is a state, not a problem. Primary tint
                      keeps it visually separate from red/amber work. */}
                  {onWaitingList ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      Waiting list
                    </span>
                  ) : null}
                </div>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
