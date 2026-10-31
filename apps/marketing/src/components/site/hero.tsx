import { ArrowRight, Check } from 'lucide-react'
import { TrackedLink } from './tracked-link'
import { SIGN_UP_URL } from './brand'
import { AskAnswerCard, WorkspaceApprovalsPanel } from './mockups'
import { TRIAL_DAYS } from '../../lib/hoa-pricing'

// Home hero: a violet slab with the headline, two CTAs, a 2x2 checklist and
// a cropped app window. Server component, so the copy paints with the HTML.
//
// Every checklist line is backed by code or docs (decision doc
// 2026-10-31-website-payhoa-quality-bar.md): the 30-day trial is TRIAL_DAYS,
// "no credit card" is checkout-v2's payment_method_collection 'if_required',
// roster import is /properties/import, month to month is the v2 pricing copy.
// The "we do the loading for you" line was dropped: nothing in the repo says we do it.

const CHECKS = [
  `${TRIAL_DAYS}-day free trial`,
  'No credit card to start',
  'Import your roster yourself',
  'Cancel anytime',
]

export function Hero() {
  return (
    <section className="hero-wash relative overflow-hidden">
      <div className="container-page">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
          <div className="pt-12 lg:py-16">
            <h1 className="t-display text-foreground">
              Run your HOA board <span className="t-serif text-primary">with less paperwork.</span>
            </h1>
            <p className="t-lead mt-6 max-w-xl">
              An AI workspace that drafts letters, notices and answers from your own documents. Your board reads each
              one and approves it before anything goes out.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position="hero" className="btn btn-primary btn-lg group w-full sm:w-auto">
                Start free trial
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </TrackedLink>
              <TrackedLink href="#features" event="demo_cta_click" position="hero" className="btn btn-secondary btn-lg w-full sm:w-auto">
                See it work
              </TrackedLink>
            </div>

            <ul className="mt-6 grid max-w-md grid-cols-1 gap-x-6 gap-y-2 text-base text-foreground-secondary sm:grid-cols-2">
              {CHECKS.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* STOPGAP: HTML mockup of the app, cropped by the slab. Replace
              with real screenshots (see the decision doc's TODO). */}
          <div
            className="relative lg:self-end"
            role="img"
            aria-label="Sample screens from HomeownerHub: the Approvals queue with AI drafts waiting for the board, and a cited answer from a CC&R. Sample data."
          >
            <div className="h-[300px] overflow-hidden sm:h-[380px] lg:-mr-28 lg:mt-14 lg:h-[460px]" aria-hidden>
              <div className="w-[560px] max-w-none sm:w-[640px] lg:w-[720px]">
                <WorkspaceApprovalsPanel className="!rounded-b-none" />
                <div className="mt-3 px-6">
                  <AskAnswerCard />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
