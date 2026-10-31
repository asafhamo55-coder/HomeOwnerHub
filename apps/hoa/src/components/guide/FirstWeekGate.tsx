'use client'

import { useEffect, useState } from 'react'
import {
  browserStorage,
  dismissBoardFirstWeek,
  dismissResidentFirstWeek,
  isBoardFirstWeekDismissed,
  isWithinFirstWeeks,
  recordResidentVisit,
} from '@/lib/guide/first-week'
import { FirstWeekCard } from './FirstWeekCard'

/**
 * Board dashboard: "Your first week on the board" for the org's first 14
 * days (from orgs.created_at), until dismissed in this browser. Decided
 * after mount, so the server render and the first client render agree
 * (nothing) and a dismissed card never flashes.
 */
export function BoardFirstWeek({
  orgId,
  orgCreatedAt,
  welcomeFor,
}: {
  orgId: string
  orgCreatedAt: string | null
  /** The HOA's name: an invited member gets the short welcome card instead of the full one. */
  welcomeFor?: string
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // The welcome card is for a member who just joined, which the org's age can't tell us (the
    // org may be years old), so it shows until dismissed. The full card is for a brand-new org.
    const inWindow = welcomeFor ? true : isWithinFirstWeeks(orgCreatedAt, Date.now())
    setShow(inWindow && !isBoardFirstWeekDismissed(browserStorage(), orgId))
  }, [orgId, orgCreatedAt, welcomeFor])

  if (!show) return null
  return (
    <FirstWeekCard
      variant="board"
      welcomeFor={welcomeFor}
      onDismiss={() => {
        dismissBoardFirstWeek(browserStorage(), orgId)
        setShow(false)
      }}
    />
  )
}

/**
 * /resident: "New here?" for a resident's first visits in this browser,
 * until dismissed. `scope` keeps one browser's HOAs apart (the org id).
 */
export function ResidentFirstWeek({ scope }: { scope: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(recordResidentVisit(browserStorage(), scope, Date.now()).show)
  }, [scope])

  if (!show) return null
  return (
    <FirstWeekCard
      variant="resident"
      onDismiss={() => {
        dismissResidentFirstWeek(browserStorage(), scope, Date.now())
        setShow(false)
      }}
    />
  )
}
