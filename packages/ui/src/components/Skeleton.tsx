import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Skeleton — a placeholder block while content loads. Purely decorative:
 * the loading region itself must announce `aria-busy` (PageSkeleton does).
 * The shimmer stops under prefers-reduced-motion (global rule).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-md bg-subtle bg-[linear-gradient(90deg,transparent_0%,hsl(var(--foreground)/0.06)_50%,transparent_100%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  )
}

/** A few lines of text-shaped skeleton. Last line is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}
