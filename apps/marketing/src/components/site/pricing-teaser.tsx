'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SIGN_UP_URL } from './brand'
import {
  ANNUAL_MONTHS_BILLED,
  BAND_EDGES,
  TRIAL_DAYS,
  bandAnnualUsd,
  bandMonthlyUsd,
  formatUsd,
  SOLD_BAND_PLAN,
} from '@/lib/hoa-pricing'

// Homepage pricing slider. Every number comes from lib/hoa-pricing.ts (the
// same functions /pricing and checkout mirror), never typed here. The slider
// is a native range input, so keyboard and screen readers work without extra
// code. Bullets name shipped features only; /pricing has the full list.

const MIN_HOMES = 10
const MAX_HOMES = 500

const PLAN = {
  name: 'HomeownerHub',
  sub: 'One plan, everything included',
  bullets: [
    'Ask your governing documents and get cited answers',
    'Violation letters drafted from photos, approved in one click',
    'Dues, resident portal and announcements',
    'Accounting, bank feeds and AI bill scan',
    'Shared inbox with AI reply drafts, vendors and RFPs',
  ],
}

function bandLabel(homes: number): string {
  const edge = BAND_EDGES.find((e) => homes <= e)
  return edge ? `Size band: up to ${edge} homes` : `Size band: over ${BAND_EDGES[BAND_EDGES.length - 1]} homes`
}

export function PricingTeaser() {
  const uid = useId()
  const [homes, setHomes] = useState(80)
  const [yearly, setYearly] = useState(false)

  return (
    <section className="section scroll-mt-20" id="pricing" aria-labelledby={`${uid}-h`}>
      <div className="container-page">
        <div className="hero-wash !m-0 px-5 py-14 sm:px-10 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">Pricing</p>
            <h2 id={`${uid}-h`} className="t-h2 mt-4 text-foreground">
              One plan, everything included. Priced by the size of your community.
            </h2>
            <p className="t-lead mt-4">
              Drag to your number of homes. {TRIAL_DAYS}-day free trial, no credit card, cancel anytime.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-[rgb(255_255_255/0.1)] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <label htmlFor={`${uid}-homes`} className="text-lg font-semibold text-foreground">
                <span className="tabular-nums">{homes}</span> homes
                <span className="ml-3 text-base font-normal text-muted">{bandLabel(homes)}</span>
              </label>
              <div role="group" aria-label="Billing period" className="inline-flex rounded-xl bg-[rgb(255_255_255/0.1)] p-1">
                {[
                  { y: false, label: 'Monthly' },
                  { y: true, label: 'Yearly' },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={yearly === o.y}
                    onClick={() => setYearly(o.y)}
                    className={cn(
                      'min-h-[44px] rounded-lg px-4 text-base font-semibold transition-colors',
                      yearly === o.y ? 'bg-[#fff] text-[#3b1ab5]' : 'text-foreground hover:bg-[rgb(255_255_255/0.1)]',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              id={`${uid}-homes`}
              type="range"
              min={MIN_HOMES}
              max={MAX_HOMES}
              step={5}
              value={homes}
              onChange={(e) => setHomes(Number(e.target.value))}
              aria-valuetext={`${homes} homes`}
              className="mt-5 h-11 w-full cursor-pointer accent-white"
            />
            <div className="flex justify-between text-sm text-muted" aria-hidden>
              <span>{MIN_HOMES}</span>
              <span>{MAX_HOMES}</span>
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-xl">
            {[PLAN].map((p) => {
              const price = yearly ? bandAnnualUsd(SOLD_BAND_PLAN, homes) : bandMonthlyUsd(SOLD_BAND_PLAN, homes)
              return (
                <div key={p.name} className="card flex flex-col p-7">
                  <p className="text-lg font-semibold text-foreground">{p.name}</p>
                  <p className="mt-1 text-base text-muted">{p.sub}</p>
                  <p className="mt-5 flex items-baseline gap-1.5" aria-live="polite">
                    <span className="text-5xl font-semibold tracking-[-0.03em] text-foreground tabular-nums">
                      {formatUsd(price)}
                    </span>
                    <span className="text-base text-muted">{yearly ? '/year' : '/month'}</span>
                  </p>
                  {yearly && (
                    <p className="mt-1 text-sm text-muted">
                      {ANNUAL_MONTHS_BILLED} months billed for 12: 2 months free.
                    </p>
                  )}
                  <ul className="mt-6 flex-1 space-y-3">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex gap-2.5 text-base text-foreground-secondary">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                  {/* A plain <a>: sign-up lives in the app, not this site. */}
                  <a href={SIGN_UP_URL} className="btn btn-primary mt-7">
                    Start free trial
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                </div>
              )
            })}
          </div>
          <p className="mt-8 text-center text-base text-muted">
            <Link href="/pricing" className="font-semibold text-foreground underline underline-offset-4">
              See everything that is included
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
