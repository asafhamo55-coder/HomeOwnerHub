import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { CtaCloser } from '@/components/site/cta-closer'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { GEORGIA_SCOPE_NOTE, STATE_CARDS, STATE_COVERAGE, STATE_GUIDE_LINKS, STATE_LAW_ANSWERS_NOTE } from '@/lib/state-law'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/states']!, path: '/states' })

// Lists the states the workspace follows today, Georgia first. Every item
// comes from STATE_COVERAGE (lib/state-law.ts), checked by
// marketing-truth.test.ts against apps/hoa routes. The /georgia hub holds
// the Georgia guides and tools; FL, CA and TX each have a hub at /states/[state].

export default function StatesPage() {
  return (
    <>
      <Nav />
    <main id="main-content">

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

      <section className="section pt-12 md:pt-16">
        <div className="container-page grid gap-5 lg:grid-cols-2">
          {STATE_COVERAGE.map((s) => {
            const card = STATE_CARDS.find((c) => c.state === s.state)!
            const first = s.state === 'GA'
            return (
              <article
                key={s.state}
                id={s.name.toLowerCase()}
                className={`${first ? 'section-ink !m-0 lg:col-span-2' : 'card card-hover'} reveal scroll-mt-24 p-7 md:p-10`}
              >
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-14 min-w-14 items-center justify-center rounded-2xl bg-primary-subtle px-2 text-lg font-bold text-primary">
                    {s.state}
                  </span>
                  <div>
                    {first && <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">Georgia first</p>}
                    <h2 className="t-h2 text-foreground">{s.name}</h2>
                  </div>
                </div>
                <p className="mt-5 max-w-3xl text-lg leading-relaxed text-foreground-secondary">{card.benefit}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {s.items.map((i) => (
                    <li key={i} className="rounded-full border border-border bg-subtle px-3.5 py-1.5 text-base font-medium text-foreground-secondary">
                      {i}
                    </li>
                  ))}
                </ul>
                {first ? (
                  <Link href="/georgia" className="btn btn-primary mt-7">
                    Georgia SB 406 guides and free tools
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <ul className="mt-6 space-y-1">
                    <li>
                      <Link href={card.href} className="inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-primary hover:underline">
                        {s.name} hub: what the workspace does
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </li>
                    {(STATE_GUIDE_LINKS[s.state] ?? []).map((g) => (
                      <li key={g.href}>
                        <Link href={g.href} className="inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-primary hover:underline">
                          {g.label}
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
        <div className="container-page mt-10">
          <p className="mx-auto max-w-3xl text-center text-base leading-relaxed text-muted">
            State-law answers: {STATE_LAW_ANSWERS_NOTE} {GEORGIA_SCOPE_NOTE}
          </p>
        </div>
      </section>

      <CtaCloser />
      </main>
    <Footer />
    </>
  )
}
