'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Button. One primary per view; everything else is `secondary` (alias
 * `outline`) or `ghost`. Sizes: sm 32px, md 36px, lg 44px (touch-first
 * CTAs). Icons go in `icon` / `iconRight`, never as raw children, so
 * spacing and the loading swap stay consistent.
 */
const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover',
        primary:
          'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover',
        secondary:
          'border border-border-strong bg-surface text-foreground shadow-xs hover:bg-subtle hover:border-input/60',
        outline:
          'border border-border-strong bg-surface text-foreground shadow-xs hover:bg-subtle hover:border-input/60',
        ghost: 'bg-transparent text-foreground-secondary hover:bg-subtle hover:text-foreground',
        subtle: 'bg-primary-subtle text-primary hover:bg-primary/15',
        destructive:
          'bg-danger-solid text-on-solid shadow-xs hover:bg-danger-solid/90',
        'destructive-ghost': 'bg-transparent text-danger hover:bg-danger-subtle',
        link: 'h-auto bg-transparent px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 px-3 text-sm [&_svg]:size-4',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-base [&_svg]:size-[18px]',
        icon: 'size-9 [&_svg]:size-4',
        'icon-sm': 'size-8 [&_svg]:size-4',
        'icon-xs': 'size-7 [&_svg]:size-3.5',
      },
    },
    // min-h-6: a standalone link-style button still meets the 24px target
    // minimum (WCAG 2.5.8) at size xs/sm, where its text line is shorter.
    compoundVariants: [{ variant: 'link', className: 'h-auto min-h-6 px-0' }],
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner, disables the button and sets aria-busy. Width is kept. */
  loading?: boolean
  /** Leading icon (a lucide element). Swapped for the spinner while loading. */
  icon?: React.ReactNode
  /** Trailing icon, e.g. a chevron or arrow. */
  iconRight?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild, loading, disabled, icon, iconRight, children, ...props },
    ref,
  ) => {
    // asChild path: hand off to whatever component the consumer passed
    // (typically a Next <Link>). Slot uses React.Children.only, so we
    // can't add a sibling spinner — loading state isn't meaningful for
    // nav links anyway.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      )
    }

    const isIconOnly = size === 'icon' || size === 'icon-sm' || size === 'icon-xs'

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          icon ?? null
        )}
        {isIconOnly && loading ? null : children}
        {iconRight ?? null}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
