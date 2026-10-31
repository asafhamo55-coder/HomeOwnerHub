'use client'

import * as React from 'react'
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { useSidebarCollapsed } from '../lib/theme'
import { TooltipProvider, Tooltip } from '../components/Tooltip'
import { SkipLink } from '../components/SkipLink'
import { SidebarContext } from './sidebar-context'

/**
 * AppShell — the board / platform-admin / pm / eviction frame.
 *
 *   <AppShell linkAs={Link}>
 *     <AppShellSidebar collapsible>
 *       <SidebarBrand>…org switcher…</SidebarBrand>
 *       <SidebarNav><SidebarSection label="Money"><NavItem …/></SidebarSection></SidebarNav>
 *       <SidebarFooter><SidebarCollapseToggle /></SidebarFooter>
 *     </AppShellSidebar>
 *     <AppShellMain>
 *       <AppShellHeader><AppShellSearchTrigger />…<UserMenu …/></AppShellHeader>
 *       <AppShellContent>{children}</AppShellContent>
 *     </AppShellMain>
 *     <CommandPalette commands={…} onNavigate={router.push} />
 *   </AppShell>
 *
 * Desktop: full-height sidebar column whose contents stick to the
 * viewport, collapsible to a 60px icon rail (persisted, no
 * flash — see THEME_INIT_SCRIPT). Phone: off-canvas drawer that closes on
 * any link click (Next <Link> is pushState and never fires popstate — the
 * phase-1 fix), on Esc, and on backdrop tap.
 */

interface AppShellContextValue {
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
  linkAs: React.ElementType
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null)

function useAppShellStrict() {
  const ctx = React.useContext(AppShellContext)
  if (!ctx) throw new Error('AppShell.* must be rendered inside <AppShell>')
  return ctx
}

/** Shell state for custom chrome. Returns null outside an AppShell. */
export function useAppShell(): AppShellContextValue | null {
  return React.useContext(AppShellContext)
}

