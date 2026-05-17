import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { BarExplorer } from './bar-explorer'

export const metadata: Metadata = {
  title: 'AI honesty bars — What Bar A, B, and C mean',
  description:
    'Every Ledger workflow ships with a quality bar label. Here\'s what each bar means, what it requires, and how workflows move between them.',
}

const movement = [
  {
    arrow: 'A → B',
    title: 'Demo to Beta',
    body:
      'Requires 50+ eval cases on blind test set with >90% accuracy, complete citation/audit trail, human review gate deployed, and (if legal-adjacent) written attorney sign-off. Founder approves; AIEventLog records the move.',
    duration: '3–4 weeks typical',
  },
  {
    arrow: 'B → C',
    title: 'Beta to Production',
    body:
      'Requires 100+ eval cases with >95% accuracy, human review gate tested in production with feedback loop closed, zero critical safety issues in 30 days, and (if legal-adjacent) legal clearance with revert clause.',
    duration: '4–8 weeks typical',
  },
  {
    arrow: 'C → B (rollback)',
    title: 'Emergency rollback',
    body:
      'If a Bar C workflow shows >2% hallucination rate or any production incident, we instantly flag it back to Bar B (human gate re-enabled). Incident logged in AIEventLog with postmortem.',
    duration: 'Hours',
  },
]

export default function HonestyBarsPage() {
  return (
    <main>
      <Nav />

      <PageHero
        eyebrow="The AI honesty framework"
        title={
          <>
            Tell people what's production and what's demo.
          </>
        }
        subtitle="Every workflow ships with a labeled quality bar — Bar A, B, or C — visible in the product, in marketing, and on the public roadmap. No hidden hallucination risk."
      />

      <BarExplorer />

      <section className="py-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Movement between bars
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Every promotion (and rollback) is recorded.
            </h2>

            <div className="mt-10 space-y-5">
              {movement.map((m) => (
                <div
                  key={m.arrow}
                  className="rounded-2xl border border-ink-200/70 bg-white p-7 ring-card"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-brand-700">
                      {m.arrow}
                    </span>
                    <span className="text-xs text-ink-500">{m.duration}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-ink-900">
                    {m.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ink-50/40 py-20">
        <div className="container-page text-center">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            See every workflow's current bar on the public roadmap.
          </h2>
          <Link
            href="/roadmap"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-ink-800"
          >
            View roadmap
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}
