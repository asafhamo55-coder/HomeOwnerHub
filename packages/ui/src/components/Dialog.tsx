'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Dialog and Sheet — Radix Dialog underneath: focus trap, Esc to close,
 * focus returns to the trigger, background is inert to screen readers.
 *
 * Dialog: a centred modal for a short, focused task or decision.
 * Sheet: a panel from the right (default) or bottom, for a longer form or
 * a detail view that keeps the list behind it in context. On phones every
 * Dialog becomes a bottom sheet automatically.
 *
 * Every Dialog/Sheet needs a `title` (it is the accessible name). Use
 * `hideTitle` only when the visible design already shows the same words.
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

const overlayClass =
  'fixed inset-0 z-modal bg-[hsl(220_30%_6%/0.45)] backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out'

function CloseButton() {
  return (
    <DialogPrimitive.Close
      className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Close"
    >
      <X className="size-4" aria-hidden />
    </DialogPrimitive.Close>
  )
}

function Header({
  title,
  description,
  hideTitle,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  hideTitle?: boolean
}) {
  return (
    <div className={cn('space-y-1 pr-8', hideTitle && 'sr-only')}>
      <DialogPrimitive.Title className="text-lg font-semibold leading-snug text-foreground">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="text-sm text-muted">{description}</DialogPrimitive.Description>
      ) : null}
    </div>
  )
}

const DIALOG_SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const

export interface DialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  hideTitle?: boolean
  size?: keyof typeof DIALOG_SIZES
  /** Hide the corner X (only when the footer offers an explicit Cancel). */
  hideClose?: boolean
  /** Sticky action row; use `DialogFooter` or pass buttons directly. */
  footer?: React.ReactNode
}

export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, title, description, hideTitle, size = 'md', hideClose, footer, children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        ref={ref}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed z-modal flex max-h-[90dvh] w-full flex-col overflow-hidden border border-border bg-elevated text-foreground shadow-xl focus:outline-none',
          // Phone: bottom sheet. sm+: centred card.
          'inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-slide-up',
          // Centred without transforms so the scale-in keyframes cannot fight a translate.
          'sm:inset-0 sm:m-auto sm:h-fit sm:rounded-xl sm:data-[state=open]:animate-scale-in',
          DIALOG_SIZES[size],
          className,
        )}
        {...props}
      >
        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <Header title={title} description={description} hideTitle={hideTitle} />
          {children}
        </div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        {hideClose ? null : <CloseButton />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
)
DialogContent.displayName = 'DialogContent'

/** Action row. Primary action last (right on desktop, bottom on phones). */
export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6',
        '[&>button]:w-full sm:[&>button]:w-auto',
        className,
      )}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}

const SHEET_SIDES = {
  right:
    'inset-y-0 right-0 h-full w-full border-l sm:max-w-md data-[state=open]:animate-slide-in-right',
  left: 'inset-y-0 left-0 h-full w-full border-r sm:max-w-md data-[state=open]:animate-slide-in-left',
  bottom: 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t data-[state=open]:animate-slide-up',
} as const

export interface SheetContentProps extends DialogContentProps {
  side?: keyof typeof SHEET_SIDES
  /** Width on desktop for left/right sheets. */
  width?: 'md' | 'lg' | 'xl'
}

const SHEET_WIDTHS = { md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' } as const

export const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  (
    { className, title, description, hideTitle, side = 'right', width = 'md', hideClose, footer, children, size: _size, ...props },
    ref,
  ) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        ref={ref}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed z-modal flex flex-col border-border bg-elevated text-foreground shadow-xl focus:outline-none',
          SHEET_SIDES[side],
          side !== 'bottom' && SHEET_WIDTHS[width],
          className,
        )}
        {...props}
      >
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <Header title={title} description={description} hideTitle={hideTitle} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        {hideClose ? null : <CloseButton />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
)
SheetContent.displayName = 'SheetContent'
