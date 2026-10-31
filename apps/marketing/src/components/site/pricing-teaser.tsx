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
  type HoaBandPlan,
} from '@/lib/hoa-pricing'

// Homepage pricing slider. Every number comes from lib/hoa-pricing.ts (the
// same functions /pricing and checkout mirror), never typed here. The slider
// is a native range input, so keyboard and screen readers work without extra
// code. Bullets name shipped features only; /pricing has the full list.

const MIN_HOMES = 10
const MAX_HOMES = 500

const PLANS: { id: HoaBandPlan; name: string; sub: string; bullets: string[]; featured?: boolean }[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    sub: 'The AI assistant, dues and the resident portal',
    bullets: [
      'Ask your governing documents and get cited answers',
      'Violation letters drafted from photos, approved in one click',
      'Dues, resident portal and announcements',
    ],
  },
  {
    id: 'complete',
    name: 'Complete',
    sub: 'Everything in Essentials, plus the money and the mailbox',
    featured: true,
    bullets: [
      'Accounting, bank feeds and AI bill scan',
      'Shared inbox with AI reply drafts, vendors and RFPs',
      'Month-end board report',
    ],
  },
]

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
              Two plans. Priced by the size of your community.
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

          <div className="mx-auto mt-8 grid max-w-3xl gap-5 md:grid-cols-2">
            {PLANS.map((p) => {
              const price = yearly ? bandAnnualUsd(p.id, homes) : bandMonthlyUsd(p.id, homes)
              return (
                <div key={p.id} className="card flex flex-col p-7">
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
                  <Link href={SIGN_UP_URL} className={cn('btn mt-7', p.featured ? 'btn-primary' : 'btn-secondary')}>
                    Start free trial
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              )
            })}
          </div>
          <p className="mt-8 text-center text-base text-muted">
            <Link href="/pricing" className="font-semibold text-foreground underline underline-offset-4">
              See every plan detail
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
