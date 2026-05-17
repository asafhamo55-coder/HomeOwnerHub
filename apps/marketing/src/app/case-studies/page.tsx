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
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            Case studies
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-5xl font-semibold tracking-tight text-ink-900 md:text-6xl">
            Real boards. Real metrics. In their words.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
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
                className="group flex flex-col rounded-2xl border border-ink-200/70 bg-white p-8 transition-all ring-card"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  {s.location}
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">
                  {s.name}
                </h2>
                <h3 className="mt-4 text-xl font-semibold text-ink-900">
                  {s.headline}
                </h3>
                <div className="mt-5 flex-1 rounded-xl bg-ink-50/50 p-5">
                  <Quote className="h-4 w-4 text-ember-500" />
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">{s.quote}</p>
                  <p className="mt-4 text-xs font-medium text-ink-600">{s.persona}</p>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {s.stats.map((stat) => (
                    <div key={stat.label}>
                      <p className="text-2xl font-semibold tracking-tight text-ink-900">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
                  Read the full study
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            ))}

            <div className="flex flex-col items-start justify-center rounded-2xl border border-dashed border-ink-300 bg-ink-50/30 p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                More coming
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">
                Two more case studies land this quarter.
              </h3>
              <p className="mt-3 text-sm text-ink-600">
                A 92-home Cumming HOA and a 4-unit Marietta landlord. Want to be
                next?
              </p>
              <Link
                href="/demo"
                className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
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
