import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/dpa']!, path: '/dpa' })

export default function DpaPage() {
  return (
    <>
      <Nav />
    <main id="main-content">
      <PageHero
        eyebrow="Data Processing Agreement"
        title="Available on request."
        subtitle="For associations that need a formal DPA, our standard agreement is available on request."
      />

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="card mx-auto max-w-2xl p-8 text-center md:p-10">
            <h2 className="t-h3 text-foreground">
              Request our standard DPA
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed text-foreground-secondary">
              Email{' '}
              <a className="font-semibold text-foreground underline-offset-4 hover:underline" href="mailto:support@homeownerledger.com">
                support@homeownerledger.com
              </a>
              {' '}with your entity name and we'll send the DPA within one
              business day, along with our completed vendor security
              questionnaire.
            </p>
            <Link
              href="/security"
              className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[17px] font-semibold text-foreground hover:text-primary"
            >
              Read our security posture →
            </Link>
          </div>
        </div>
      </section>

      </main>
    <Footer />
    </>
  )
}
