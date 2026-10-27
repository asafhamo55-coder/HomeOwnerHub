import { Alert } from '@homeowner-portal/ui'
import type { StateChangeSummary } from '@/lib/association-settings'

/**
 * BL-176: the plain-language "What changes" box shown before a state or
 * type change is saved. Pure render of `describeStateChange`.
 */
export function WhatChangesBox({ summary }: { summary: StateChangeSummary }) {
  if (!summary.changed) return null
  return (
    <Alert variant="warning" title="What changes">
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {summary.items.map((i) => (
          <li key={i.topic}>
            <strong>{i.topic}.</strong> {i.text}
          </li>
        ))}
      </ul>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        {summary.unchanged.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Alert>
  )
}
