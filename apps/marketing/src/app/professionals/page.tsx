import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Clock, FileText, Scale } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { JsonLd } from '@/components/site/json-ld'
import { TrackedLink } from '@/components/site/tracked-link'
import { Breadcrumbs, NotLegalAdvice } from '@/components/georgia/parts'
import { formatDate } from '@/components/georgia/guide-page'
import { breadcrumbLd, faqLd } from '@/lib/jsonld'
import { PLANNED, PROFESSIONALS_FAQS, PROFESSIONALS_META, PROFESSIONALS_PATH, PROFESSIONALS_UPDATED, SHARE_TODAY } from '@/lib/professionals'
import { SITE_ORIGIN, pageMetadata } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: PROFESSIONALS_META.title,
  description: PROFESSIONALS_META.description,
  path: '/professionals', // must equal PROFESSIONALS_PATH (tests check the literal)
})

export default function ProfessionalsPage() {
  return (
    <main id="main-content">
      <Nav />
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: PROFESSIONALS_META.title,
            description: PROFESSIONALS_META.description,
            url: `${SITE_ORIGIN}${PROFESSIONALS_PATH}`,
            dateModified: PROFESSIONALS_UPDATED,
          },
          faqLd(PROFESSIONALS_FAQS),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'For attorneys and CPAs', path: PROFESSIONALS_PATH },
          ]),
        ]}
      />

      <header className="hero-wash relative overflow-hidden pb-12 pt-28 md:pb-16 md:pt-36">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: 'For attorneys and CPAs' }]} />
            <p className="eyebrow mt-6">For HOA attorneys and CPAs</p>
            <h1 className="mt-4 text-[clamp(2rem,1.4rem+2.2vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.03em] text-foreground">
              Working with self-managed boards that keep their records in one place
            </h1>
            <p className="mt-5 text-sm text-muted">
              Updated <time dateTime={PROFESSIONALS_UPDATED}>{formatDate(PROFESSIONALS_UPDATED)}</time>
            </p>
            <p className="t-lead mt-6">
              Your HOA clients are volunteer boards. HomeownerHub keeps their books, notices and files tidy, so you get
              cleaner inputs and fewer follow-up questions.
            </p>
          </div>
        </div>
      </header>

      <div className="container-page pb-16">
        <div className="mx-auto max-w-3xl">
          <section aria-labelledby="status" className="rounded-2xl border border-warning/30 bg-warning-subtle/40 p-6 md:p-7">
            <h2 id="status" className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Clock className="h-5 w-5" aria-hidden />
              Professional seats are coming soon
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-foreground-secondary">
              <strong className="font-semibold text-foreground">Not live yet.</strong> You cannot be given a login as an
              attorney or a CPA today. We have not set a launch date and do not promise one on this page. Below is what a
              board can already share with you, and what we plan to build.
            </p>
          </section>

          <section className="mt-14" aria-labelledby="today">
            <h2 id="today" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
              What a board can share with you today
            </h2>
            <p className="mt-4 text-[17px] leading-[1.7] text-foreground-secondary">
              Each of these is live in the app now. A board member downloads or opens it and sends it to you.
            </p>
            <ul className="mt-6 space-y-4">
              {SHARE_TODAY.map((s) => (
                <li key={s.title} className="card p-6">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {s.audience === 'Attorney' ? <Scale className="h-3.5 w-3.5" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
                    {s.audience === 'Both' ? 'Attorney and CPA' : s.audience}
                  </p>
                  <p className="mt-2 text-[17px] font-semibold text-foreground">{s.title}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{s.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-14" aria-labelledby="planned">
            <h2 id="planned" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
              Planned, not live: professional seats
            </h2>
            <p className="mt-4 text-[17px] leading-[1.7] text-foreground-secondary">
              This is the design we are working toward. It may change, and none of it is available today.
            </p>
            <ul className="mt-5 list-disc space-y-2 pl-6 text-[17px] leading-[1.65] text-foreground-secondary marker:text-muted">
              {PLANNED.map((p) => (
                <li key={p.text}>
                  <span className="font-semibold text-foreground">{p.role === 'Both' ? 'Both roles' : p.role}:</span> {p.text}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-14" aria-labelledby="how">
            <h2 id="how" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
              How the board stays in charge
            </h2>
            <p className="mt-4 text-[17px] leading-[1.7] text-foreground-secondary">
              HomeownerHub prepares paperwork and cites the law. The board approves every draft, and you advise the
              board. It does not give legal or tax advice, and it does not file with the state or the IRS for the board.
            </p>
            <div className="mt-6">
              <NotLegalAdvice />
            </div>
            <p className="mt-6 text-[17px] leading-[1.7] text-foreground-secondary">
              If you advise Georgia associations, our free{' '}
              <Link href="/georgia" className="font-semibold text-primary hover:underline">
                SB 406 guides and checklists
              </Link>{' '}
              quote the statute word for word, so you can check them against your own reading. You are welcome to share
              them with clients.
            </p>
          </section>

          <section className="mt-14" aria-labelledby="faq">
            <h2 id="faq" className="t-h2 !text-[26px] text-foreground md:!text-[30px]">
              Questions
            </h2>
            <dl className="card mt-5 divide-y divide-border">
              {PROFESSIONALS_FAQS.map((f) => (
                <div key={f.q} className="px-6 py-5">
                  <dt className="text-[16px] font-semibold text-foreground">{f.q}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      <section className="section section-ink ink-glow overflow-hidden">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="t-h2 text-[#fff]">Tell us how you would use it</h2>
            <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-foreground-secondary">
              Book a short demo, or write to us about professional seats. We reply within 1 business day.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <TrackedLink href="/demo" event="demo_cta_click" position="professionals_end" className="btn btn-lg btn-on-ink group">
                Book a demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </TrackedLink>
              <a href="mailto:support@homeownerledger.com?subject=Professional%20seats" className="btn btn-lg btn-ghost-ink">
                Email us about seats
              </a>
            </div>
            <p className="mt-6 text-sm text-muted">Professional seats are coming soon · Not legal or tax advice</p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}
