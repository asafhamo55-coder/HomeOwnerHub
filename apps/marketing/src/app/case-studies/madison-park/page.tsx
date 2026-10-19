import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ArrowLeft, Check, Quote, MapPin, Users, Handshake } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HomeImage } from '@/components/site/home-image'
import { PHOTOS } from '@/lib/photos'

export const metadata: Metadata = {
  title: 'Madison Park HOA — Design partner',
  description:
    'HomeownerHub is built with Madison Park HOA, a 180-home self-managed association in Johns Creek, GA. What the board gets, and why we don’t publish numbers yet.',
}

// Truth rule (BL-042, BL-090): this page used to be a "case study" with
// numbers nothing in the repo backs ("32+ hours", "247 questions", a "$4,200
// reserve discrepancy", "15 min", "90 seconds", "zero support tickets"), a
// week-by-week story and a longer Linda quote, plus competitor prices. All of
// it is gone. What's left: who Madison Park is (PROJECT_FOUNDATION.md), the
// opening of Linda's reference quote (as in the testimonials marquee), and
// product facts a board can check in apps/hoa today.
const WHAT_THE_BOARD_GETS = [
  'Covenant Brain: rule questions answered with the CC&R section cited', // /ai/ask
  'Violation letters drafted from a photo, approved or rejected in Approvals', // /violations/new, /approvals
  'Meeting minutes drafted from the transcript, for the board to approve', // /meetings/new
  'AI ARC review with cited guidelines and editable decision letters', // /arc
  'Accounting with bank feeds, bill scan and a month-end board report', // /accounting
  'Roster import from CSV or Excel, CINC exports included', // /properties/import
]

export default function MadisonParkCase() {
  return (
    <main>
      <Nav />

      <article className="pt-32 pb-12">
        <div className="container-page">
          <Link
            href="/case-studies"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to case studies
          </Link>

          <div className="mt-10 grid gap-12 md:grid-cols-[2fr,1fr] md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                Design partner · Madison Park HOA
              </p>
              <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
                "I got my Tuesday nights back."
              </h1>
              <p className="mt-6 max-w-2xl text-xl leading-relaxed text-foreground-secondary">
                HomeownerHub is built with Madison Park, a 180-home self-managed HOA
                in Johns Creek, north of Atlanta. Their board helps shape what we
                build.
              </p>
            </div>

            <aside className="space-y-3 rounded-2xl border border-border/70 bg-surface p-6 ring-card">
              <FactRow Icon={MapPin} label="Location" value="Johns Creek, GA" />
              <FactRow Icon={Users} label="Size" value="180 homes · self-managed" />
              <FactRow Icon={Handshake} label="Role" value="Lead design partner" />
            </aside>
          </div>
        </div>
      </article>

      <section className="pb-16">
        <div className="container-page">
          <HomeImage
            src={PHOTOS.brickHomeManicured.src}
            alt={PHOTOS.brickHomeManicured.alt}
            className="aspect-[16/7] w-full"
            width={2400}
            sizes="(min-width: 1024px) 1200px, 100vw"
            priority
          />
          <p className="mt-3 text-xs text-muted">
            Photo · {PHOTOS.brickHomeManicured.credit}. Representative of the Madison Park community; not the property itself.
          </p>
        </div>
      </section>

      <section className="border-y border-border/60 bg-subtle/40 py-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              What the board gets
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              The AI drafts. The board decides.
            </h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {WHAT_THE_BOARD_GETS.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-relaxed text-foreground-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-10 rounded-2xl border border-border/70 bg-surface p-6 ring-card">
              <p className="text-sm font-semibold text-foreground">Why there are no numbers here yet</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
                A case study should report what a board measured, not what we
                estimate. We’ll publish Madison Park’s results once the board
                has measured them and signed off on every figure.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-foreground py-24 text-background">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <Quote className="h-9 w-9 text-accent" />
            <p className="mt-5 text-2xl leading-relaxed md:text-3xl">
              "I got my Tuesday nights back. Covenant Brain answers in seconds
              with the section cited."
            </p>
            <div className="mt-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-fg">
                L
              </div>
              <div>
                <p className="text-sm font-semibold">Linda</p>
                <p className="text-xs text-muted">Treasurer · Madison Park HOA</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-subtle via-surface to-accent-subtle/70" />
        <div className="container-page text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Want your board to be next?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-foreground-secondary">
            We pre-load your CC&R before the call, so the board can ask its own
            rules and watch the AI cite the answer.
          </p>
          <Link
            href="/demo"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-fg shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
          >
            Book a demo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function FactRow({
  Icon,
  label,
  value,
}: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-foreground-secondary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}
