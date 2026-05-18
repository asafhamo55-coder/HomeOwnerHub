'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  /** Render the select on a flat background (no surface fill). Useful
   *  when the parent already provides the surface (e.g. inline table
   *  cells, popovers). */
  variant?: 'default' | 'ghost'
}

// Inline SVG chevron rendered as a CSS background so the visual is
// consistent across Chrome / Safari / Firefox (the native arrow
// vendor-styles wildly between browsers, which is the #1 reason
// native selects "look bad"). Encoded as a data URI; stroke is
// tailwind text-muted (#6b7280).
const CHEVRON_BG = `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b7280' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='M4 6l4 4 4-4'/%3e%3c/svg%3e")`

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, variant = 'default', ...props }, ref) => {
    return (
      <select
        ref={ref}
        // appearance:none kills the OS chrome; the bg-image chevron
        // replaces it. min-h-10 instead of h-10 so a wrapping option
        // doesn't squash the control.
        className={cn(
          'block w-full min-h-10 appearance-none rounded-lg border bg-no-repeat py-2 pl-3 pr-9 text-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 focus:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'hover:border-foreground/30',
          variant === 'default'
            ? 'border-border bg-surface text-foreground'
            : 'border-transparent bg-transparent text-foreground hover:bg-muted/40',
          error && 'border-destructive focus:border-destructive focus:ring-destructive',
          className,
        )}
        style={{
          backgroundImage: CHEVRON_BG,
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1rem 1rem',
        }}
        {...props}
      >
        {children}
      </select>
    )
  },
)
Select.displayName = 'Select'
