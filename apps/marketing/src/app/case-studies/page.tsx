import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Quote } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'

export const metadata: Metadata = {
  title: 'Case studies',
  description: 'Real HOA boards using Ledger. Quotes, metrics, and where the time went.',
}

const studies = [
  {
    slug: 'madison-park',
    name: 'Madison Park HOA',
    location: 'Johns Creek, GA · 180 homes',
    headline: '"I got my Tuesday nights back."',
    quote:
      "Covenant Brain answers in seconds with the exact section cited. Minutes are written the night of the meeting. We caught a $4,200 reserve discrepancy in week three.",
    persona: 'Linda Jackson, Treasurer',
    stats: [
      { label: 'Hours saved / mo', value: '32+' },
      { label: 'Questions answered', value: '247' },
      { label: 'First Aha', value: '15 min' },
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
            Real boards. Real metrics. In their words.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            We publish the numbers alongside the quotes. Hours saved, questions
            answered, what worked, what didn't.
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
                  Read the full study
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            ))}

            <div className="flex flex-col items-start justify-center rounded-2xl border border-dashed border-border-strong bg-subtle/30 p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                More coming
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Two more case studies land this quarter.
              </h3>
              <p className="mt-3 text-sm text-foreground-secondary">
                A 92-home Cumming HOA and a 4-unit Marietta landlord. Want to be
                next?
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
