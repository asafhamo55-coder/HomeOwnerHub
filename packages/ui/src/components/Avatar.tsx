'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '../lib/cn'

/**
 * Avatar — photo with an initials fallback. The fallback colour is derived
 * from the name, so the same person is always the same colour; all fallback
 * pairs are dark text on a light tint (or the reverse in dark mode) at
 * ≥4.5:1. Decorative by default: put the person's name in adjacent text.
 */

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-24 text-2xl',
} as const

// Hand-picked so text-*-800 on bg-*-100 (and *-200 on *-500/20 in dark)
// clear AA. Status hues are excluded so an avatar never reads as a state.
const HUES = [
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/20 dark:text-fuchsia-200',
  'bg-slate-200 text-slate-800 dark:bg-slate-500/25 dark:text-slate-200',
] as const

export function initialsOf(name: string): string {
  const cleaned = (name.split('@')[0] ?? name).replace(/[._-]+/g, ' ').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')
  return (letters || name.slice(0, 2)).toUpperCase()
}

function hueFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]!
}

export interface AvatarProps {
  /** Person or org name (or an email). Drives initials and colour. */
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  /** Rounded square for organisations; circle for people. */
  shape?: 'circle' | 'square'
  className?: string
  /** Set when the avatar is the only thing naming the person. */
  label?: string
}

export function Avatar({ name, src, size = 'sm', shape = 'circle', className, label }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold',
        shape === 'circle' ? 'rounded-full' : 'rounded-lg',
        SIZES[size],
        className,
      )}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className={cn('flex size-full items-center justify-center', hueFor(name))}
      >
        {initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
