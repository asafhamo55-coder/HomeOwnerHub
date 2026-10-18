'use client'

import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { openHelp } from '@/lib/guide/open-help'
import { trackHelp } from '@/lib/guide/track'

/**
 * The setup checklist's small "How?" link (spec §6.4). It opens the "?"
 * drawer on the step's article, so the person doesn't leave the dashboard.
 * With no drawer mounted (or JavaScript off) it is an ordinary link to the
 * article page.
 */
export function HowLink({ articleId, href, label, className }: { articleId: string; href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        if (openHelp({ articleId })) {
          e.preventDefault()
          trackHelp({ event: 'help.article_view', articleId, source: 'checklist' })
        }
      }}
      aria-label={`How to: ${label}`}
      className={cn(
        'inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs sm:min-h-7 font-medium text-muted transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <CircleHelp className="size-3.5" aria-hidden />
      How?
    </Link>
  )
}
