'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadEarlierViolationCounts } from '@/lib/violations/earlier-actions'
import { earlierLine, type EarlierCounts } from '@/lib/violations/earlier-core'
import { withPropertyParam } from '@/lib/property-scope'

type State = { kind: 'loading' } | { kind: 'failed' } | ({ kind: 'ok' } & EarlierCounts)

/**
 * One line once a home is chosen: how many violations it already has, and how
 * many in this category once the review step knows the category. Counts only,
 * fetched through a server action. A failed read says so.
 */
export function EarlierAtHome({ propertyId, category }: { propertyId: string; category?: string | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!propertyId) return
    let live = true
    setState({ kind: 'loading' })
    loadEarlierViolationCounts(propertyId).then(
      (res) => {
        if (!live) return
        setState(res.ok ? { kind: 'ok', total: res.total, byType: res.byType } : { kind: 'failed' })
      },
      () => {
        if (live) setState({ kind: 'failed' })
      },
    )
    return () => {
      live = false
    }
  }, [propertyId])

  if (!propertyId) return null
  if (state.kind === 'loading') return <p className="text-sm text-muted" aria-live="polite">Checking this home’s record…</p>
  if (state.kind === 'failed') return <p className="text-sm text-danger" role="status">Couldn’t load earlier violations</p>
  return (
    <p className="text-sm text-foreground-secondary" aria-live="polite">
      {earlierLine(state, category)}
      {state.total > 0 ? (
        <>
          {' '}
          <Link href={withPropertyParam('/violations', propertyId)} className="text-primary hover:underline">
            See them
          </Link>
        </>
      ) : null}
    </p>
  )
}
