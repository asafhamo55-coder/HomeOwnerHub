import type { Metadata } from 'next'
import Link from 'next/link'
import { Book, ArrowRight, FileText, Wrench, Shield, Compass } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/docs']!, path: '/docs' })

const sections = [
  {
    Icon: Compass,
    title: 'Getting started',
    body: 'The Help centre inside the app: step-by-step articles with screenshots for the jobs a new board does first, from setting up the HOA and importing the roster to billing dues. Ask the guide answers how-to questions from those articles.',
    when: 'Live in the app (Help)',
  },
  {
    Icon: FileText,
    title: 'Workflow guides',
    body: 'Per-workflow guides: how it works, what bar it ships at, what to expect. Help on every page shows the articles for the screen you are on.',
    when: 'Growing with each release',
  },
  {
    Icon: Wrench,
    title: 'API reference',
    body: 'REST endpoints for events, action items, and the AI event log. Tokens, rate limits, webhooks.',
    when: 'Planned · no date yet',
  },
  {
    Icon: Shield,
    title: 'Security & compliance',
    body: 'DPA template, security questionnaire responses, audit log queries, data export.',
    when: 'On request today',
  },
]

export default function DocsPage() {
  return (
    <>
      <Nav />
    <main id="main-content">

      <PageHero
        eyebrow="Documentation"
        title={
          <>
            Docs ship with the workflows.
          </>
        }
        subtitle="We're keeping docs honest by only publishing for what's live. Each workflow's guide lands the same week it moves into the product."
      />

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="grid gap-5 md:grid-cols-2">
            {sections.map((s) => (
              <div key={s.title} className="card p-7 md:p-8">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg">
                  <s.Icon className="h-6 w-6" aria-hidden />
                </div>
                <h2 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
                  {s.title}
                </h2>
                <p className="mt-3 text-[17px] leading-relaxed text-foreground-secondary">{s.body}</p>
                <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-foreground-secondary">
                  {s.when}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="card mx-auto max-w-2xl p-8 text-center">
            <Book className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-4 t-h3 text-foreground">
              Want a specific doc faster?
            </h2>
            <p className="mt-3 text-[17px] text-foreground-secondary">
              Email us with the workflow or topic and we'll prioritize it.
            </p>
            <Link
              href="mailto:support@homeownerledger.com?subject=Doc%20request"
              className="mt-6 btn btn-primary max-w-full"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">support@homeownerledger.com</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      </main>
    <Footer />
    </>
  )
}
