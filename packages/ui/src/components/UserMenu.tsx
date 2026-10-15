'use client'

import * as React from 'react'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '../lib/cn'
import { useTheme, type ThemePreference } from '../lib/theme'
import { Avatar } from './Avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu'

/**
 * Top-bar account menu: avatar trigger → identity, app-supplied items,
 * theme (Light / Dark / System) and Sign out.
 */
export interface UserMenuProps {
  /** Display name; falls back to the email. */
  name?: string | null
  email: string
  /** Secondary line under the email (e.g. "Board · Madison Park"). */
  subtitle?: React.ReactNode
  /** Extra DropdownMenuItems (Settings, Billing…), rendered above Theme. */
  children?: React.ReactNode
  /** Show the theme switcher (apps without dark-mode support pass false). */
  themeSwitcher?: boolean
  onSignOut?: () => void | Promise<void>
  className?: string
}

const THEMES: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun aria-hidden /> },
  { value: 'dark', label: 'Dark', icon: <Moon aria-hidden /> },
  { value: 'system', label: 'System', icon: <Monitor aria-hidden /> },
]

export function UserMenu({
  name,
  email,
  subtitle,
  children,
  themeSwitcher = true,
  onSignOut,
  className,
}: UserMenuProps) {
  const { theme, setTheme } = useTheme()
  const display = name || email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label={`Account menu for ${display}`}
        >
          <Avatar name={display} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={display} size="md" />
          <div className="min-w-0">
            {name ? <p className="truncate text-sm font-medium text-foreground">{name}</p> : null}
            <p className={cn('truncate text-foreground', name ? 'text-xs text-muted' : 'text-sm font-medium')}>{email}</p>
            {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
        {themeSwitcher ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
              {THEMES.map((t) => (
                <DropdownMenuRadioItem
                  key={t.value}
                  value={t.value}
                  icon={t.icon}
                  onSelect={(e) => e.preventDefault()}
                >
                  {t.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        {onSignOut ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<LogOut aria-hidden />} onSelect={() => void onSignOut()}>
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
