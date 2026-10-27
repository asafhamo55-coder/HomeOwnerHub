import { TrackedLink } from './tracked-link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { SHIPPED_HOA_WORKFLOWS } from '@/lib/workflows'
import { WorkspaceProductVisual } from './mockups'

// Home hero. Server component: the headline and CTAs paint with the HTML
// (no client JS before LCP). The visual is a built-from-HTML product mockup
// of real app screens, not a photo.
//
// Product first (docs/decisions/2026-10-27-website-product-first-positioning.md):
// the headline is the workspace; state law lives in one section lower down.
// Truth: the stat counts the live workflow list.

export function Hero() {
  return (
    <section className="hero-wash relative overflow-hidden pb-20 pt-28 md:pb-28 md:pt-36">
      <div className="container-page">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-subtle px-3.5 py-1.5 text-[13px] font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Self-service · AI drafts, the board approves
            </p>

            <h1 className="mt-6 text-[clamp(2.5rem,1.4rem+2.9vw,3.875rem)] font-medium leading-[1.04] tracking-[-0.035em] text-foreground">
              The AI workspace for self-managed HOA boards.
              <span className="t-serif mt-1 block text-primary">The board still decides.</span>
            </h1>

            <p className="t-lead mt-6 max-w-xl">
              Dues, violations, announcements, accounting and your governing documents in one self-service place. AI
              drafts the letters, notices, minutes and replies from your records. Nothing is sent, filed or entered
              until a board member approves it.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <TrackedLink href="/demo" event="demo_cta_click" position="hero" className="btn btn-primary btn-lg group">
                Book a demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </TrackedLink>
              <TrackedLink href="/demo" event="pilot_cta_click" position="hero" className="btn btn-secondary btn-lg">
                Start free pilot
              </TrackedLink>
            </div>

            <p className="mt-5 text-sm text-muted">Six-month free pilot · No auto-conversion · No data migration</p>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
              <Stat value={String(SHIPPED_HOA_WORKFLOWS.length)} label="AI workflows live" />
              <Stat value="Cited" label="Every document answer" />
              <Stat value="Self-serve" label="Setup and roster import" />
            </dl>
          </div>

          <WorkspaceProductVisual />
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">{value}</dt>
      <dd className="mt-1 text-[13px] leading-snug text-muted">{label}</dd>
    </div>
  )
}
