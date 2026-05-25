'use client'

import { useMemo, useState } from 'react'
import { Calculator, ArrowRight, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/cn'

// Per-door pricing — $4.99/door/month with a $200/month minimum.
// Keep this in sync with packages/billing/src/pricing.ts (kept literal
// here because the marketing app doesn't depend on @homeowner-portal/billing).
const PER_DOOR_USD = 4.99
const MIN_MONTHLY_USD = 200

function selectTier(doors: number): { name: string; monthly: number } {
  const computed = doors * PER_DOOR_USD
  const monthly = Math.max(computed, MIN_MONTHLY_USD)
  const name = computed < MIN_MONTHLY_USD ? 'HOA Hub (minimum)' : 'HOA Hub'
  return { name, monthly: Math.round(monthly) }
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function RoiCalculator() {
  const [doors, setDoors] = useState(180)
  const [feePerDoorPerMo, setFeePerDoorPerMo] = useState(10)
  const [hoursPerWeek, setHoursPerWeek] = useState(8)

  const { tier, hhAnnual, currentAnnualMgmt, volunteerHoursAnnualValue, totalSavings, paybackWeeks } = useMemo(() => {
    const tier = selectTier(doors)
    const hhAnnual = tier.monthly * 12
    const currentAnnualMgmt = doors * feePerDoorPerMo * 12
    const volunteerHoursAnnualValue = hoursPerWeek * 52 * 50 // $50/hr — financial-analyst opportunity cost
    const totalSavings = currentAnnualMgmt + volunteerHoursAnnualValue - hhAnnual
    const weeklyHhCost = hhAnnual / 52
    const weeklyCurrent = currentAnnualMgmt / 52 + (hoursPerWeek * 50)
    const paybackWeeks = weeklyCurrent > 0 ? Math.max(1, Math.ceil(hhAnnual / weeklyCurrent)) : 999
    return { tier, hhAnnual, currentAnnualMgmt, volunteerHoursAnnualValue, totalSavings, paybackWeeks }
  }, [doors, feePerDoorPerMo, hoursPerWeek])

  return (
    <section className="border-t border-ink-200/60 py-24 md:py-32" id="roi">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-ink-200/70 bg-white px-3.5 py-1.5 text-xs font-medium text-ink-700 ring-soft">
            <Calculator className="h-3.5 w-3.5 text-brand-600" />
            ROI calculator
          </div>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            Numbers to take to the board.
          </h2>
          <p className="mt-4 text-base text-ink-500">
            Three sliders. Your annual savings, the right plan, and payback in
            weeks. Linda was a financial analyst — she'll appreciate this.
          </p>
        </div>

        <div className="mt-12 grid gap-6 rounded-3xl border border-ink-200/70 bg-white p-6 md:grid-cols-[1.1fr,1fr] md:p-10 ring-card">
          <div className="space-y-7">
            <Slider
              label="Doors in your community"
              min={20}
              max={1000}
              step={10}
              value={doors}
              onChange={setDoors}
              display={`${doors}`}
              hint={`Tier: ${tier.name} · ${fmtUsd(tier.monthly)}/mo`}
            />
            <Slider
              label="What you'd pay a management company"
              min={0}
              max={25}
              step={1}
              value={feePerDoorPerMo}
              onChange={setFeePerDoorPerMo}
              display={`${fmtUsd(feePerDoorPerMo)}/door/mo`}
              hint={`= ${fmtUsd(doors * feePerDoorPerMo)} / month`}
            />
            <Slider
              label="Volunteer hours your board spends weekly"
              min={0}
              max={30}
              step={1}
              value={hoursPerWeek}
              onChange={setHoursPerWeek}
              display={`${hoursPerWeek} hrs / wk`}
              hint="Valued at $50/hr — typical opportunity cost"
            />
          </div>

          <div className="flex flex-col justify-between gap-6 rounded-2xl bg-gradient-to-br from-brand-50 via-white to-ember-50/40 p-6 ring-1 ring-brand-100">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                Annual savings with Ledger
              </p>
              <p className="mt-2 text-5xl font-semibold tracking-tight text-ink-900 md:text-6xl">
                {fmtUsd(Math.max(0, totalSavings))}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <TrendingUp className="h-3.5 w-3.5" />
                Payback in {paybackWeeks} week{paybackWeeks === 1 ? '' : 's'}
              </p>
            </div>

            <dl className="grid gap-2 text-sm">
              <Line label="Management cost (annual)" value={fmtUsd(currentAnnualMgmt)} />
              <Line label="Volunteer hours (annual @ $50/hr)" value={fmtUsd(volunteerHoursAnnualValue)} />
              <Line label="Ledger (annual)" value={`− ${fmtUsd(hhAnnual)}`} />
              <div className="mt-1 flex items-baseline justify-between border-t border-ink-200/70 pt-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-700">
                  Net savings
                </dt>
                <dd className="text-base font-semibold text-ink-900">
                  {fmtUsd(Math.max(0, totalSavings))}
                </dd>
              </div>
            </dl>

            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-ink-800"
            >
              Take this to the board
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-ink-500">
          Estimates only. Management-company fees vary by region and scope.
          Ledger pricing is fixed and published on this page.
        </p>
      </div>
    </section>
  )
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  display,
  hint,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  display: string
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold text-ink-900">{label}</label>
        <span className="font-mono text-sm font-semibold text-brand-700">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'mt-3 h-2 w-full appearance-none rounded-full bg-ink-100 outline-none',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600',
          '[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer',
          '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-brand-600 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer',
        )}
      />
      {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-xs text-ink-600">{label}</dt>
      <dd className="font-mono text-xs font-medium text-ink-800">{value}</dd>
    </div>
  )
}
