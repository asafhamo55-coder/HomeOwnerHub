'use client'

// The one client island on /guides and /templates: a filter box over the
// cards. The cards are rendered from props, so the server HTML already holds
// the full list and a visitor without JavaScript sees all of it. The box only
// appears once the page has hydrated, so there is never a dead control.
// Relative imports only: tests render this file.

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, ClipboardCheck } from 'lucide-react'
import { filterSections, narrowSections, GUIDE_TOPICS, type LibrarySection, type LibraryItem } from '../../lib/library'

export function LibraryFilter({
  sections,
  linkLabel,
  kind,
  noun,
  featured = [],
}: {
  sections: LibrarySection[]
  linkLabel: string
  kind: 'guide' | 'template'
  /** Plural noun for the label and count, such as "guides". */
  noun: string
  /** Hand-picked guides shown above the list while nothing is filtered. */
  featured?: LibraryItem[]
}) {
  const [query, setQuery] = React.useState('')
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => setReady(true), [])
  const inputId = React.useId()
  const Icon = kind === 'guide' ? BookOpen : ClipboardCheck

  const total = sections.reduce((n, s) => n + s.items.length, 0)
  const [group, setGroup] = React.useState<string | null>(null)
  const [topicId, setTopicId] = React.useState<string | null>(null)
  const topic = GUIDE_TOPICS.find((t) => t.id === topicId) ?? null
  const chips = kind === 'guide'
  const narrowed = chips ? narrowSections(sections, group, topic) : [...sections]
  const shown = filterSections(narrowed, query)
  const count = shown.reduce((n, s) => n + s.items.length, 0)
  const searching = query.trim().length > 0 || !!group || !!topic

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
                  <button type="button" onClick={() => { setQuery(''); setGroup(null); setTopicId(null) }} className="btn btn-secondary">
                    Clear
                  </button>
                )}
              </div>
              <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
                {searching ? `${count} of ${total} ${noun} match` : `${total} ${noun}`}
              </p>
              {chips && (
                <div className="mt-6 space-y-4">
                  <ChipRow label="State" value={group} onChange={setGroup} options={sections.map((s) => ({ id: s.id, label: s.label }))} />
                  <ChipRow label="Topic" value={topicId} onChange={setTopicId} options={GUIDE_TOPICS.map((t) => ({ id: t.id, label: t.label }))} />
                </div>
              )}
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
              <button type="button" onClick={() => { setQuery(''); setGroup(null); setTopicId(null) }} className="btn btn-secondary mt-6">
                Show all {noun}
              </button>
            </div>
          </div>
        </section>
      )}

      {featured.length > 0 && !searching && (
        <section aria-labelledby="featured-heading" className="section border-t border-border">
          <div className="container-page">
            <div className="mx-auto max-w-4xl">
              <h2 id="featured-heading" className="t-h2 text-foreground">Start here</h2>
              <p className="t-lead mt-4 max-w-2xl">The guides boards open most often when a notice, a lien or a hearing is on the table.</p>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {featured.map((l) => (
                  <Link key={l.path} href={l.path} className="card group flex h-full flex-col border-t-4 border-t-primary p-6 transition-shadow hover:shadow-lg">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">Featured guide</span>
                    <span className="mt-3 text-[19px] font-semibold leading-snug text-foreground group-hover:text-primary">{l.title}</span>
                    <span className="mt-3 text-[16px] leading-relaxed text-foreground-secondary">{l.description}</span>
                    <span className="mt-auto inline-flex items-center gap-1 pt-5 text-[15px] font-semibold text-primary">
                      {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                ))}
              </div>
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

function ChipRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  options: { id: string; label: string }[]
}) {
  const base = 'inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--primary))]'
  const on = 'border-primary bg-primary text-primary-fg'
  const off = 'border-border bg-surface text-foreground hover:border-primary'
  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 w-14 text-sm font-semibold text-foreground">{label}</span>
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={`${base} ${value === null ? on : off}`}>
        All
      </button>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(value === o.id ? null : o.id)} className={`${base} ${value === o.id ? on : off}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
