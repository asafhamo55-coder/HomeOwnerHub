'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../lib/cn'

/**
 * Tooltip — a short (≤60 chars) label for an icon-only control or a
 * truncated value. Never put essential information only in a tooltip:
 * touch devices cannot hover. Icon buttons still need their own
 * `aria-label`; the tooltip is the sighted-mouse equivalent.
 *
 * Wrap the app once in `TooltipProvider` (AppShell does this).
 */

export const TooltipProvider = ({ children, delayDuration = 300 }: { children: React.ReactNode; delayDuration?: number }) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={200}>
    {children}
  </TooltipPrimitive.Provider>
)

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Keyboard shortcut shown after the label. */
  shortcut?: string
  /** Render nothing extra when true (e.g. label visible, sidebar expanded). */
  disabled?: boolean
}

export function Tooltip({ content, children, side = 'top', align = 'center', shortcut, disabled }: TooltipProps) {
  if (disabled) return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-popover flex max-w-xs items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md',
            'data-[state=delayed-open]:animate-fade-in',
          )}
        >
          {content}
          {shortcut ? <kbd className="font-sans text-background/70">{shortcut}</kbd> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
