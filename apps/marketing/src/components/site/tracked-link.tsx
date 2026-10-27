'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { pageLabel, trackEvent, type AnalyticsEvent } from '@/lib/analytics'

interface TrackedLinkProps {
  href: string
  /** demo_cta_click for "Book a demo" links, pilot_cta_click for "Start free pilot". */
  event: Extract<AnalyticsEvent, 'demo_cta_click' | 'pilot_cta_click'>
  /** Where on the page the button sits: "header", "closing", "hero", "mobile_menu"... */
  position: string
  className?: string
  onClick?: () => void
  children: React.ReactNode
}

/** A link that records one analytics event (page + position) when clicked. */
export function TrackedLink({ href, event, position, className, onClick, children }: TrackedLinkProps) {
  const pathname = usePathname()
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        void trackEvent(event, { page: pageLabel(pathname), position })
        onClick?.()
      }}
    >
      {children}
    </Link>
  )
}
