'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Command, defaultFilter } from 'cmdk'
import { AlertCircle, CornerDownLeft, Loader2, Search } from 'lucide-react'
import { cn } from '../lib/cn'
import { createDebouncedSearch, type SearchState } from '../lib/debounced-search'
import { useAppShell } from '../layouts/AppShell'

/**
 * ⌘K command palette. Apps supply the command list; the palette handles
 * the shortcut (⌘K / Ctrl+K, and "/" outside text fields), fuzzy
 * filtering (cmdk), arrow-key navigation, Enter to run, Esc to close.
 *
 * Inside an AppShell the open state is shared with AppShellSearchTrigger;
 * outside one, pass `open` / `onOpenChange`.
 *
 * Record search (`search`): the palette also asks the app for records
 * matching the query — debounced, the in-flight request aborted when the
 * query changes — and lists them after the matching commands, in the groups
 * the app returns. Loading, failure and "no records" are each stated in the
 * list, never collapsed into one another. Records are not re-filtered
 * client-side: the server decided they match (e.g. a violation found
 * through its owner's name), so cmdk's own filter is turned off and the
 * static commands are filtered here with cmdk's scorer instead.
 */

export interface PaletteCommand {
  id: string
  label: string
  /** Section heading, e.g. "Go to", "Create", "Account". */
  group?: string
  /** Navigates via `onNavigate(href)`. */
  href?: string
  /** Runs instead of (or after) navigation. */
  onSelect?: () => void
  /** Extra search terms ("money", "assessments" for Dues). */
  keywords?: string[]
  icon?: React.ReactNode
  /** Display-only shortcut hint, e.g. "G D". */
  shortcut?: string
  /** One muted line after the label (e.g. the section it lives in). */
  hint?: string
}

export interface PaletteSearchResult {
  /** Record hits; `group` is the section heading ("Owners", "Violations"). */
  commands: PaletteCommand[]
  /** One muted line under the results, e.g. that some record types could not be searched. */
  notice?: string
}

