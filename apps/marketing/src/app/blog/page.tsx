import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { OTHER_HUBS_ENABLED } from '@/lib/hubs'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/blog']!, path: '/blog' })

const allPlanned = [
  {
    category: 'HOA',
    title: 'Reserve fund math for volunteer treasurers',
    note: 'Reconciling the reserve spreadsheet to the bank, and what to do when they disagree.',
  },
  {
    category: 'HOA',
    title: 'Georgia HOA fine schedules: what\'s actually enforceable',
    note: 'Reading GA OCGA Title 44 in plain English. The 14-day cure rule explained.',
  },
  {
    category: 'PM',
    title: 'When to escalate late rent: a 30-day calendar for new landlords',
    note: 'Day 5 vs. day 15 vs. day 25: what the data says and what your lease should say.',
  },
  {
    category: 'AI',
    title: 'Why we use open-weight models (and what they cost)',
    note: 'What the AI actually costs per board, month by month.',
  },
  {
    category: 'Eviction',
    title: 'The pay-or-quit notice your county actually requires',
    note: 'Fulton vs. Cobb vs. Gwinnett: formatting differences that reset the clock.',
  },
]

// BL-097: PM and Eviction topics are dropped while those hubs are not offered.
const planned = OTHER_HUBS_ENABLED
  ? allPlanned
  : allPlanned.filter((p) => p.category !== 'PM' && p.category !== 'Eviction')

export default function BlogPage() {
  return (
    <main id="main-content">
      <Nav />

      <PageHero
        eyebrow="Blog · No posts yet"
        title={
          <>
            Practical writing for volunteer boards.
          </>
        }
        subtitle="When we publish, every post will be jurisdiction-specific and tied to a real workflow we ship. We're starting in Atlanta-metro and writing as we go."
      />

      <section className="py-12">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-surface p-8 ring-card">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Want the first post when it lands?
                </h2>
                <p className="text-sm text-muted">
                  Email us and we'll add you to the launch list.
                </p>
              </div>
            </div>
            <Link
              href="mailto:support@homeownerledger.com?subject=Add%20me%20to%20the%20blog%20launch%20list"
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              support@homeownerledger.com
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow text-primary">
              On the editorial roadmap
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Posts we plan to write.
            </h2>

            <div className="mt-10 space-y-3">
              {planned.map((p) => (
                <div
                  key={p.title}
                  className="rounded-2xl border border-border/70 bg-surface p-6 transition-colors hover:border-border-strong ring-card"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {p.category}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm text-foreground-secondary">{p.note}</p>
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
