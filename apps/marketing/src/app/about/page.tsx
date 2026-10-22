import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, MapPin, Compass, Shield, Sparkles } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HomeImage } from '@/components/site/home-image'
import { PHOTOS } from '@/lib/photos'
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
    <main>
      <Nav />

      <section className="relative overflow-hidden pt-32 pb-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[640px] [mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_100%)]">
          <Image
            src={`${PHOTOS.hillsideAerial.src}?w=2400&q=80&auto=format&fit=crop`}
            alt={PHOTOS.hillsideAerial.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-[0.18]"
          />
        </div>
        <div className="absolute inset-0 -z-10 bg-radial-spot" />
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Atlanta · est. 2026
            </p>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-foreground md:text-[56px] md:leading-[1.05]">
              AI for the people doing the unpaid hours.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground-secondary">
              Volunteer board members run their neighborhoods after work, with
              no IT department and no management company. We built
              HomeownerHub for them.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-5xl">
            <HomeImage
              src={PHOTOS.treeCanopyStreet.src}
              alt={PHOTOS.treeCanopyStreet.alt}
              className="aspect-[16/7] w-full"
              width={2400}
              sizes="(min-width: 1024px) 1024px, 100vw"
            />
            <p className="mt-3 text-center text-xs text-muted">
              Photo · {PHOTOS.treeCanopyStreet.credit}
            </p>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border/70 bg-surface p-8 ring-card md:p-12">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Why we exist
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground">
              The paperwork is the job nobody volunteered for.
            </h2>
            <div className="prose prose-ink mt-6 max-w-none text-base leading-relaxed text-foreground-secondary">
              <p>
                Most of a self-managed HOA runs on volunteer time. The treasurer
                doing rule research at 10pm. The secretary writing up minutes.
                The board member answering the same resident question for the
                third time this month.
              </p>
              <p>
                HomeownerHub drafts that paperwork: cited answers from your
                governing documents, violation and collections letters,
                announcements, inbox replies and the month-end report. The
                board reviews and approves every draft before anything goes out.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 md:py-32">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent-fg">
              What we believe
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              Four beliefs that shape every decision.
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {beliefs.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-border/70 bg-surface p-7 ring-card"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                  <b.Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
                  {b.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-foreground py-24 text-background md:py-32">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">
              Where we are
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-5xl">
              Built in Atlanta. Ready for your state&apos;s rules.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-background/70">
              HomeownerHub is built and run from Atlanta, GA, and works for an
              HOA in any state. These parts follow a specific state&apos;s law today:
            </p>

            <div className="mt-12 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {STATE_COVERAGE.map((s) => (
                <Geo key={s.state} label={s.name} status={s.items.join(', ')} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-subtle via-surface to-accent-subtle/70" />
        <div className="container-page text-center">
          <h2 className="mx-auto max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Want to see how this actually works?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-foreground-secondary">
            Ten minutes is all we need. We'll run the demo on your community's actual covenants.
          </p>
          <Link
            href="/demo"
            className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-fg shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
          >
            Book a demo
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function Geo({ label, status }: { label: string; status: string }) {
  return (
    <div className="rounded-xl border border-background/10 bg-surface/[0.04] p-4 text-left">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-success">
        {'● '}
        {status}
      </p>
    </div>
  )
}
