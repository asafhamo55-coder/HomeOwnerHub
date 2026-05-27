'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

/**
 * Theme toggle. Cycles system → light → dark → system on click.
 *
 * Storage: `localStorage.theme = 'system' | 'light' | 'dark'`. The
 * pre-paint inline script in app/layout.tsx reads this on first load
 * and applies .dark to <html> before any render — no FOUC.
 *
 * System mode listens to the OS color-scheme media query so flipping
 * macOS / iOS dark mode at the OS level reflows the app immediately
 * without a refresh.
 *
 * The button label is sr-only (icon-only visible) so it fits next to
 * Sign Out in the sidebar footer. Tooltip carries the current state.
 */
type Theme = 'system' | 'light' | 'dark'
const STORAGE_KEY = 'theme'

function readStored(): Theme {
  if (typeof window === 'undefined') return 'system'
  const v = window.localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'system'
}

function resolveActive(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyToHtml(active: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', active === 'dark')
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('system')

  // Hydrate from storage AFTER mount — server can't know what's in
  // localStorage. We don't read storage during render because the
  // inline script in layout.tsx already applied the right class
  // pre-paint; this just syncs the React state to it.
  useEffect(() => {
    setTheme(readStored())
  }, [])

  // When in 'system' mode, react to OS theme changes live.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyToHtml(resolveActive('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  function setAndPersist(next: Theme) {
    setTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    applyToHtml(resolveActive(next))
  }

  function cycle() {
    setAndPersist(
      theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system',
    )
  }

  const labelFor: Record<Theme, string> = {
    system: 'Theme: follows system (click for light)',
    light: 'Theme: light (click for dark)',
    dark: 'Theme: dark (click for system)',
  }

  const Icon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={cycle}
      title={labelFor[theme]}
      aria-label={labelFor[theme]}
      className={
        className ??
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground'
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
