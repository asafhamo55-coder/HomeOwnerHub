import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'
import type { ComplianceCheckResult } from '@/lib/compliance/harris-tx'

interface ComplianceBlockProps {
  result: ComplianceCheckResult
}

/**
 * The single most important UI in the Eviction Hub.
 *
 * Per the plan's quality rule #4: "Compliance block cannot be bypassed."
 * This component never has a dismiss button, never has a "skip" link,
 * never has any way for the user to acknowledge-and-move-on. The only
 * forward path the wizard exposes is "generate the notice" — and the
 * filing date is fixed by statute, not by the user's preference.
 *
 * Visual rules from the plan:
 *  - Full width, red left border, prominent icon
 *  - Legal citation displayed verbatim
 *  - Countdown: "X days until you can file"
 *  - AAA contrast (eviction theming already enforces this)
 *
 * The "can file now" state (canFile=true) renders a different, calmer
 * variant, but still without any acknowledgment affordance — the
 * landlord still needs to actually file the case in court themselves.
 */
export function ComplianceBlock({ result }: ComplianceBlockProps) {
  if (result.canFile) {
    return (
      <section
        role="status"
        className="overflow-hidden rounded-xl border-l-4 border-emerald-500 bg-emerald-50/50"
        aria-labelledby="compliance-heading"
      >
        <div className="flex items-start gap-3 p-5">
          <ShieldCheck
            className="mt-0.5 h-6 w-6 flex-shrink-0 text-emerald-700"
            aria-hidden
          />
          <div className="flex-1 space-y-3">
            <div>
              <h3
                id="compliance-heading"
                className="text-lg font-bold text-emerald-900"
              >
                Filing eligible
              </h3>
              <p className="text-sm text-emerald-900/80">{result.reason}</p>
            </div>
            <LegalBasis text={result.legalBasis} variant="success" />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      role="alert"
      className="overflow-hidden rounded-xl border-l-4 border-destructive bg-destructive/5"
      aria-labelledby="compliance-heading"
    >
      <div className="flex items-start gap-3 p-5">
        <ShieldAlert
          className="mt-0.5 h-6 w-6 flex-shrink-0 text-destructive"
          aria-hidden
        />
        <div className="flex-1 space-y-4">
          <div>
            <h3
              id="compliance-heading"
              className="text-lg font-bold text-destructive"
            >
              Cannot file yet
            </h3>
            <p className="mt-1 text-sm text-foreground">{result.reason}</p>
          </div>

          <LegalBasis text={result.legalBasis} variant="danger" />

          {result.canServeNoticeNow ? (
            <div className="flex flex-wrap items-center gap-6 rounded-lg border border-destructive/20 bg-surface p-4">
              <div className="text-center">
                <p className="text-3xl font-bold tabular-nums text-primary">
                  {result.daysUntilFiling}
                </p>
                <p className="text-xs uppercase tracking-wide text-muted">
                  {result.daysUntilFiling === 1 ? 'day to wait' : 'days to wait'}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Serve the {humanize(result.requiredNoticeType)} today
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Earliest filing date:{' '}
                  <span className="font-medium text-foreground">
                    {format(result.filingEligibleDate, 'EEEE, MMMM d, yyyy')}
                  </span>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function LegalBasis({
  text,
  variant,
}: {
  text: string
  variant: 'success' | 'danger'
}) {
  const tint =
    variant === 'success'
      ? 'border-emerald-200 bg-emerald-50/60'
      : 'border-destructive/15 bg-surface'
  return (
    <div className={`rounded-lg border ${tint} p-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Legal basis
      </p>
      <p className="mt-1 font-mono text-xs leading-relaxed text-foreground">{text}</p>
    </div>
  )
}

function humanize(t: string): string {
  switch (t) {
    case '3day_pay_or_quit':
      return '3-Day Notice to Vacate'
    case '30day_vacate':
      return '30-Day Notice to Vacate'
    case 'just_cause':
      return 'Just Cause Notice'
    default:
      return 'required notice'
  }
}
