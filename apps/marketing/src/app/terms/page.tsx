import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { pageMetadata } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'Terms of service',
  description: 'The terms under which you use HomeownerHub.',
  path: '/terms',
})

export default function TermsPage() {
  return (
    <main>
      <Nav />
      <PageHero eyebrow="Terms of service" title="Plain-English terms." />

      <section className="pb-24">
        <div className="container-page">
          <article className="prose prose-ink mx-auto max-w-3xl text-base leading-relaxed text-foreground-secondary">
            <p className="text-sm text-muted">Last updated: October 20, 2026</p>

            <aside className="not-prose mt-4 rounded-xl border border-border/70 bg-surface p-4 text-sm">
              <p className="font-semibold text-foreground">What changed on October 20, 2026</p>
              <p className="mt-1">
                A scope correction only. Your obligations, our liability,
                fees, data terms, dispute terms and governing law are
                unchanged.
              </p>
              <ul className="mt-2 list-disc pl-5">
                <li>
                  Section 1 (Service description) now describes HomeownerHub
                  as HOA management software for community associations and
                  their residents. The two non-HOA uses it previously listed
                  were removed.
                </li>
                <li>
                  Section 2 (Acceptable use) now names HOA and consumer
                  protection laws as examples of applicable law. The
                  non-HOA example was removed; the requirement to use the
                  service only for lawful purposes is unchanged.
                </li>
              </ul>
            </aside>

            <h2>1. Service description</h2>
            <p>
              HomeownerHub provides HOA management software, including
              AI-assisted workflows, for community associations and their
              residents. The service is provided as described on this site and
              in the product.
            </p>

            <h2>2. Acceptable use</h2>
            <p>
              You agree to use HomeownerHub only for lawful purposes and in
              accordance with applicable HOA and consumer protection laws.
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
              To the extent permitted by law, HomeownerHub's aggregate liability
              is limited to the amounts paid by you to us in the prior twelve
              months.
            </p>

            <h2>8. Governing law</h2>
            <p>
              These terms are governed by the laws of the State of Georgia.
            </p>

            <p className="mt-12 text-xs text-muted">
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
