import { ArrowRight } from 'lucide-react'
import { TrackedLink } from './tracked-link'
import { SIGN_UP_URL } from './brand'
import { TRIAL_DAYS } from '../../lib/hoa-pricing'

export function CtaCloser() {
  return (
    <section className="section section-ink ink-glow overflow-hidden">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="t-display text-[#fff]">
            Spend less time on paperwork. <span className="t-serif text-primary">More time on your community.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-foreground-secondary">
            Start the trial, load your documents and ask a real question. Your board decides what goes out.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position="closing" className="btn btn-lg btn-primary group">
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </TrackedLink>
            <TrackedLink href="/demo" event="demo_cta_click" position="closing" className="btn btn-lg btn-secondary">
              Book a demo
            </TrackedLink>
          </div>
          <p className="mt-8 text-base text-muted">{TRIAL_DAYS}-day free trial · No credit card · Cancel anytime</p>
        </div>
      </div>
    </section>
  )
}
