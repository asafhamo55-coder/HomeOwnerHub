import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { BarExplorer } from './bar-explorer'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/honesty-bars']!, path: '/honesty-bars' })

// Truth rule (BL-090): the old criteria named eval-set sizes and accuracy
// thresholds, written attorney sign-off and an "AIEventLog" that records
// each move. None of that exists as described (no attorney review is on
// record, and the run log is ai_runs, which doesn't record bar moves). What
// follows is what actually happens.
const movement = [
  {
    arrow: 'A → B',
    title: 'Demo to Beta',
    body:
      'The workflow runs on real data behind a human review gate: every output is a draft the board approves or rejects, and its sources are cited. Its tests pass in CI. The move is published on the roadmap.',
    duration: 'When it is ready',
  },
  {
    arrow: 'B → C',
    title: 'Beta to Production',
    body:
      'Bar C is for answers drawn from your documents, your records or the statute, cited, that say so when they don’t know. Anything that drafts a letter, a bill or a message stays at Bar B, with the board approving it.',
    duration: 'When it is ready',
  },
  {
    arrow: 'C → B (rollback)',
    title: 'Emergency rollback',
    body:
      'If a Bar C workflow gives a wrong answer in production, we move it back to Bar B, put the human gate back, and say so on the roadmap.',
    duration: 'Hours',
  },
]

export default function HonestyBarsPage() {
  return (
    <main id="main-content">
      <Nav />

      <PageHero
        eyebrow="The AI honesty framework"
        title={
          <>
            Tell people what's production and what's demo.
          </>
        }
        subtitle="Every workflow ships with a labeled quality bar — Bar A, B, or C — published on this site and on the public roadmap. No hidden hallucination risk."
      />

      <BarExplorer />

      <section className="py-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow text-primary">
              Movement between bars
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Every promotion (and rollback) is published.
            </h2>

            <div className="mt-10 space-y-5">
              {movement.map((m) => (
                <div
                  key={m.arrow}
                  className="rounded-2xl border border-border/70 bg-surface p-7 ring-card"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-primary">
                      {m.arrow}
                    </span>
                    <span className="text-xs text-muted">{m.duration}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                    {m.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-subtle/40 py-20">
        <div className="container-page text-center">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            See every workflow's current bar on the public roadmap.
          </h2>
          <Link
            href="/roadmap"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg shadow-sm transition-all hover:bg-primary-hover"
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
