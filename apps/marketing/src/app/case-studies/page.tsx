import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Quote } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'

export const metadata: Metadata = {
  title: 'Case studies',
  description: 'The HOA boards Ledger is built with. Real quotes; numbers only once a board has measured and signed off on them.',
}

// Truth rule (BL-042, BL-090): no metric appears here until the board it
// belongs to has measured it and signed off. The old "32+ hours", "247
// questions", "15 min" and "$4,200" figures had nothing behind them, and the
// quote was a longer, embellished version of Linda's reference quote.
const studies = [
  {
    slug: 'madison-park',
    name: 'Madison Park HOA',
    location: 'Johns Creek, GA · 180 homes',
    headline: '"I got my Tuesday nights back."',
    quote: 'Covenant Brain answers in seconds with the section cited.',
    persona: 'Linda, Treasurer',
    stats: [
      { label: 'Self-managed', value: '180 homes' },
      { label: 'Design partner', value: 'Lead' },
      { label: 'Location', value: 'GA' },
    ],
  },
]

export default function CaseStudiesPage() {
  return (
    <main>
      <Nav />

      <section className="relative overflow-hidden pt-32 pb-12">
        <div className="absolute inset-0 -z-10 bg-radial-spot" />
        <div className="container-page text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Case studies
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
            Real boards. In their words.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            We publish a board’s numbers only once it has measured them and
            signed off. Until then: who they are, and what they said.
          </p>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-2">
            {studies.map((s) => (
              <Link
                key={s.slug}
                href={`/case-studies/${s.slug}`}
                className="group flex flex-col rounded-2xl border border-border/70 bg-surface p-8 transition-all ring-card"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {s.location}
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  {s.name}
                </h2>
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {s.headline}
                </h3>
                <div className="mt-5 flex-1 rounded-xl bg-subtle/50 p-5">
                  <Quote className="h-4 w-4 text-accent-fg" />
                  <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{s.quote}</p>
                  <p className="mt-4 text-xs font-medium text-foreground-secondary">{s.persona}</p>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {s.stats.map((stat) => (
                    <div key={stat.label}>
                      <p className="text-2xl font-semibold tracking-tight text-foreground">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-xs text-muted">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                  Read more
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            ))}

            <div className="flex flex-col items-start justify-center rounded-2xl border border-dashed border-border-strong bg-subtle/30 p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Your board
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Want to be next?
              </h3>
              <p className="mt-3 text-sm text-foreground-secondary">
                We’re looking for self-managed boards to build with. Ten-minute
                demo first.
              </p>
              <Link
                href="/demo"
                className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                Talk to us
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
