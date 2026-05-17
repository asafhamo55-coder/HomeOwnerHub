import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, MapPin, Compass, Shield, Sparkles } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HomeImage } from '@/components/site/home-image'
import { PHOTOS } from '@/lib/photos'

export const metadata: Metadata = {
  title: 'About — AI for the people who run residential property',
  description:
    'Why Ledger exists, what we believe, and how we work. Built in Atlanta for the people doing the unpaid hours.',
}

const beliefs = [
  {
    Icon: Compass,
    title: 'Same buyer, three life stages.',
    body:
      'The HOA board member who serves a notice on Tuesday is the same person who manages a rental on the side and may one day need eviction help. We\'re the only platform that follows them through the whole arc — not three SKUs sold by three sales teams.',
  },
  {
    Icon: Shield,
    title: 'AI honesty over AI hype.',
    body:
      'Every workflow ships with a Bar A / B / C label that says exactly what it can and can\'t do. Citations on every legal-adjacent answer. Audit log on every AI action. We tell you what\'s production and what\'s demo.',
  },
  {
    Icon: Sparkles,
    title: 'Self-hosted, by design.',
    body:
      'We run our own open-source LLM stack. Marginal AI cost is roughly 10× lower than competitors paying frontier API rates. That margin goes to features and pricing — not to OpenAI\'s growth.',
  },
  {
    Icon: MapPin,
    title: 'Local before national.',
    body:
      'Atlanta-metro first. Charlotte, Raleigh, Nashville, Tampa, Orlando next. The volunteer treasurer wants someone who knows her county\'s rules and her neighborhood\'s neighborhood — not a chatbot in San Francisco.',
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
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Atlanta · est. 2026
            </p>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-[56px] md:leading-[1.05]">
              AI for the people doing the unpaid hours.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
              Volunteer board members. Side-hustle landlords. First-time
              evictors. The people running residential property in America don't
              have an IT department. We built Ledger for them.
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
            <p className="mt-3 text-center text-xs text-ink-500">
              Photo · {PHOTOS.treeCanopyStreet.credit}
            </p>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl rounded-2xl border border-ink-200/70 bg-white p-8 ring-card md:p-12">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              The wedge
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900">
              Three products. One identity.
            </h2>
            <div className="prose prose-ink mt-6 max-w-none text-base leading-relaxed text-ink-700">
              <p>
                Most of residential property life happens on volunteer time. The
                HOA treasurer doing rule research at 10pm. The micro-landlord
                chasing rent on Venmo. The first-time evictor terrified she'll
                serve the wrong notice and reset the clock.
              </p>
              <p>
                These look like three markets. They're actually one buyer at
                different life stages. A 38-year-old who serves on her HOA board
                is also renting out her starter home. When the tenancy goes
                sideways, she's the first-time evictor too. Three SKUs.
                One identity.
              </p>
              <p>
                Ledger is the AI-native operating system that follows that
                buyer through every stage — with 17 vertical AI workflows that
                automate the work today's incumbents leave to volunteers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 md:py-32">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-ember-600">
              What we believe
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
              Four beliefs that shape every decision.
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {beliefs.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-ink-200/70 bg-white p-7 ring-card"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <b.Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                  {b.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink-900 py-24 text-white md:py-32">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-ember-400">
              Where we are
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-5xl">
              Atlanta first. Southeast next. National after that.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-300">
              Ledger is built and run from Atlanta, GA. Our v1 customer
              base is Atlanta-metro HOAs. We add geographies as we onboard
              customers there — not before.
            </p>

            <div className="mt-12 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Geo label="Atlanta, GA" status="Live" />
              <Geo label="Charlotte / Raleigh" status="Q3 2026" />
              <Geo label="Nashville" status="Q3 2026" />
              <Geo label="Tampa / Orlando" status="Q4 2026" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-white to-ember-50/70" />
        <div className="container-page text-center">
          <h2 className="mx-auto max-w-2xl text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Want to see how this actually works?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600">
            Ten minutes is all we need. We'll run the demo on your community's actual covenants.
          </p>
          <Link
            href="/demo"
            className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-ink-800 hover:shadow-md"
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
  const live = status === 'Live'
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left">
      <p className="text-sm font-semibold">{label}</p>
      <p className={`mt-1 text-xs ${live ? 'text-emerald-400' : 'text-ink-400'}`}>
        {live ? '● ' : '○ '}
        {status}
      </p>
    </div>
  )
}
