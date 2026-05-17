import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms under which you use Ledger.',
}

export default function TermsPage() {
  return (
    <main>
      <Nav />
      <PageHero eyebrow="Terms of service" title="Plain-English terms." />

      <section className="pb-24">
        <div className="container-page">
          <article className="prose prose-ink mx-auto max-w-3xl text-base leading-relaxed text-ink-700">
            <p className="text-sm text-ink-500">Last updated: May 15, 2026</p>

            <h2>1. Service description</h2>
            <p>
              Ledger provides AI-assisted workflows for HOA boards, small
              landlords, and eviction-adjacent tasks. The service is provided as
              described on this site and in the product.
            </p>

            <h2>2. Acceptable use</h2>
            <p>
              You agree to use Ledger only for lawful purposes and in
              accordance with applicable HOA, landlord-tenant, and consumer
              protection laws.
            </p>

            <h2>3. AI outputs and disclaimers</h2>
            <p>
              AI workflows are labeled by quality bar (A / B / C). Bar A outputs
              are demo-only and must not be used for filing or legal action. Bar
              B outputs require human review. Bar C outputs are production. We
              are not your attorney; nothing in the product constitutes legal
              advice.
            </p>

            <h2>4. Pricing and billing</h2>
            <p>
              Plans are billed monthly or annually as described on the pricing
              page. Pilots are free for six months; we never auto-convert
              without your explicit confirmation.
            </p>

            <h2>5. Your data</h2>
            <p>
              You retain ownership of all documents and data you upload. We do
              not train models on your data. Export is available in every plan.
            </p>

            <h2>6. Termination</h2>
            <p>
              You can cancel at any time. We may suspend or terminate accounts
              for violations of acceptable use or non-payment.
            </p>

            <h2>7. Liability</h2>
            <p>
              To the extent permitted by law, Ledger's aggregate liability
              is limited to the amounts paid by you to us in the prior twelve
              months.
            </p>

            <h2>8. Governing law</h2>
            <p>
              These terms are governed by the laws of the State of Georgia.
            </p>

            <p className="mt-12 text-xs text-ink-500">
              This is a working draft — the production terms are being reviewed
              by counsel and will replace this page before public launch.
            </p>
          </article>
        </div>
      </section>

      <Footer />
    </main>
  )
}
