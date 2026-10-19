import { StatusPill, type StatusTone } from '@homeowner-portal/ui'
import type { ConsentState } from '@/lib/email-consent'
import { formatDay } from '@/lib/money/format'

/**
 * BL-020: one member's consent to official notices by email (CA Civ. Code
 * §4040), as the board sees it on Members and the property page. `null`
 * = nothing on record, which for an official notice means "no consent".
 * Rendered only once M1_APPLIED; callers pass nothing before then.
 */
export const CONSENT_METHOD_LABEL: Record<ConsentState['method'], string> = {
  portal: 'in the portal',
  written: 'signed form',
  email: 'by email',
}

export function consentSummary(state: ConsentState | null): { tone: StatusTone; label: string; detail: string | null } {
  if (!state) return { tone: 'neutral', label: 'No e-consent', detail: null }
  const when = formatDay(state.at)
  const how = CONSENT_METHOD_LABEL[state.method] ?? state.method
  return state.granted
    ? { tone: 'success', label: 'E-consent on file', detail: `Given ${how} · ${when}` }
    : { tone: 'warning', label: 'E-consent withdrawn', detail: `Withdrawn ${how} · ${when}` }
}

export function ConsentStatus({ state, showDetail = true }: { state: ConsentState | null; showDetail?: boolean }) {
  const s = consentSummary(state)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <StatusPill tone={s.tone} icon={null} label={s.label} size="sm" />
      {showDetail && s.detail ? <span className="text-xs text-muted">{s.detail}</span> : null}
    </span>
  )
}
