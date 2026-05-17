import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Jurisdiction-specific writing on HOA governance, landlord operations, and the AI work that\'s replacing them.',
}

const planned = [
  {
    category: 'HOA',
    title: 'Reserve fund math: how to find the $4,000 most boards miss',
    note: 'How Madison Park HOA caught a three-year-old discrepancy in week three.',
  },
  {
    category: 'HOA',
    title: 'Georgia HOA fine schedules — what\'s actually enforceable',
    note: 'Reading GA OCGA Title 44 in plain English. The 14-day cure rule explained.',
  },
  {
    category: 'PM',
    title: 'When to escalate late rent: a 30-day calendar for new landlords',
    note: 'Day 5 vs. day 15 vs. day 25 — what the data says and what your lease should say.',
  },
  {
    category: 'AI',
    title: 'Why we self-host our LLM (and what it costs)',
    note: 'Real TCO numbers from month 1 through month 12 on RunPod A10G + L4.',
  },
  {
    category: 'Eviction',
    title: 'The pay-or-quit notice your county actually requires',
    note: 'Fulton vs. Cobb vs. Gwinnett — formatting differences that reset the clock.',
  },
]

export default function BlogPage() {
  return (
    <main>
      <Nav />

      <PageHero
        eyebrow="Blog · Coming in late 2026"
        title={
          <>
            One post a week. No fluff.
          </>
        }
        subtitle="When we publish, every post will be jurisdiction-specific and tied to a real workflow we ship. We're starting in Atlanta-metro and writing as we go."
      />

      <section className="py-12">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-ink-200/70 bg-white p-8 ring-card">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink-900">
                  Want the first post when it lands?
                </h2>
                <p className="text-sm text-ink-500">
                  Email us and we'll add you to the launch list.
                </p>
              </div>
            </div>
            <Link
              href="mailto:hello@ledger.ai?subject=Add%20me%20to%20the%20blog%20launch%20list"
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
            >
              hello@ledger.ai
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              On the editorial roadmap
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Five posts already drafted.
            </h2>

            <div className="mt-10 space-y-3">
              {planned.map((p) => (
                <div
                  key={p.title}
                  className="rounded-2xl border border-ink-200/70 bg-white p-6 transition-colors hover:border-ink-300 ring-card"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                    {p.category}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink-900">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink-600">{p.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
