import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

/**
 * Card — the one container for grouped content. 12px radius, hairline
 * border, no shadow at rest (calm); `interactive` lifts on hover, `elevated`
 * is for content floating over other content.
 */
const cardVariants = cva('rounded-xl bg-surface text-foreground', {
  variants: {
    variant: {
      default: 'border border-border',
      elevated: 'border border-border shadow-md',
      interactive:
        'border border-border transition-[border-color,box-shadow] duration-base ease-standard hover:border-border-strong hover:shadow-md cursor-pointer',
      ghost: 'border-0 bg-transparent',
      subtle: 'border border-border bg-subtle',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  ),
)
Card.displayName = 'Card'

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Right-aligned actions on the header row (a button, a menu, a link). */
  actions?: React.ReactNode
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, actions, children, ...props }, ref) =>
    actions ? (
      <div ref={ref} className={cn('flex items-start justify-between gap-4 p-5', className)} {...props}>
        <div className="flex min-w-0 flex-col gap-1">{children}</div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    ) : (
      <div ref={ref} className={cn('flex flex-col gap-1 p-5', className)} {...props}>
        {children}
      </div>
    ),
)
CardHeader.displayName = 'CardHeader'

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * Heading level. Defaults to h3 for backward compatibility; pass `h2`
   * when the card sits directly under the page's h1 (audit finding 16).
   */
  as?: 'h2' | 'h3' | 'h4' | 'p'
}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Tag = 'h3', ...props }, ref) => (
    <Tag
      ref={ref}
      className={cn('text-base font-semibold leading-snug tracking-[-0.005em] text-foreground', className)}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 border-t border-border px-5 py-3', className)}
      {...props}
    />
  ),
)
CardFooter.displayName = 'CardFooter'
