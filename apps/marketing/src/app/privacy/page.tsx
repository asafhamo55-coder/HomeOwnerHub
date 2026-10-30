import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/privacy']!, path: '/privacy' })

export default function PrivacyPage() {
  return (
    <>
      <Nav />
    <main id="main-content">
      <PageHero
        eyebrow="Privacy policy"
        title="What we collect, why, and how we protect it."
        subtitle="Plain-English summary at the top. Full policy below."
      />

      <section className="pb-24">
        <div className="container-page">
          <article className="prose prose-ink mx-auto max-w-3xl text-base leading-relaxed text-foreground-secondary">
            <p className="text-sm text-muted">Last updated: October 20, 2026</p>

            <h2>The short version</h2>
            <ul>
              <li>We collect only what we need to run the product.</li>
              <li>You own your documents. Board members and admins can download all of your association&apos;s records at any time from Settings → Your data, as one zip of spreadsheets (CSV). Uploaded files themselves are listed in it rather than included.</li>
              <li>We never train models on your data.</li>
              <li>We never sell or share your data with third parties.</li>
              <li>We log every AI action for your audit trail.</li>
              <li>We count how the app is used in aggregate, without cookies and without anything that identifies you.</li>
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
              hosting, transactional email, and the AI providers that generate
              answers and index your documents). When the assistant looks up an
              owner, the AI sees placeholders instead of their email and phone
              number, and inbox reply drafts remove contact details from
              resident messages before the AI reads them. Each provider operates under a
              data-processing agreement and processes only what's necessary.
            </p>

            <h2 id="usage-analytics">Usage analytics</h2>
            <p>
              To learn which features boards and residents actually use, the
              app records aggregate usage with Vercel Web Analytics: which
              kinds of pages are viewed and a few product actions (for example,
              that an approval was decided or a request was submitted). It sets
              no cookies and does not identify you. Page addresses are reduced
              to their shape before they are sent (record numbers are replaced
              and search terms are removed), and events never include names,
              emails, addresses, message text or record numbers. If your
              browser sends Do Not Track or Global Privacy Control, nothing is
              recorded.
            </p>

            <h2 id="text-messages">Text messages</h2>
            <p>
              Residents get text messages from their association only after
              agreeing to them in the resident portal (Account → Text
              messages). We record when you agreed and the exact terms you
              saw. Message frequency varies, and message and data rates may
              apply. Reply STOP to stop texts, or HELP for help; you can also
              turn them off in the portal at any time. We never sell or share
              your mobile number or your agreement to receive texts with third
              parties or affiliates for their marketing. The text-messaging
              provider that delivers the messages receives your number only to
              deliver them.
            </p>

            <h2>4. Data retention</h2>
            <p>
              We retain your data for as long as your account is active and for
              up to 30 days after deletion (for backup recovery). You can
              request earlier deletion at any time.
            </p>

            <h2>5. Your rights</h2>
            <p>
              You can access, correct and export your data at any time in the
              app (export is under Settings → Your data). To delete it, or for
              anything else, email support@homeownerledger.com.
              We respond within 30 days.
            </p>

            <h2>6. Contact</h2>
            <p>
              Privacy questions: <a href="mailto:support@homeownerledger.com">support@homeownerledger.com</a>
            </p>

            <p className="mt-12 text-xs text-muted">
              This is a working draft. The production privacy policy is being
              reviewed by counsel and will replace this page before public
              launch.
            </p>
          </article>
        </div>
      </section>

      </main>
    <Footer />
    </>
  )
}
