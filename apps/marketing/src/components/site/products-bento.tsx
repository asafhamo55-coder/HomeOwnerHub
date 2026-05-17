import Link from 'next/link'
import { ArrowUpRight, Building2, Home, Scale, ShieldCheck, FileText, Calendar, Wallet, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

// Asymmetric bento: HOA gets a wide hero card spanning both rows on the left,
// PM and Eviction stack on the right. Breaks the 3-up icon-grid pattern.

export function ProductsBento() {
  return (
    <section className="py-20 md:py-28" id="products">
      <div className="container-page">
        <header className="mb-12 md:mb-16 md:flex md:items-end md:justify-between md:gap-12">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Three products · one platform
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] text-ink-900 md:text-4xl">
              One operator. Three life stages. One platform.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-500 md:mt-0">
            Most people who serve on an HOA board also rent out a property — and
            when a tenancy breaks down, they need the legal piece too. We
            follow them through every stage.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
          {/* HOA — wide hero card */}
          <Link
            href="/hoa"
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-7 ring-card md:col-span-2 md:row-span-2 md:p-10"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Building2 className="h-5 w-5" />
              </div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                HOA Hub
              </span>
            </div>

            <h3 className="mt-8 text-2xl font-semibold tracking-tight text-ink-900 md:text-[32px] md:leading-tight">
              Run a self-managed HOA without a management company.
            </h3>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-600">
              Nine AI workflows — Covenant Brain, Violation Drafter, Minutes
              Engine, Reserve Live, ARC Recommender, Vendor Oracle, Multilingual
              Comms, Resident Portal, Board Copilot.
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              <Feature Icon={FileText} label="Covenant Brain · 4-second cited answers" />
              <Feature Icon={Calendar} label="Minutes Engine · same-night drafts" />
              <Feature Icon={ShieldCheck} label="Citations on every legal answer" />
              <Feature Icon={AlertCircle} label="Violation drafter · tap to approve" />
            </ul>

            <span className="mt-auto inline-flex items-center gap-1.5 pt-10 text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
              Tour HOA Hub
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </Link>

          {/* PM */}
          <Link
            href="/landlords"
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-7 ring-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ember-50 text-ember-700">
                <Home className="h-5 w-5" />
              </div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-700">
                PM Hub
              </span>
            </div>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink-900">
              For 2–50 unit landlords.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              Zero-touch rent collection. Delinquency Coach that catches late
              rent before it spirals.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs text-ink-500">
              <Wallet className="h-3.5 w-3.5" />
              <span>From <strong className="font-mono font-semibold text-ink-900">$0</strong>/mo</span>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
              Tour PM Hub
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </Link>

          {/* Eviction */}
          <Link
            href="/eviction"
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-7 ring-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <Scale className="h-5 w-5" />
              </div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                Eviction
              </span>
            </div>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-ink-900">
              When a tenancy goes wrong.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              County-correct notices. Every template reviewed by a Georgia
              attorney. Demo-only filings.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs text-ink-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span><strong className="font-mono font-semibold text-ink-900">98%</strong> compliance rate</span>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
              Tour Eviction Hub
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}

function Feature({ Icon, label }: { Icon: typeof FileText; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-ink-700">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0 text-emerald-600')} />
      <span>{label}</span>
    </li>
  )
}
