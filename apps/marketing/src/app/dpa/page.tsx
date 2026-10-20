import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { pageMetadata } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'Data Processing Agreement',
  description:
    'HomeownerHub\'s DPA for customers needing a formal data-processing addendum.',
  path: '/dpa',
})

export default function DpaPage() {
  return (
    <main>
      <Nav />
      <PageHero
        eyebrow="Data Processing Agreement"
        title="Available on request."
        subtitle="For associations that need a formal DPA, our standard agreement is available on request."
      />

      <section className="pb-24">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-surface p-8 text-center ring-card">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Request our standard DPA
            </h2>
            <p className="mt-3 text-sm text-foreground-secondary">
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
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary"
            >
              Read our security posture →
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
