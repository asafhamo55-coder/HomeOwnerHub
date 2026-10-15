import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { controlBase, controlHeight } from '../lib/control'

/**
 * List filtering, the server-first way: every filter is a URL.
 *
 * Board lists (violations, tickets, ARC, communications, properties, the
 * inbox) each hand-rolled a search box and a row of status links. This is
 * the one toolbar: a row that wraps on phones, holding
 *
 *   <ListToolbar>
 *     <FilterChips label="Status" items={[{ label: 'Open', href, active, count }]} />
 *     <SearchForm action="/tickets" name="q" defaultValue={q} keep={{ status }} />
 *   </ListToolbar>
 *
 * No state, no hooks: works in a server component, and the back button,
 * reloads and shared links all keep the filter.
 */

export function ListToolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between', className)}>
      {children}
    </div>
  )
}

export interface FilterChipItem {
  label: React.ReactNode
  href: string
  active?: boolean
  /** Count shown after the label. `null`/undefined hides it; 0 is shown. */
  count?: number | null
}

export interface FilterChipsProps {
  items: FilterChipItem[]
  /** Accessible name for the group: "Filter by status". */
  label: string
  linkAs?: React.ElementType
  className?: string
}

/** Segmented link filter. Each chip is a link; the active one has `aria-current`. */
export function FilterChips({ items, label, linkAs: LinkAs = 'a', className }: FilterChipsProps) {
  return (
    <nav aria-label={label} className={cn('-mx-1 overflow-x-auto scrollbar-none px-1', className)}>
      <ul className="flex min-w-max items-center gap-1 rounded-lg border border-border bg-subtle p-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <LinkAs
              href={item.href}
              aria-current={item.active ? 'true' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium no-underline transition-colors duration-fast sm:h-7',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                item.active
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted hover:bg-surface/60 hover:text-foreground',
              )}
            >
              <span>{item.label}</span>
              {item.count != null ? (
                <span className={cn('num text-xs', item.active ? 'text-foreground-secondary' : 'text-muted')}>
                  {item.count}
                </span>
              ) : null}
            </LinkAs>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export interface SearchFormProps {
  /** Path the GET form submits to (the list's own route). */
  action: string
  /** Query param name. Default `q`. */
  name?: string
  defaultValue?: string
  placeholder?: string
  /** Accessible label; the placeholder is never the only label. */
  label: string
  /** Other params to keep when searching (current filters). Empty values are dropped. */
  keep?: Record<string, string | null | undefined>
  /** Where "Clear" goes. Omitted → `action` + `keep`. Only shown when there is a value. */
  clearHref?: string
  linkAs?: React.ElementType
  className?: string
}

/** A GET search box: Enter submits, Esc-free, no JS. Resets paging by design. */
export function SearchForm({
  action,
  name = 'q',
  defaultValue,
  placeholder,
  label,
  keep,
  clearHref,
  linkAs: LinkAs = 'a',
  className,
}: SearchFormProps) {
  const kept = Object.entries(keep ?? {}).filter((e): e is [string, string] => Boolean(e[1]))
  const clear =
    clearHref ??
    (kept.length > 0 ? `${action}?${new URLSearchParams(kept).toString()}` : action)
  const id = `search-${name}`
  return (
    <form action={action} method="get" role="search" className={cn('relative w-full sm:w-72', className)}>
      {kept.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id={id}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder ?? label}
        className={cn(controlBase, controlHeight, 'pl-9', defaultValue ? 'pr-9' : 'pr-3', '[&::-webkit-search-cancel-button]:hidden')}
      />
      {defaultValue ? (
        <LinkAs
          href={clear}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted no-underline hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </LinkAs>
      ) : null}
    </form>
  )
}
