import type { Metadata } from 'next'
import Link from 'next/link'
import { Book, ArrowRight, FileText, Wrench, Shield, Compass } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'Product documentation, API reference, and operational runbooks for Ledger. Coming as we onboard our first cohort.',
}

const sections = [
  {
    Icon: Compass,
    title: 'Getting started',
    body: 'Onboarding from zero — upload your CC&R, configure your board, run your first Covenant Brain query.',
    when: 'Live when pilot cohort opens',
  },
  {
    Icon: FileText,
    title: 'Workflow guides',
    body: 'Per-workflow guides for all 17: how it works, what bar it ships at, what to expect.',
    when: 'Live with each workflow',
  },
  {
    Icon: Wrench,
    title: 'API reference',
    body: 'REST endpoints for events, action items, and the AI event log. Tokens, rate limits, webhooks.',
    when: 'Month 6 — first integration partner',
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
    <main>
      <Nav />

      <PageHero
        eyebrow="Documentation"
        title={
          <>
            Docs ship with the workflows.
          </>
        }
        subtitle="We're keeping docs honest by only publishing for what's live. Each workflow's guide lands the same week it moves into the product."
      />

      <section className="py-12">
        <div className="container-page">
          <div className="grid gap-5 md:grid-cols-2">
            {sections.map((s) => (
              <div key={s.title} className="rounded-2xl border border-border/70 bg-surface p-7 ring-card">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                  <s.Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{s.body}</p>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {s.when}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-surface p-8 text-center ring-card">
            <Book className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
              Want a specific doc faster?
            </h2>
            <p className="mt-3 text-sm text-foreground-secondary">
              Email us with the workflow or topic and we'll prioritize it.
            </p>
            <Link
              href="mailto:docs@ledger.ai?subject=Doc%20request"
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              docs@ledger.ai
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
