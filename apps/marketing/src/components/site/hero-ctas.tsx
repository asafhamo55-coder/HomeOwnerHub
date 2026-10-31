import { ArrowRight, Check } from 'lucide-react'
import { TrackedLink } from './tracked-link'
import { SIGN_UP_URL } from './brand'
import { TRIAL_DAYS } from '../../lib/hoa-pricing'

// The CTA pair and trial checklist shared by the home hero and every feature
// page. Every checklist line is backed by code or docs (decision doc
// 2026-10-31-website-payhoa-quality-bar.md): the 30-day trial is TRIAL_DAYS,
// "no credit card" is checkout-v2's payment_method_collection 'if_required',
// roster import is /properties/import, month to month is the v2 pricing copy.
export const TRIAL_CHECKS = [
  `${TRIAL_DAYS}-day free trial`,
  'No credit card to start',
  'Import your owner list from a spreadsheet',
  'Cancel anytime',
]

export function HeroCtas({
  position,
  secondaryHref = '/demo',
  secondaryLabel = 'Book a demo',
  checks = true,
}: {
  position: string
  secondaryHref?: string
  secondaryLabel?: string
  checks?: boolean
}) {
  return (
    <>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position={position} className="btn btn-primary btn-lg group w-full sm:w-auto">
          Start free trial
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </TrackedLink>
        <TrackedLink href={secondaryHref} event="demo_cta_click" position={position} className="btn btn-secondary btn-lg w-full sm:w-auto">
          {secondaryLabel}
        </TrackedLink>
      </div>
      {checks && (
        <ul className="mt-6 grid max-w-md grid-cols-1 gap-x-6 gap-y-2 text-base text-foreground-secondary sm:grid-cols-2">
          {TRIAL_CHECKS.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
