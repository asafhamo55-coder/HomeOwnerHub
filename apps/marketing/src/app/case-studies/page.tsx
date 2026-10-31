import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { PageHero } from '@/components/site/page-hero'
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
    <>
      <Nav />
    <main id="main-content">

      <PageHero
        eyebrow="Case studies"
        title="Case studies, once a board signs off."
        subtitle="We do not publish quotes or numbers a board has not approved, so none are listed yet."
      />

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col justify-center card p-8 md:p-10">
              <p className="eyebrow">
                Coming once approved
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                No case studies published yet
              </h2>
              <p className="mt-3 text-[17px] leading-relaxed text-foreground-secondary">
                Case studies will be published once a customer approves them.
                Until then, the product pages describe what the software does,
                with no customer results attached.
              </p>
              <Link
                href="/hoa"
                className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[17px] font-semibold text-foreground hover:text-primary"
              >
                See the HOA workflows
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex flex-col items-start justify-center rounded-[1.25rem] border border-dashed border-border-strong bg-subtle/30 p-8 md:p-10">
              <p className="eyebrow">
                Your board
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Want to be next?
              </h3>
              <p className="mt-3 text-[17px] text-foreground-secondary">
                We’re looking for self-managed boards to build with. Ten-minute
                demo first.
              </p>
              <Link
                href="/demo"
                className="mt-6 btn btn-primary"
              >
                Talk to us
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      </main>
    <Footer />
    </>
  )
}
