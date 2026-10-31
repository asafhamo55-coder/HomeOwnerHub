import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, AlertCircle, BookOpen, ArrowRight } from 'lucide-react'
import { PageHero } from '@/components/site/page-hero'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { WORKFLOWS, BAR_TARGETS, type Bar } from '@/lib/workflows'
import { RoadmapTable } from './roadmap-table'
import { cn } from '@/lib/cn'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/roadmap']!, path: '/roadmap' })

const barIcon: Record<Bar, typeof ShieldCheck> = {
  C: ShieldCheck,
  B: AlertCircle,
  A: BookOpen,
  '—': BookOpen,
}

const barColor: Record<Bar, string> = {
  C: 'bg-success-subtle text-success ring-success/15',
  B: 'bg-warning-subtle text-warning ring-warning/15',
  A: 'bg-subtle text-foreground-secondary ring-border',
  '—': 'bg-subtle text-muted ring-border',
}

const LANES = [
  {
    name: 'Now',
    title: 'Easier for first-time volunteers',
    items: [
      { label: 'Simpler sign-in and invites', note: 'Plain-language messages when a link has expired, and a choice of password or email link.' },
      { label: 'Confirm before you send', note: 'Announcements and architectural decisions will say who gets told before anything goes out.' },
      { label: 'Larger text and clearer screens', note: 'Bigger type and plainer names on the board screens.' },
    ],
  },
  {
    name: 'Next',
    title: 'Closing the gaps with other HOA tools',
    items: [
      { label: 'Online payments', note: 'Residents pay dues by card or bank transfer. Not live yet.' },
      { label: 'Text messages with consent', note: 'Urgent notices to residents who do not read email.' },
      { label: 'Autopay', note: 'Residents enroll once and dues are charged on the due date.' },
      { label: 'Mailed letters', note: 'Violation and collection letters sent by post, with proof of mailing.' },
    ],
  },
  {
    name: 'Later',
    title: 'Bigger pieces, no date yet',
    items: [
      { label: 'Reserve planning', note: 'Reserve fund projections beyond today’s snapshot.' },
      { label: 'Community website', note: 'A public page for each association.' },
      { label: 'Amenity booking and vendor payments', note: 'Reservations, and paying vendors by bank transfer.' },
      { label: 'Native mobile app', note: 'An app for phones, beyond the mobile website.' },
    ],
  },
]

export default function RoadmapPage() {
  const shipped = WORKFLOWS.filter((w) => w.status === 'shipped').length
  const building = WORKFLOWS.filter((w) => w.status === 'building').length
  const planned = WORKFLOWS.filter((w) => w.status === 'planned').length

  return (
    <>
      <Nav />
    <main id="main-content">

      <PageHero
        eyebrow="Public roadmap"
        title="What we are building, in the open."
        subtitle="Now, Next and Later, plus every workflow with its quality bar. No dates we cannot keep."
      />

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="grid gap-5 lg:grid-cols-3">
            {LANES.map((lane) => (
              <div key={lane.name} className="card p-7 md:p-8">
                <p className="eyebrow">{lane.name}</p>
                <h2 className="t-h3 mt-3 text-foreground">{lane.title}</h2>
                <ul className="mt-5 space-y-4">
                  {lane.items.map((i) => (
                    <li key={i.label} className="text-[17px] leading-relaxed text-foreground-secondary">
                      <span className="font-semibold text-foreground">{i.label}.</span> {i.note}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-base leading-relaxed text-foreground-secondary">
            Online card and bank payments for residents are not live today. They are the first item under Next and
            depend on setting up the payment account. Order can change when a board tells us something matters more.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Stat label="Shipped" value={shipped} sub="Workflows in production or beta" tone="emerald" />
            <Stat label="Building" value={building} sub="In active development" tone="amber" />
            <Stat label="Planned" value={planned} sub="Scoped, not started" tone="slate" />
          </div>
        </div>
      </section>

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="card p-6 md:p-8">
            <h2 className="t-h3 text-foreground">What the bars mean</h2>
            <p className="mt-2 text-[17px] text-foreground-secondary">
              Every workflow ships at a labeled quality bar, published on this
              site.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {(['C', 'B', 'A'] as const).map((b) => {
                const Icon = barIcon[b]
                return (
                  <div
                    key={b}
                    className="rounded-xl border border-border/70 bg-subtle/40 p-5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold ring-1',
                          barColor[b],
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        Bar {b}
                      </span>
                      <span className="text-base font-semibold text-foreground">
                        {BAR_TARGETS[b].name}
                      </span>
                    </div>
                    <p className="mt-3 text-[17px] leading-relaxed text-foreground-secondary">
                      {BAR_TARGETS[b].threshold}
                    </p>
                  </div>
                )
              })}
            </div>
            <p className="mt-6 text-base text-foreground-secondary">
              Movement between bars (A → B → C) needs a human review gate and
              passing tests, and every move is published here.{' '}
              <Link href="/honesty-bars" className="font-semibold text-foreground underline-offset-4 hover:underline">
                Read the full bar policy →
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="mb-10 md:flex md:items-end md:justify-between md:gap-12">
            <div className="max-w-xl">
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                All {WORKFLOWS.length} workflows
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-foreground-secondary">
                Filter by hub, bar, or status. This list changes in the same
                release as the workflow it describes.
              </p>
            </div>
          </div>

          <RoadmapTable />

          <div className="mt-16 card p-8 text-center">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              Want input on what we build next?
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-[17px] text-foreground-secondary">
              Tell us what your board needs next. We read every request.
            </p>
            <Link
              href="/demo"
              className="btn btn-primary mt-6"
            >
              Book a demo
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

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number
  sub: string
  tone: 'emerald' | 'amber' | 'slate'
}) {
  const colors = {
    emerald: 'border-success/25 bg-success-subtle/40',
    amber: 'border-warning/25 bg-warning-subtle/40',
    slate: 'border-border bg-subtle/40',
  }[tone]
  return (
    <div className={cn('rounded-2xl border bg-surface p-6 text-left', colors)}>
      <p className="text-4xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-base font-semibold text-foreground-secondary">{label}</p>
      <p className="mt-1 text-base text-foreground-secondary">{sub}</p>
    </div>
  )
}
