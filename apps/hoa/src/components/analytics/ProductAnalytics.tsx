'use client'

import { useEffect } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { trackEvent } from '@/lib/analytics/track'
import type { AnalyticsEventName, AnalyticsEventProps } from '@/lib/analytics/events'
import { analyticsEnabled, scrubBeforeSend } from '@/lib/analytics/privacy'

/**
 * Vercel Web Analytics page views (BL-009), mounted by the board
 * ((dashboard)) and resident layouts only. Cookieless; every URL is
 * scrubbed to a route shape and Do Not Track drops the event
 * (lib/analytics/privacy.ts). Renders nothing unless
 * NEXT_PUBLIC_ANALYTICS_ENABLED is set.
 */
export function ProductAnalytics() {
  if (!analyticsEnabled()) return null
  return <Analytics beforeSend={scrubBeforeSend} />
}

/** Sends one allow-listed event when a server-rendered screen mounts. */
export function TrackOnMount<N extends AnalyticsEventName>({
  event,
  props,
}: {
  event: N
  props: AnalyticsEventProps<N>
}) {
  const key = JSON.stringify(props)
  useEffect(() => {
    trackEvent(event, JSON.parse(key) as AnalyticsEventProps<N>)
  }, [event, key])
  return null
}
