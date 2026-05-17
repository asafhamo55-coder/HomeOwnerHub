import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How Ledger collects, uses, and protects your information.',
}

export default function PrivacyPage() {
  return (
    <main>
      <Nav />
      <PageHero
        eyebrow="Privacy policy"
        title="What we collect, why, and how we protect it."
        subtitle="Plain-English summary at the top. Full policy below."
      />

      <section className="pb-24">
        <div className="container-page">
          <article className="prose prose-ink mx-auto max-w-3xl text-base leading-relaxed text-ink-700">
            <p className="text-sm text-ink-500">Last updated: May 15, 2026</p>

            <h2>The short version</h2>
            <ul>
              <li>We collect only what we need to run the product.</li>
              <li>You own your documents. Export is one-click in every plan.</li>
              <li>We never train models on your data.</li>
              <li>We never sell or share your data with third parties.</li>
              <li>We log every AI action for your audit trail.</li>
            </ul>

            <h2>1. Information we collect</h2>
            <p>
              We collect account information (name, email, role), the documents
              you upload (CC&R, bylaws, leases, etc.), and operational data we
              generate as you use the product (queries, drafted notices, AI
              outputs). We do not collect more than is required to operate the
              service.
            </p>

            <h2>2. How we use information</h2>
            <p>
              We use your information to run the product, answer your questions,
              and improve our internal infrastructure. We do not use your
              documents for model training. We do not sell your data.
            </p>

            <h2>3. Sharing</h2>
            <p>
              We do not share your information with third parties except service
              providers we contract to run the product (e.g., infrastructure
              hosting, transactional email). Each provider operates under a
              data-processing agreement and processes only what's necessary.
            </p>

            <h2>4. Data retention</h2>
            <p>
              We retain your data for as long as your account is active and for
              up to 30 days after deletion (for backup recovery). You can
              request earlier deletion at any time.
            </p>

            <h2>5. Your rights</h2>
            <p>
              You can access, export, correct, or delete your data at any time
              from your account settings, or by emailing privacy@ledger.ai.
              We respond within 30 days.
            </p>

            <h2>6. Contact</h2>
            <p>
              Privacy questions: <a href="mailto:privacy@ledger.ai">privacy@ledger.ai</a>
            </p>

            <p className="mt-12 text-xs text-ink-500">
              This is a working draft — the production privacy policy is being
              reviewed by counsel and will replace this page before public
              launch.
            </p>
          </article>
        </div>
      </section>

      <Footer />
    </main>
  )
}
