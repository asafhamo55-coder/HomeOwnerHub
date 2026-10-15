'use client'

import * as React from 'react'

/**
 * Theme + shell preferences, persisted in localStorage and mirrored onto
 * <html> (`.dark` class, `data-sidebar` attribute).
 *
 * `THEME_INIT_SCRIPT` (theme-script.ts) must run before paint, inline in
 * the root layout's <head>, so neither dark mode nor a collapsed sidebar
 * flashes.
 */

export type ThemePreference = 'system' | 'light' | 'dark'

const THEME_KEY = 'theme'
const SIDEBAR_KEY = 'sidebar'
const THEME_EVENT = 'hh:theme'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode / storage disabled: the preference just won't persist.
  }
}

function resolve(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(pref: ThemePreference) {
  document.documentElement.classList.toggle('dark', resolve(pref) === 'dark')
}

export function useTheme(): {
  theme: ThemePreference
  resolved: 'light' | 'dark'
  setTheme: (t: ThemePreference) => void
} {
  const [theme, setThemeState] = React.useState<ThemePreference>('system')
  const [resolved, setResolved] = React.useState<'light' | 'dark'>('light')

  React.useEffect(() => {
    const stored = read(THEME_KEY)
    const pref: ThemePreference = stored === 'light' || stored === 'dark' ? stored : 'system'
    setThemeState(pref)
    setResolved(resolve(pref))
    // Keep every useTheme() instance (user menu, palette) in step.
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<ThemePreference>).detail
      setThemeState(next)
      setResolved(resolve(next))
    }
    window.addEventListener(THEME_EVENT, onChange)
    return () => window.removeEventListener(THEME_EVENT, onChange)
  }, [])

  React.useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      apply('system')
      setResolved(resolve('system'))
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = React.useCallback((t: ThemePreference) => {
    setThemeState(t)
    write(THEME_KEY, t)
    apply(t)
    setResolved(resolve(t))
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: t }))
  }, [])

  return { theme, resolved, setTheme }
}

export function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsedState] = React.useState(false)

  React.useEffect(() => {
    const v = read(SIDEBAR_KEY) === 'collapsed'
    setCollapsedState(v)
    document.documentElement.toggleAttribute('data-sidebar', false)
    if (v) document.documentElement.setAttribute('data-sidebar', 'collapsed')
  }, [])

  const setCollapsed = React.useCallback((v: boolean) => {
    setCollapsedState(v)
    write(SIDEBAR_KEY, v ? 'collapsed' : 'expanded')
    if (v) document.documentElement.setAttribute('data-sidebar', 'collapsed')
    else document.documentElement.removeAttribute('data-sidebar')
  }, [])

  return [collapsed, setCollapsed]
}
