import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, MapPin, Compass, Shield, Sparkles } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { pageMetadata } from '@/lib/site'
import { STATE_COVERAGE } from '@/lib/state-law'

// BL-097: HOA only. The "three products, one identity" story (PM Hub and
// Eviction Hub) is gone while those hubs are not offered, and so is the
// city roll-out timeline, whose dates had passed with nothing behind them.
export const metadata: Metadata = pageMetadata({
  title: 'About — AI for volunteer HOA boards',
  description:
    'Why HomeownerHub exists, what we believe, and how we work. Built in Atlanta for the volunteer board members doing the unpaid hours.',
  path: '/about',
})

const beliefs = [
  {
    Icon: Compass,
    title: 'Built for the board, not the management firm.',
    body:
      'Most HOA software is sold to management companies. HomeownerHub is built for the self-managed board: the treasurer, the secretary and the president who do this after work, with no operations team behind them.',
  },
  {
    Icon: Shield,
    title: 'AI honesty over AI hype.',
    body:
      'Every workflow ships with a Bar A / B / C label that says exactly what it can and can\'t do. Citations on every document and state-law answer. AI workflow runs are logged. We tell you what\'s production and what\'s demo.',
  },
  {
    Icon: Sparkles,
    title: 'Open-weight models, by design.',
    body:
      'We run open-weight models (OpenAI gpt-oss) on Groq instead of paying frontier-model rates. AI cost per board stays small, and that margin goes to features and pricing.',
  },
  {
    Icon: MapPin,
    title: 'State law, not generic templates.',
    body:
      'Associations live under state statutes, and we start with Georgia: the SB 406 registration kit, the collections notices Georgia requires, quorum and proxy rules and the annual report for owners, each citing the section it follows. Florida, California and Texas come next. Where the app doesn\'t know a figure, it leaves a blank for the board to fill. None of it is legal advice.',
  },
]

export default function AboutPage() {
  return (
    <main id="main-content">
      <Nav />

      <section className="hero-wash relative overflow-hidden pb-20 pt-32 md:pb-24 md:pt-40">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">Atlanta · est. 2026</p>
            <h1 className="t-display mt-5 text-foreground">
              AI for the people doing{' '}
              <span className="t-serif text-primary">the unpaid hours.</span>
            </h1>
            <p className="t-lead mx-auto mt-6 max-w-2xl">
              Volunteer board members run their neighborhoods after work, with no IT department and no management
              company. We built HomeownerHub for them.
            </p>
          </div>
        </div>
      </section>

      <section className="section pt-0 md:pt-0">
        <div className="container-page">
          <div className="card mx-auto grid max-w-5xl gap-8 p-8 md:grid-cols-[0.9fr_1.1fr] md:gap-14 md:p-14">
            <div>
              <p className="eyebrow">Why we exist</p>
              <h2 className="t-h2 mt-4 text-foreground">The paperwork is the job nobody volunteered for.</h2>
            </div>
            <div className="space-y-5 text-[17px] leading-relaxed text-foreground-secondary">
              <p>
                Most of a self-managed HOA runs on volunteer time. The treasurer doing rule research at 10pm. The
                secretary writing up minutes. The board member answering the same resident question for the third time
                this month.
              </p>
              <p>
                HomeownerHub drafts that paperwork: cited answers from your governing documents, violation and
                collections letters, announcements, inbox replies and the month-end report. The board reviews and
                approves every draft before anything goes out.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-surface">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">What we believe</p>
            <h2 className="t-h2 mt-4 text-foreground">
              Four beliefs that shape{' '}
              <span className="t-serif text-primary">every decision.</span>
            </h2>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {beliefs.map((b) => (
              <div key={b.title} className="card card-hover p-7 md:p-9">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg">
                  <b.Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.015em] text-foreground">{b.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-foreground-secondary">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-ink ink-glow">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow !text-[#8fb4ff]">Where we are</p>
            <h2 className="t-h2 mt-4 text-[#fff]">
              Built in Atlanta.{' '}
              <span className="t-serif text-[#8fb4ff]">Ready for your state’s rules.</span>
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-[#c3d0ea]">
              HomeownerHub is built and run from Atlanta, GA, and works for an HOA in any state. These parts follow a
              specific state&apos;s law today:
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATE_COVERAGE.map((s) => (
              <Geo key={s.state} state={s.state} label={s.name} status={s.items.join(' · ')} />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-page text-center">
          <h2 className="t-h2 mx-auto max-w-2xl text-foreground">Want to see how this actually works?</h2>
          <p className="t-lead mx-auto mt-5 max-w-xl">
            Ten minutes is all we need. We&apos;ll run the demo on your community&apos;s actual covenants.
          </p>
          <Link href="/demo" className="btn btn-primary btn-lg group mt-9">
            Start free pilot
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function Geo({ state, label, status }: { state: string; label: string; status: string }) {
  return (
    <div className="rounded-2xl border border-[#ffffff1a] bg-[#ffffff0d] p-5 text-left">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-[#fff]">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#ffffff26] px-1.5 text-[11px] font-bold">
          {state}
        </span>
        {label}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[#c3d0ea]">{status}</p>
    </div>
  )
}
