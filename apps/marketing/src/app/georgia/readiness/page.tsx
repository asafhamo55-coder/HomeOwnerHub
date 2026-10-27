import type { Metadata } from 'next'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { Breadcrumbs, GeorgiaCta, NotLegalAdvice, RelatedLinks } from '@/components/georgia/parts'
import { ReadinessCheck } from '@/components/georgia/readiness-check'
import { breadcrumbLd, faqLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'Free SB 406 readiness check for Georgia HOA boards',
  description:
    'Ten yes/no questions to see how ready your Georgia HOA is for SB 406. You get a score and a checklist with links to plain-language guides. Nothing is stored or sent.',
  path: '/georgia/readiness',
})

const FAQS = [
  {
    q: 'Is my information stored or sent anywhere?',
    a: 'No. The score is worked out in your browser. Nothing you answer is saved, sent or logged, and closing the tab forgets it.',
  },
  {
    q: 'Does a perfect score mean we are compliant?',
    a: 'No. It is a self-check against ten points drawn from SB 406. Your attorney should confirm what applies to your association.',
  },
]

export default function ReadinessPage() {
  return (
    <main id="main-content">
      <Nav />
      <JsonLd
        data={[
          faqLd(FAQS),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Georgia', path: '/georgia' },
            { name: 'SB 406 readiness check', path: '/georgia/readiness' },
          ]),
        ]}
      />
      <header className="hero-wash relative overflow-hidden pb-10 pt-28 md:pb-14 md:pt-36">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'Georgia', href: '/georgia' }, { name: 'Readiness check' }]} />
            <p className="eyebrow mt-6">Free · About 3 minutes</p>
            <h1 className="mt-4 text-[clamp(2rem,1.4rem+2.2vw,3.1rem)] font-medium leading-[1.08] tracking-[-0.03em] text-foreground">
              Is your Georgia HOA ready for SB 406?
            </h1>
            <p className="t-lead mt-5 max-w-2xl">
              Answer ten yes/no questions. You get a score and a checklist of what is still open, with a plain-language guide
              for each item. Your answers stay in your browser: nothing is stored or sent.
            </p>
          </div>
        </div>
      </header>

      <div className="container-page pb-16">
        <div className="mx-auto max-w-3xl">
          <ReadinessCheck />

          <div className="mt-10">
            <NotLegalAdvice />
          </div>

          <dl className="card mt-10 divide-y divide-border">
            {FAQS.map((f) => (
              <div key={f.q} className="px-6 py-5">
                <dt className="text-[16px] font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{f.a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12">
            <RelatedLinks slugs={['registration-2027', 'attorney-fee-notice', 'foreclosure-threshold-2027', 'owners-rights-2027']} title="Start with the guides" />
          </div>
        </div>
      </div>

      <GeorgiaCta position="readiness_page" />
      <Footer />
    </main>
  )
}
