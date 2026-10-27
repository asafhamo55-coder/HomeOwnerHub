import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { TrackedLink } from '@/components/site/tracked-link'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { GEORGIA_SCOPE_NOTE, STATE_CARDS, STATE_COVERAGE, STATE_LAW_ANSWERS_NOTE } from '@/lib/state-law'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/states']!, path: '/states' })

// Lists the states the workspace follows today, Georgia first. Every item
// comes from STATE_COVERAGE (lib/state-law.ts), checked by
// marketing-truth.test.ts against apps/hoa routes. The /georgia hub holds
// the Georgia guides and tools; the other states have no hub yet.

export default function StatesPage() {
  return (
    <main id="main-content">
      <Nav />

      <section className="hero-wash relative overflow-hidden pb-16 pt-32 md:pb-20 md:pt-40">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">State laws</p>
            <h1 className="t-display mt-5 text-foreground">
              State law, <span className="t-serif text-primary">built into the workspace.</span>
            </h1>
            <p className="t-lead mx-auto mt-6 max-w-2xl">
              HomeownerHub works for an HOA in any state. For Georgia, Florida, California and Texas, the drafts and
              deadlines also follow that state’s statute and cite the section.
            </p>
          </div>
        </div>
      </section>

      <section className="section pt-0 md:pt-0">
        <div className="container-page grid gap-5 lg:grid-cols-2">
          {STATE_COVERAGE.map((s) => {
            const card = STATE_CARDS.find((c) => c.state === s.state)!
            return (
              <article key={s.state} id={s.name.toLowerCase()} className="card scroll-mt-24 p-7 md:p-9">
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-foreground px-2 text-xs font-bold text-background">
                  {s.state}
                </span>
                <h2 className="t-h2 mt-5 text-foreground">{s.name}</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-foreground-secondary">{card.benefit}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {s.items.map((i) => (
                    <li key={i} className="rounded-full bg-subtle px-3 py-1.5 text-[13px] font-medium text-foreground-secondary">
                      {i}
                    </li>
                  ))}
                </ul>
                {s.state === 'GA' ? (
                  <Link href="/georgia" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline">
                    Georgia SB 406 guides and free tools
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
              </article>
            )
          })}
        </div>
        <div className="container-page mt-8">
          <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted">
            State-law answers: {STATE_LAW_ANSWERS_NOTE} {GEORGIA_SCOPE_NOTE}
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedLink href="/demo" event="demo_cta_click" position="states" className="btn btn-primary btn-lg">
              Book a demo
            </TrackedLink>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