export interface CommandPaletteProps {
  commands: PaletteCommand[]
  /** Router push. Required if any command has an `href`. */
  onNavigate?: (href: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placeholder?: string
  /**
   * Server-side record search, called with the trimmed query once typing
   * pauses. Reject with an Error whose message is fit to show a person.
   */
  search?: (query: string, signal: AbortSignal) => Promise<PaletteSearchResult>
  /** Shortest query that triggers `search`. */
  searchMinLength?: number
  searchDebounceMs?: number
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/** With record search on, the lowest cmdk score a page/action needs to be listed. */
const COMMAND_MIN_SCORE = 0.1

function groupBy(commands: PaletteCommand[], fallback: string): Array<[string, PaletteCommand[]]> {
  const map = new Map<string, PaletteCommand[]>()
  for (const c of commands) {
    const g = c.group ?? fallback
    map.set(g, [...(map.get(g) ?? []), c])
  }
  return [...map.entries()]
}

export function CommandPalette({
  commands,
  onNavigate,
  open: openProp,
  onOpenChange,
  placeholder,
  search,
  searchMinLength = 2,
  searchDebounceMs = 200,
}: CommandPaletteProps) {
  const shell = useAppShell()
  const [localOpen, setLocalOpen] = React.useState(false)
  const open = openProp ?? shell?.paletteOpen ?? localOpen
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (onOpenChange) onOpenChange(v)
      else if (shell) shell.setPaletteOpen(v)
      else setLocalOpen(v)
    },
    [onOpenChange, shell],
  )
  const [query, setQuery] = React.useState('')
  const inputPlaceholder =
    placeholder ?? (search ? 'Search people, records and pages…' : 'Search pages and actions…')

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      } else if (e.key === '/' && !open && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // ── Record search ────────────────────────────────────────────────
  const [searchState, setSearchState] = React.useState<SearchState<PaletteSearchResult>>({ status: 'idle' })
  const searchRef = React.useRef(search)
  searchRef.current = search
  const searchEnabled = Boolean(search)
  const searcher = React.useMemo(
    () =>
      searchEnabled
        ? createDebouncedSearch<PaletteSearchResult>({
            search: (q, signal) =>
              searchRef.current ? searchRef.current(q, signal) : Promise.resolve({ commands: [] }),
            onState: setSearchState,
            delayMs: searchDebounceMs,
            minLength: searchMinLength,
          })
        : null,
    [searchEnabled, searchDebounceMs, searchMinLength],
  )
  React.useEffect(() => {
    if (!searcher) return
    if (open) searcher.update(query)
    else searcher.cancel()
  }, [searcher, open, query])
  React.useEffect(() => () => searcher?.cancel(), [searcher])

  const groups = React.useMemo(() => {
    const q = query.trim()
    if (!searchEnabled || !q) return groupBy(commands, 'Commands')
    const visible = commands
      .map((c) => ({
        c,
        score: defaultFilter(`${c.label} ${c.id}`, q, [...(c.keywords ?? []), ...(c.hint ? [c.hint] : [])]),
      }))
      // cmdk's scorer gives a scattered-letter match a tiny score ("Sample"
      // → "Violations", 0.0008). Alone that is harmless; above record hits it
      // buries what the person was looking for, so only real (word/prefix)
      // matches stay — those score ~0.9.
      .filter((x) => x.score >= COMMAND_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c)
    return groupBy(visible, 'Commands')
  }, [commands, query, searchEnabled])

  const recordGroups = React.useMemo(
    () => (searchState.status === 'ready' ? groupBy(searchState.results.commands, 'Records') : []),
    [searchState],
  )

  const trimmed = query.trim()
  // Below the record-search minimum nothing else will arrive, so an empty
  // command list is a plain "no matches".
  const noMatches = searchEnabled && trimmed.length > 0 && groups.length === 0 && searchState.status === 'idle'

  function run(cmd: PaletteCommand) {
    setOpen(false)
    if (cmd.href && onNavigate) onNavigate(cmd.href)
    cmd.onSelect?.()
  }

  function renderGroup(group: string, items: PaletteCommand[], kind: 'command' | 'record') {
    return (
      <Command.Group
        key={`${kind}:${group}`}
        heading={group}
        className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted"
      >
        {items.map((cmd) => (
          <Command.Item
            key={cmd.id}
            value={kind === 'record' ? `record:${cmd.id}` : `${cmd.label} ${cmd.id}`}
            keywords={[...(cmd.keywords ?? []), ...(cmd.hint ? [cmd.hint] : [])]}
            onSelect={() => run(cmd)}
            className={cn(
              'group flex cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground-secondary outline-none',
              'data-[selected=true]:bg-subtle data-[selected=true]:text-foreground',
              '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted data-[selected=true]:[&_svg]:text-foreground-secondary',
            )}
          >
            {cmd.icon ? <span className="flex size-5 shrink-0 items-center justify-center">{cmd.icon}</span> : null}
            <span className="min-w-0 flex-1 truncate">
              {cmd.label}
              {cmd.hint ? <span className="ml-2 text-xs text-muted">{cmd.hint}</span> : null}
            </span>
            {cmd.shortcut ? (
              <kbd className="font-sans text-xs text-muted">{cmd.shortcut}</kbd>
            ) : (
              <CornerDownLeft className="invisible group-data-[selected=true]:visible" aria-hidden />
            )}
          </Command.Item>
        ))}
      </Command.Group>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-[hsl(220_30%_6%/0.35)] backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-3 top-[12vh] z-modal mx-auto max-w-xl overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-xl focus:outline-none',
            'data-[state=open]:animate-scale-in',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command
            label="Command palette"
            loop
            shouldFilter={!searchEnabled}
            className="flex max-h-[min(70vh,28rem)] flex-col"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={inputPlaceholder}
                className="h-12 w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted sm:text-sm"
              />
              <kbd className="hidden shrink-0 rounded border border-border bg-subtle px-1.5 font-sans text-xs text-muted sm:inline">
                Esc
              </kbd>
            </div>
            <Command.List className="flex-1 overflow-y-auto overscroll-contain p-2 scroll-py-2">
              {searchEnabled ? (
                noMatches ? (
                  <div className="px-3 py-10 text-center text-sm text-muted">No matches for “{trimmed}”.</div>
                ) : null
              ) : (
                <Command.Empty className="px-3 py-10 text-center text-sm text-muted">
                  No matches for “{query}”.
                </Command.Empty>
              )}
              {groups.map(([group, items]) => renderGroup(group, items, 'command'))}
              {recordGroups.map(([group, items]) => renderGroup(group, items, 'record'))}
              {searchEnabled ? (
                <RecordSearchStatus state={searchState} hasRecords={recordGroups.length > 0} />
              ) : null}
            </Command.List>
            <div className="hidden items-center gap-4 border-t border-border bg-surface px-4 py-2 text-xs text-muted sm:flex">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-subtle px-1 font-sans">↑</kbd>
                <kbd className="rounded border border-border bg-subtle px-1 font-sans">↓</kbd>
                to navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-subtle px-1 font-sans">↵</kbd>
                to open
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * The record-search line at the foot of the list: what the search is doing,
 * said plainly. `data-search-state` lets the screenshot harness wait on it.
 */
function RecordSearchStatus({
  state,
  hasRecords,
}: {
  state: SearchState<PaletteSearchResult>
  hasRecords: boolean
}) {
  const row = 'flex items-start gap-2 px-2.5 py-2 text-sm'
  return (
    <div role="status" aria-live="polite" data-search-state={state.status}>
      {state.status === 'loading' ? (
        <div className={cn(row, 'text-muted')}>
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
          <span>Searching records…</span>
        </div>
      ) : state.status === 'error' ? (
        <div className={cn(row, 'text-danger')}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">Couldn’t search records. {state.message}</span>
        </div>
      ) : state.status === 'ready' && !hasRecords ? (
        <div className={cn(row, 'text-muted')}>
          <span className="min-w-0 break-words">No records match “{state.query}”.</span>
        </div>
      ) : null}
      {state.status === 'ready' && state.results.notice ? (
        <div className={cn(row, 'text-xs text-muted')}>
          <span className="min-w-0">{state.results.notice}</span>
        </div>
      ) : null}
    </div>
  )
}