export function AppShell({
  children,
  className,
  linkAs = 'a',
}: {
  children: React.ReactNode
  className?: string
  /** Router link component (next/link) used by NavItem and friends. */
  linkAs?: React.ElementType
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [collapsed, setCollapsed] = useSidebarCollapsed()

  // Back/forward closes the drawer too.
  React.useEffect(() => {
    if (!mobileOpen) return
    const close = () => setMobileOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('popstate', close)
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', close)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [mobileOpen])

  return (
    <AppShellContext.Provider
      value={{ mobileOpen, setMobileOpen, collapsed, setCollapsed, paletteOpen, setPaletteOpen, linkAs }}
    >
      <TooltipProvider>
        <SkipLink />
        <div className={cn('flex min-h-dvh bg-background', className)}>{children}</div>
      </TooltipProvider>
    </AppShellContext.Provider>
  )
}

export function AppShellSidebar({
  children,
  className,
  collapsible = false,
}: {
  children: React.ReactNode
  className?: string
  /**
   * Allow the desktop icon-rail mode. Only enable when every item is a
   * `NavItem` (they hide their labels and show tooltips when collapsed).
   */
  collapsible?: boolean
}) {
  const { mobileOpen, setMobileOpen } = useAppShellStrict()
  const ref = React.useRef<HTMLElement>(null)

  // Move focus into the drawer when it opens on a phone.
  React.useEffect(() => {
    if (!mobileOpen) return
    const first = ref.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')
    first?.focus()
  }, [mobileOpen])

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-[hsl(220_30%_6%/0.45)] backdrop-blur-[2px] transition-opacity duration-base md:hidden print:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      <aside
        ref={ref}
        data-collapsible={collapsible || undefined}
        className={cn(
          'group/sidebar fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-border bg-surface',
          'transition-[transform,width,visibility] duration-slow ease-emphasized',
          // Desktop: the <aside> is an in-flow column that stretches to the
          // full height of the page (so its surface + border never stop at
          // the first viewport on long pages); the inner wrapper below is
          // what sticks to the viewport.
          'md:relative md:inset-auto md:z-30 md:shrink-0 md:self-stretch md:w-sidebar md:max-w-none md:translate-x-0',
          collapsible && 'md:sidebar-collapsed:w-sidebar-collapsed',
          // Closed on a phone the drawer is only translated off-screen; without
          // `invisible` its links stay in the tab order with no visible focus
          // (WCAG 2.4.3 / 2.4.7). Visibility is in the transition, so it flips
          // only after the slide-out finishes.
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full max-md:invisible',
          // App chrome never prints (board packet, statements).
          'print:hidden',
          className,
        )}
        aria-label="Primary navigation"
        // Next <Link> navigation is pushState, which never fires the
        // popstate listener above, and the layout holding this state does
        // not remount — so without this the drawer stayed open over the
        // page the user just picked. Delegated: any link click inside the
        // drawer closes it. No-op on desktop, where the drawer is never open.
        onClickCapture={(e) => {
          if (mobileOpen && (e.target as HTMLElement).closest('a[href]')) setMobileOpen(false)
        }}
      >
        <div className="flex h-full min-h-0 flex-col md:sticky md:top-0 md:h-dvh">
          <SidebarContext.Provider value={{ collapsible }}>{children}</SidebarContext.Provider>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute right-2 top-1.5 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label="Close navigation"
          tabIndex={mobileOpen ? 0 : -1}
        >
          <X className="size-4" aria-hidden />
        </button>
      </aside>
    </>
  )
}

/** Desktop-only collapse/expand control. Put it in SidebarFooter. */
export function SidebarCollapseToggle({ className }: { className?: string }) {
  const { collapsed, setCollapsed } = useAppShellStrict()
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <Tooltip content={label} side="right" shortcut="⌘\">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={label}
        aria-pressed={collapsed}
        className={cn(
          'hidden size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-foreground md:inline-flex',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </Tooltip>
  )
}

export function AppShellMain({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('flex min-w-0 flex-1 flex-col', className)}>{children}</div>
}

export function AppShellHeader({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  const { mobileOpen, setMobileOpen, collapsed, setCollapsed } = useAppShellStrict()

  // ⌘\ / Ctrl+\ toggles the desktop sidebar.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setCollapsed(!collapsed)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, setCollapsed])

  return (
    <header
      className={cn(
        // `topbar` container: children use the bar-sm / bar-lg variants
        // (tailwind preset) to adapt to the bar's own width.
        'sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md [container-name:topbar] [container-type:inline-size] supports-[backdrop-filter]:bg-background/70 sm:px-4 md:px-6 print:hidden',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground-secondary hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
      >
        <Menu className="size-5" aria-hidden />
        <span>{mobileOpen ? 'Close' : 'Menu'}</span>
      </button>
      {children}
    </header>
  )
}

/**
 * The top-bar search field. Opens the CommandPalette (same as ⌘K). A
 * full field on desktop, an icon button on phones.
 */
export function AppShellSearchTrigger({
  placeholder = 'Search or jump to…',
  className,
}: {
  placeholder?: string
  className?: string
}) {
  const { setPaletteOpen } = useAppShellStrict()
  const [isMac, setIsMac] = React.useState(true)
  React.useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])
  return (
    <>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className={cn(
          // Shrinks first (min-w-0 flex-1) so the right-hand cluster never
          // overlaps it; collapses to the icon button below bar-sm, where a
          // field would be too narrow to read.
          'hidden h-9 min-w-0 max-w-sm flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted shadow-xs transition-colors hover:border-border-strong hover:text-foreground-secondary bar-sm:flex',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        aria-label="Open command palette"
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{placeholder}</span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-border bg-subtle px-1.5 font-sans text-xs font-medium text-muted bar-lg:inline-flex">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground-secondary hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bar-sm:hidden"
        aria-label="Search"
      >
        <Search className="size-5" aria-hidden />
      </button>
    </>
  )
}

export function AppShellContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main id="main" tabIndex={-1} className={cn('flex-1 px-4 pb-16 pt-6 focus:outline-none sm:px-6 md:pt-8 lg:px-8 print:p-0', className)}>
      {children}
    </main>
  )
}
