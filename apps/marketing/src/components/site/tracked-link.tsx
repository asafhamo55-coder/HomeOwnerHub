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

/**
 * A link that records one analytics event (page + position) when clicked.
 * An absolute URL (sign-up, sign-in: the app) is a plain <a>: next/link
 * would prefetch it whenever the app shares this site's origin, as in UI
 * shots, where the 404 prefetch never settled and every page timed out.
 */
export function TrackedLink({ href, event, position, className, onClick, children }: TrackedLinkProps) {
  const pathname = usePathname()
  const handleClick = () => {
    void trackEvent(event, { page: pageLabel(pathname), position })
    onClick?.()
  }
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={className} onClick={handleClick}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  )
}
