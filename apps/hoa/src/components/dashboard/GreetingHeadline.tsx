'use client'

import { useEffect, useState } from 'react'

// Greeting + date line computed in the BROWSER's timezone.
//
// Why this exists: the dashboard pages are server components, so a bare
// `new Date()` there evaluates in the SERVER's timezone — UTC on Vercel.
// A resident opening the page at 9am local would be greeted with
// "Good afternoon" because it's already past noon in UTC. This component
// ships to the client, reads the visitor's real local time on mount, and
// derives both the greeting and the weekday/date from it.
//
// Until mount we render a neutral "Hello" (never the wrong time-of-day)
// and the server-formatted date as a placeholder, so there's no layout
// shift and no misleading greeting is ever shown.

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}

export interface GreetingHeadlineProps {
  /** First name (or email prefix) to greet. Null greets without a name. */
  name: string | null
  /** Community / org label shown after the date. */
  contextLabel?: string | null
  /** Server-formatted date, used as the pre-hydration placeholder. */
  fallbackDate: string
}

export function GreetingHeadline({ name, contextLabel, fallbackDate }: GreetingHeadlineProps) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [])

  const dateLabel = now ? now.toLocaleDateString(undefined, DATE_OPTS) : fallbackDate
  const greet = now ? greetingFor(now.getHours()) : 'Hello'

  return (
    <>
      <p
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
        suppressHydrationWarning
      >
        {dateLabel}
        {contextLabel ? ` · ${contextLabel}` : ''}
      </p>
      <h1
        className="text-2xl font-semibold tracking-tight text-foreground"
        suppressHydrationWarning
      >
        {greet}
        {name ? `, ${name}` : ''}
      </h1>
    </>
  )
}
