import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ArrowLeft, Quote, MapPin, Users, Clock } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HomeImage } from '@/components/site/home-image'
import { PHOTOS } from '@/lib/photos'

export const metadata: Metadata = {
  title: 'Madison Park HOA — Case study',
  description:
    'How a 180-home self-managed HOA in Johns Creek reclaimed 32 hours a month and caught a $4,200 reserve discrepancy in week three.',
}

const timeline = [
  { day: 'Day 1', title: 'Documents uploaded', body: 'CC&R (1996, restated 2024), Bylaws, 2025 budget, last 12 months of minutes. 47 PDFs total.' },
  { day: 'Day 1 · 15 min', title: 'First Aha', body: 'Linda asks Covenant Brain: "Can residents paint their fence?" Answer cited Section 3.4. Sent to the board over text.' },
  { day: 'Week 1', title: 'Board onboarded', body: 'Three remaining board members invited. All trained themselves via the 2-minute tour. Zero support tickets.' },
  { day: 'Week 2', title: 'First violation notice', body: 'Drafter generated a fence-color violation. Linda approved in 90 seconds. Resident replied within 48 hours.' },
  { day: 'Week 3', title: 'Reserve discrepancy caught', body: 'Reserve Live flagged a $4,200 variance between the spreadsheet and the bank reconciliation. Three-year-old error.' },
  { day: 'Month 1', title: 'Meeting minutes shipped same night', body: 'Minutes Engine recorded the March board meeting. Draft minutes ready before the board got home.' },
]

export default function MadisonParkCase() {
  return (
    <main>
      <Nav />

      <article className="pt-32 pb-12">
        <div className="container-page">
          <Link
            href="/case-studies"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to case studies
          </Link>

          <div className="mt-10 grid gap-12 md:grid-cols-[2fr,1fr] md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                Case study · Madison Park HOA
              </p>
              <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight text-ink-900 md:text-6xl">
                "I got my Tuesday nights back."
              </h1>
              <p className="mt-6 max-w-2xl text-xl leading-relaxed text-ink-600">
                How a 180-home self-managed HOA in Johns Creek reclaimed 32+
                hours a month and caught a $4,200 reserve discrepancy in week
                three.
              </p>
            </div>

            <aside className="space-y-3 rounded-2xl border border-ink-200/70 bg-white p-6 ring-card">
              <FactRow Icon={MapPin} label="Location" value="Johns Creek, GA" />
              <FactRow Icon={Users} label="Size" value="180 homes · all volunteer" />
              <FactRow Icon={Clock} label="Onboarded" value="January 2026" />
              <div className="border-t border-ink-200/70 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Workflows live
                </p>
                <p className="mt-1 text-sm text-ink-800">
                  Covenant Brain · Violation Drafter · Minutes Engine · Reserve Live · Onboarding Agent
                </p>
              </div>
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
          <p className="mt-3 text-xs text-ink-500">
            Photo · {PHOTOS.brickHomeManicured.credit}. Representative of the Madison Park community; not the property itself.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <BigStat value="32+" label="Hours saved / month" sub="Treasurer + secretary combined" />
            <BigStat value="$4,200" label="Discrepancy caught" sub="Week 3 reserve audit" />
            <BigStat value="247" label="Covenant questions" sub="First 30 days" />
          </div>
        </div>
      </section>

      <section className="border-y border-ink-200/60 bg-ink-50/40 py-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              The situation
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Three volunteers, 180 homes, no management company.
            </h2>
            <div className="prose prose-ink mt-6 max-w-none text-base leading-relaxed text-ink-700">
              <p>
                Madison Park is a 180-home self-managed HOA in Johns Creek, north
                of Atlanta. The board has three members and no paid staff. Linda
                Jackson, the treasurer, was carrying eight to twelve unpaid hours
                a week — running covenant lookups by hand, drafting violation
                notices in Google Docs, and writing meeting minutes from memory
                the weekend after each board meeting.
              </p>
              <p>
                The breaking point was a reserve fund question that took her six
                hours to answer because the most recent CC&R restatement
                contradicted a 2018 amendment, and nobody had reconciled them.
                She started looking for software the next morning.
              </p>
              <p>
                Everything she found was either built for management companies
                (BoardStack, FrontSteps — $1,800/month, four-week onboarding) or
                built for HOAs that had no AI worth speaking of (TownSq, HOA
                Express — cheap and dumb). Ledger was the only product
                where the AI did the actual work she needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-ember-600">
              The first month, week by week
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              From PDF pile to working AI in 15 minutes.
            </h2>

            <ol className="mt-12 space-y-6 border-l border-ink-200 pl-8">
              {timeline.map((t, i) => (
                <li key={t.day} className="relative">
                  <span className="absolute -left-[37px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-brand-500 ring-4 ring-white" />
                  <p className="font-mono text-xs font-semibold text-brand-700">{t.day}</p>
                  <h3 className="mt-1 text-base font-semibold text-ink-900">{t.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{t.body}</p>
                  {i === 4 && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <p className="text-xs font-semibold text-emerald-800">
                        Pay-for-itself moment
                      </p>
                      <p className="mt-1 text-xs text-ink-700">
                        Linda's words: "Ledger paid for itself in week three."
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="bg-ink-900 py-24 text-white">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <Quote className="h-9 w-9 text-ember-400" />
            <p className="mt-5 text-2xl leading-relaxed md:text-3xl">
              "We're 180 homes, all volunteer. I was the treasurer carrying eight
              to twelve unpaid hours a week. Ledger answers covenant
              questions in seconds with the exact section cited, drafts violation
              notices for the board to approve, and writes our meeting minutes
              the night of. The first month, we caught a reserve fund discrepancy
              nobody had noticed in three years."
            </p>
            <div className="mt-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-ember-500 text-base font-semibold text-white">
                LJ
              </div>
              <div>
                <p className="text-sm font-semibold">Linda Jackson</p>
                <p className="text-xs text-ink-400">Treasurer · Madison Park HOA</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-white to-ember-50/70" />
        <div className="container-page text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Want your board to be next?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600">
            We pre-load your CC&R before the call. By minute four, the board is
            asking their own rules and watching the AI cite the answer.
          </p>
          <Link
            href="/demo"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-ink-800 hover:shadow-md"
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
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-700">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink-900">{value}</p>
      </div>
    </div>
  )
}

function BigStat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-7 ring-card">
      <p className="text-4xl font-semibold tracking-tight text-ink-900">{value}</p>
      <p className="mt-2 text-sm font-semibold text-ink-700">{label}</p>
      <p className="mt-1 text-xs text-ink-500">{sub}</p>
    </div>
  )
}
