import { AlertTriangle, Clock } from 'lucide-react'
import { Alert, Badge } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { ARC_DEEMED_APPROVAL_NOTE, arcStateNote, type ArcClock } from '@/lib/arc-review/clock'

const VARIANT = { ok: 'neutral', soon: 'warning', overdue: 'danger' } as const

/**
 * BL-113: days left to decide an ARC application. Neutral, amber at 7 days
 * or fewer, red once overdue. Board-facing only. Carries an icon and text
 * so the state never rests on colour alone.
 */
export function ArcClockChip({ clock }: { clock: ArcClock | null }) {
  if (!clock) return null
  const Icon = clock.tone === 'overdue' ? AlertTriangle : Clock
  return (
    <Badge
      variant={VARIANT[clock.tone]}
      icon={<Icon aria-hidden />}
      title={`Decide by ${formatDay(clock.dueDate)}`}
      data-tone={clock.tone}
    >
      {clock.label}
    </Badge>
  )
}

/** BL-113: the banner on an overdue application. Board-facing only. */
export function ArcOverdueBanner({ clock, state }: { clock: ArcClock | null; state: string | null }) {
  if (!clock || clock.tone !== 'overdue') return null
  const stateNote = arcStateNote(state)
  return (
    <Alert variant="error" title={`Decision overdue — was due ${formatDay(clock.dueDate)}`}>
      <p>{ARC_DEEMED_APPROVAL_NOTE} Decide as soon as you can.</p>
      {stateNote ? <p className="mt-2">{stateNote}</p> : null}
    </Alert>
  )
}
