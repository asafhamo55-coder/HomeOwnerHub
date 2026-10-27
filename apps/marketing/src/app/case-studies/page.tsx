import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/case-studies']!, path: '/case-studies' })

// Truth rule (BL-042, BL-090, 2026-10-19 owner-delegated defaults): no
// customer quote is verified and no customer has approved a published case
// study, so this page lists none. The Madison Park page now redirects here.
// Add a study only once the customer has approved its text and numbers.

export default function CaseStudiesPage() {
  return (
    <main id="main-content">
      <Nav />

      <section className="relative overflow-hidden pt-32 pb-12">
        <div className="absolute inset-0 -z-10 bg-radial-spot" />
        <div className="container-page text-center">
          <p className="eyebrow text-primary">
            Case studies
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-balance text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
            Case studies, once a board signs off.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Case studies will be published once a customer approves them. We
            don’t publish quotes or numbers a board hasn’t signed off on.
          </p>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col justify-center rounded-2xl border border-border/70 bg-surface p-8 ring-card">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Coming once approved
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                No case studies published yet
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground-secondary">
                Case studies will be published once a customer approves them.
                Until then, the product pages describe what the software does,
                with no customer results attached.
              </p>
              <Link
                href="/hoa"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary"
              >
                See the HOA workflows
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

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
