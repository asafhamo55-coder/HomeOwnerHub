'use client'

// The one client island on /guides and /templates: a filter box over the
// cards. The cards are rendered from props, so the server HTML already holds
// the full list and a visitor without JavaScript sees all of it. The box only
// appears once the page has hydrated, so there is never a dead control.
// Relative imports only: tests render this file.

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, ClipboardCheck } from 'lucide-react'
import { filterSections, type LibrarySection } from '../../lib/library'

export function LibraryFilter({
  sections,
  linkLabel,
  kind,
  noun,
}: {
  sections: LibrarySection[]
  linkLabel: string
  kind: 'guide' | 'template'
  /** Plural noun for the label and count, such as "guides". */
  noun: string
}) {
  const [query, setQuery] = React.useState('')
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => setReady(true), [])
  const inputId = React.useId()
  const Icon = kind === 'guide' ? BookOpen : ClipboardCheck

  const total = sections.reduce((n, s) => n + s.items.length, 0)
  const shown = filterSections(sections, query)
  const count = shown.reduce((n, s) => n + s.items.length, 0)
  const searching = query.trim().length > 0

  return (
    <>
      {ready && (
        <div className="border-t border-border">
          <div className="container-page py-8">
            <div className="mx-auto max-w-4xl">
              <label htmlFor={inputId} className="block text-sm font-semibold text-foreground">
                Search {noun}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id={inputId}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try a state, a statute or a topic"
                  autoComplete="off"
                  className="min-h-11 w-full max-w-md rounded-lg border border-border bg-surface px-4 text-[15px] text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {searching && (
                  <button type="button" onClick={() => setQuery('')} className="btn btn-secondary">
                    Clear
                  </button>
                )}
              </div>
              <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
                {searching ? `${count} of ${total} ${noun} match` : `${total} ${noun}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {count === 0 && (
        <section className="section border-t border-border">
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <h2 className="t-h2 text-foreground">No {noun} match your search</h2>
              <p className="t-lead mt-4 max-w-2xl">
                Nothing matches “{query.trim()}”. Check the spelling, try fewer words, or clear the search to see every page.
              </p>
              <button type="button" onClick={() => setQuery('')} className="btn btn-secondary mt-6">
                Show all {noun}
              </button>
            </div>
          </div>
        </section>
      )}

      {shown.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`${s.id}-heading`}
          className={`section scroll-mt-24 border-t border-border ${i % 2 === 0 ? '' : 'bg-surface'}`}
        >
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <h2 id={`${s.id}-heading`} className="t-h2 text-foreground">
                {s.label}
              </h2>
              {s.blurb && <p className="t-lead mt-4 max-w-2xl">{s.blurb}</p>}
              <ul className="mt-8 grid gap-4 md:grid-cols-2">
                {s.items.map((l) => (
                  <li key={l.path}>
                    <Link href={l.path} className="card group flex h-full flex-col p-6 transition-shadow hover:shadow-md">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                      <span className="mt-3 text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary">{l.title}</span>
                      <span className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{l.description}</span>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                        {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ))}
    </>
  )
}
