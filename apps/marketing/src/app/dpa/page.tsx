import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'

export const metadata: Metadata = {
  title: 'Data Processing Agreement',
  description:
    'Ledger\'s DPA for customers needing a formal data-processing addendum.',
}

export default function DpaPage() {
  return (
    <main>
      <Nav />
      <PageHero
        eyebrow="Data Processing Agreement"
        title="Available on request."
        subtitle="For customers (typically HOA management firms or multi-property landlords) who need a formal DPA, our standard agreement is available on request."
      />

      <section className="pb-24">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-ink-200/70 bg-white p-8 text-center ring-card">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              Request our standard DPA
            </h2>
            <p className="mt-3 text-sm text-ink-600">
              Email{' '}
              <a className="font-semibold text-ink-800 underline-offset-4 hover:underline" href="mailto:legal@ledger.ai">
                legal@ledger.ai
              </a>
              {' '}with your entity name and we'll send the DPA within one
              business day, along with our completed vendor security
              questionnaire.
            </p>
            <Link
              href="/security"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 hover:text-brand-700"
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
