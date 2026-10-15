import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Alert — an inline, persistent message about the page or a section.
 * Tinted background + coloured icon + foreground text (the icon and title
 * carry the tone; body text stays at full contrast).
 */
const alertVariants = cva('flex gap-3 rounded-xl border p-4 text-sm text-foreground', {
  variants: {
    variant: {
      info: 'border-info/25 bg-info-subtle [--alert-icon:hsl(var(--info))]',
      success: 'border-success/25 bg-success-subtle [--alert-icon:hsl(var(--success))]',
      warning: 'border-warning/30 bg-warning-subtle [--alert-icon:hsl(var(--warning))]',
      error: 'border-danger/25 bg-danger-subtle [--alert-icon:hsl(var(--danger))]',
    },
  },
  defaultVariants: { variant: 'info' },
})

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string
  hideIcon?: boolean
  /** Buttons or links rendered under the body. */
  actions?: React.ReactNode
}

export function Alert({
  className,
  variant = 'info',
  title,
  hideIcon,
  actions,
  children,
  role,
  ...props
}: AlertProps) {
  const Icon = iconMap[variant ?? 'info']
  return (
    <div
      // Errors interrupt; everything else is announced politely.
      role={role ?? (variant === 'error' || variant === 'warning' ? 'alert' : 'status')}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {!hideIcon ? (
        <Icon className="mt-0.5 size-[18px] shrink-0 text-[color:var(--alert-icon)]" aria-hidden />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold leading-snug">{title}</p> : null}
        {children ? <div className="text-foreground-secondary [&_a]:font-medium [&_a]:text-foreground [&_a]:underline">{children}</div> : null}
        {actions ? <div className="flex flex-wrap gap-2 pt-2">{actions}</div> : null}
      </div>
    </div>
  )
}
