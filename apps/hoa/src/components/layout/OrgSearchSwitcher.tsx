'use client'

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { setActiveOrg } from '@/app/actions/set-active-org'
import { searchMyOrgs, type OrgSearchHit } from '@/app/actions/search-my-orgs'

interface Props {
  currentOrgId: string
  currentOrgName: string
}

const DEBOUNCE_MS = 250

// The switcher for someone who belongs to more communities than a list can
// hold (a management company). A search box finds a community by name, 20 at
// a time, from the server; nothing here ever holds the whole list. Plain
// button + panel rather than a menu so the arrow and typing keys belong to
// the search box.
export function OrgSearchSwitcher({ currentOrgId, currentOrgName }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [hits, setHits] = useState<OrgSearchHit[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [switching, startSwitch] = useTransition()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const latest = useRef(0)
  const panelId = useId()

  const load = useCallback(async (query: string, pageNo: number, append: boolean) => {
    const ticket = ++latest.current
    setLoading(true)
    setError(null)
    const result = await searchMyOrgs(query, pageNo)
    if (ticket !== latest.current) return // a newer search replaced this one
    setLoading(false)
    if (!result.ok) {
      setError(result.reason)
      return
    }
    setHits((prev) => (append ? [...prev, ...result.orgs] : result.orgs))
    setHasMore(result.hasMore)
    setPage(pageNo)
  }, [])

  // Search as the person types, after a short pause. Also runs on open, so
  // the first page of communities shows before anything is typed.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void load(text, 0, false), text ? DEBOUNCE_MS : 0)
    return () => clearTimeout(t)
  }, [open, text, load])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(orgId: string) {
    if (orgId === currentOrgId) {
      close()
      return
    }
    setError(null)
    startSwitch(async () => {
      const result = await setActiveOrg(orgId)
      if (!result.ok) {
        setError('We could not switch to that community. Please try again.')
        return
      }
      window.location.href = '/'
    })
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-org-option]') ?? [])]
    if (items.length === 0) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') items[Math.min(at + 1, items.length - 1)].focus()
    else if (at <= 0) inputRef.current?.focus()
    else items[at - 1].focus()
  }

  return (
    // role="presentation": the wrapper only catches keys bubbling up from the
    // real controls inside it (Escape, arrows); it is not itself a control.
    <div ref={rootRef} role="presentation" className="relative" onKeyDown={onPanelKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'flex min-h-11 w-full items-center gap-1 rounded-md py-0.5 text-left sm:min-h-0 transition-colors',
          'hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
        aria-label={`Switch HOA, current: ${currentOrgName}`}
      >
        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={currentOrgName}>
          {currentOrgName}
        </span>
        {switching ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted" />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Find a community"
          className="absolute left-0 top-full z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-2 shadow-lg"
        >
          <label htmlFor={`${panelId}-q`} className="block px-1 pb-1 text-sm font-medium text-foreground">
            Find a community
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id={`${panelId}-q`}
              ref={inputRef}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type part of the name"
              autoComplete="off"
              maxLength={80}
              className="min-h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <ul className="mt-2 max-h-72 overflow-y-auto" aria-busy={loading}>
            {hits.map((org) => {
              const isCurrent = org.id === currentOrgId
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    data-org-option
                    disabled={switching}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => choose(org.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                      'hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60',
                      isCurrent ? 'text-foreground' : 'text-foreground-secondary',
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isCurrent ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{org.name}</span>
                      {org.doors_count !== null && (
                        <span className="block text-xs text-muted">{org.doors_count} doors</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div role="status" aria-live="polite" className="px-1 pt-1 text-xs text-muted">
            {loading && hits.length === 0
              ? 'Looking...'
              : !loading && !error && hits.length === 0
                ? text
                  ? 'No community matches that. Check the spelling.'
                  : 'No communities to show.'
                : ''}
          </div>

          {hasMore && (
            <button
              type="button"
              data-org-option
              disabled={loading}
              onClick={() => void load(text, page + 1, true)}
              className="mt-1 flex min-h-11 w-full items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {loading ? 'Looking...' : 'Show more communities'}
            </button>
          )}

          {error && (
            <p className="px-1 pt-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
