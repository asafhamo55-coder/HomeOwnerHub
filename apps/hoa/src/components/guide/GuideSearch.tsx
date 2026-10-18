'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Button, Input } from '@homeowner-portal/ui'
import { searchBm25 } from '@/lib/guide/bm25'
import type { InstantSearchData } from '@/lib/guide'
import { lengthBucket } from '@/lib/guide/help-buckets'
import { trackHelp } from '@/lib/guide/track'

/**
 * Help-centre search (spec §6.1): instant results over titles, summaries
 * and keywords while typing (client, prebuilt BM25 index); Enter submits
 * `?q=` so the server runs full-text search over every section.
 */
export function GuideSearch({
  data,
  action,
  initialQuery = '',
  autoFocusDesktop = true,
}: {
  data: InstantSearchData
  /** The page the form submits to (`/help` or `/resident/help`). */
  action: string
  initialQuery?: string
  autoFocusDesktop?: boolean
}) {
  const [query, setQuery] = useState(initialQuery)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocusDesktop) return
    try {
      if (window.matchMedia('(min-width: 768px)').matches) input.current?.focus()
    } catch {
      // matchMedia unavailable: no autofocus
    }
  }, [autoFocusDesktop])

  const allow = useMemo(() => new Set(data.articles.map((a) => a.id)), [data.articles])
  const typing = query.trim().length > 0 && query.trim() !== initialQuery.trim()
  const hits = useMemo(() => {
    if (!typing) return []
    const byId = new Map(data.articles.map((a) => [a.id, a]))
    return searchBm25(data.index, query, { prefixLast: true, allow, limit: 6 })
      .map((h) => byId.get(h.id))
      .filter((a): a is InstantSearchData['articles'][number] => !!a)
  }, [typing, data, query, allow])

  return (
    <div className="space-y-2">
      <form
        action={action}
        method="get"
        role="search"
        className="flex gap-2"
        // Counts and a length bucket only: never the query itself.
        onSubmit={() => trackHelp({ event: 'help.search', resultCount: Math.min(hits.length, 50), queryLengthBucket: lengthBucket(query.trim().length) })}
      >
        <label htmlFor="guide-search" className="sr-only">
          Search the help guide
        </label>
        <div className="min-w-0 flex-1">
          <Input
            ref={input}
            id="guide-search"
            name="q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="How do I…?"
            autoComplete="off"
            prefix={<Search className="size-4" aria-hidden />}
            aria-describedby="guide-search-hint"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <p id="guide-search-hint" className="sr-only">
        Results update as you type. Press Enter to search every article.
      </p>
      {typing ? (
        <div aria-live="polite" className="rounded-xl border border-border bg-surface">
          {hits.length > 0 ? (
            <ul className="divide-y divide-border">
              {hits.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="block px-4 py-3 no-underline transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="block text-sm font-medium text-foreground">{a.title}</span>
                    <span className="block text-xs text-muted">{a.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">
              No article titles match yet. Press Enter to search the full text of every article.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
