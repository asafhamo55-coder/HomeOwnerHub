'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { CornerDownLeft, Search } from 'lucide-react'
import { cn } from '../lib/cn'
import { useAppShell } from '../layouts/AppShell'

/**
 * ⌘K command palette. Apps supply the command list; the palette handles
 * the shortcut (⌘K / Ctrl+K, and "/" outside text fields), fuzzy
 * filtering (cmdk), arrow-key navigation, Enter to run, Esc to close.
 *
 * Inside an AppShell the open state is shared with AppShellSearchTrigger;
 * outside one, pass `open` / `onOpenChange`.
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

export interface CommandPaletteProps {
  commands: PaletteCommand[]
  /** Router push. Required if any command has an `href`. */
  onNavigate?: (href: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placeholder?: string
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

export function CommandPalette({
  commands,
  onNavigate,
  open: openProp,
  onOpenChange,
  placeholder = 'Search pages and actions…',
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

  const groups = React.useMemo(() => {
    const map = new Map<string, PaletteCommand[]>()
    for (const c of commands) {
      const g = c.group ?? 'Commands'
      map.set(g, [...(map.get(g) ?? []), c])
    }
    return [...map.entries()]
  }, [commands])

  function run(cmd: PaletteCommand) {
    setOpen(false)
    if (cmd.href && onNavigate) onNavigate(cmd.href)
    cmd.onSelect?.()
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
            className="flex max-h-[min(70vh,28rem)] flex-col"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
                className="h-12 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted sm:text-sm"
              />
              <kbd className="hidden shrink-0 rounded border border-border bg-subtle px-1.5 font-sans text-xs text-muted sm:inline">
                Esc
              </kbd>
            </div>
            <Command.List className="flex-1 overflow-y-auto overscroll-contain p-2 scroll-py-2">
              <Command.Empty className="px-3 py-10 text-center text-sm text-muted">
                No matches for “{query}”.
              </Command.Empty>
              {groups.map(([group, items]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted"
                >
                  {items.map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={`${cmd.label} ${cmd.id}`}
                      keywords={[...(cmd.keywords ?? []), ...(cmd.hint ? [cmd.hint] : [])]}
                      onSelect={() => run(cmd)}
                      className={cn(
                        'group flex cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground-secondary outline-none',
                        'data-[selected=true]:bg-subtle data-[selected=true]:text-foreground',
                        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted data-[selected=true]:[&_svg]:text-foreground-secondary',
                      )}
                    >
                      {cmd.icon ? <span className="flex size-5 items-center justify-center">{cmd.icon}</span> : null}
                      <span className="flex-1 truncate">
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
              ))}
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
