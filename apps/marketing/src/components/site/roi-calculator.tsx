'use client'

import { useId, useMemo, useState } from 'react'
import { Calculator, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { annualBillUsd, monthlyBillUsd } from '@/lib/hoa-pricing'

// The plan price comes from lib/hoa-pricing.ts, pinned to checkout (BL-042).
// Everything else is the board's own estimate, entered with the sliders and
// labelled as such on the page. Nothing here is a measured result.

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function RoiCalculator() {
  const [doors, setDoors] = useState(150)
  const [replacedPerDoor, setReplacedPerDoor] = useState(3)
  const [hoursPerWeek, setHoursPerWeek] = useState(6)
  const [valuePerHour, setValuePerHour] = useState(25)
  const [pctSaved, setPctSaved] = useState(30)

  const r = useMemo(() => {
    const plan = annualBillUsd(doors)
    const planMonthly = monthlyBillUsd(doors)
    const replaced = doors * replacedPerDoor * 12
    const hoursValue = hoursPerWeek * 52 * valuePerHour * (pctSaved / 100)
    const net = replaced + hoursValue - plan
    return { plan, planMonthly, replaced, hoursValue, net, hoursBack: Math.round(hoursPerWeek * 52 * (pctSaved / 100)) }
  }, [doors, replacedPerDoor, hoursPerWeek, valuePerHour, pctSaved])

  return (
    <section className="section-warm section scroll-mt-20" id="roi" aria-labelledby="roi-h">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">
            <Calculator className="h-4 w-4" aria-hidden />
            Estimate calculator
          </p>
          <h2 id="roi-h" className="t-h2 mt-4 text-foreground">
            Numbers to take to the board.
          </h2>
          <p className="t-lead mt-4">
            Set each slider to your own situation. Only the plan price is fixed. The rest is your estimate.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 rounded-3xl border border-border bg-surface p-6 ring-card md:grid-cols-[1.15fr,1fr] md:p-10">
          <div className="space-y-8">
            <Slider label="Homes in your community" min={10} max={500} step={5} value={doors} onChange={setDoors} display={`${doors}`} hint={`HomeownerHub plan: ${fmtUsd(r.planMonthly)} a month, ${fmtUsd(r.plan)} paid yearly.`} />
            <Slider label="Cost today that HomeownerHub would replace" min={0} max={15} step={1} value={replacedPerDoor} onChange={setReplacedPerDoor} display={`${fmtUsd(replacedPerDoor)} per home a month`} hint={`Bookkeeping, mailing or software. About ${fmtUsd(doors * replacedPerDoor)} a month. Set to $0 if none.`} />
            <Slider label="Board volunteer hours on admin" min={0} max={30} step={1} value={hoursPerWeek} onChange={setHoursPerWeek} display={`${hoursPerWeek} hours a week`} />
            <Slider label="Share of those hours it could save" min={0} max={80} step={5} value={pctSaved} onChange={setPctSaved} display={`${pctSaved}%`} hint="Our assumption, not a measured result. Lower it if you are unsure." />
            <Slider label="What an hour of your time is worth" min={0} max={100} step={5} value={valuePerHour} onChange={setValuePerHour} display={`${fmtUsd(valuePerHour)} an hour`} hint="Your estimate. Volunteers are unpaid, so $0 is a fair answer too." />
          </div>

          <div className="flex flex-col justify-between gap-6 rounded-2xl bg-primary-subtle p-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">Estimated yearly difference</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight text-foreground tabular-nums" aria-live="polite">
                {r.net >= 0 ? fmtUsd(r.net) : `${fmtUsd(-r.net)} more`}
              </p>
              <p className="mt-2 text-base text-foreground-secondary">
                {r.net >= 0
                  ? `About ${r.hoursBack} volunteer hours a year back as well.`
                  : 'On these inputs the plan costs more than it saves in money. Adjust the sliders to match your board.'}
              </p>
            </div>
            <dl className="space-y-2 text-base">
              <Line label="Costs it replaces" value={fmtUsd(r.replaced)} />
              <Line label="Time saved, valued" value={fmtUsd(r.hoursValue)} />
              <Line label="HomeownerHub, paid yearly" value={`- ${fmtUsd(r.plan)}`} />
              <div className="flex items-baseline justify-between border-t border-border-strong pt-3 font-semibold text-foreground">
                <dt>Estimated difference</dt>
                <dd className="tabular-nums">{r.net >= 0 ? fmtUsd(r.net) : `- ${fmtUsd(-r.net)}`}</dd>
              </div>
            </dl>
            <Link href="/demo" className="btn btn-primary">
              Take this to the board
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-base text-muted">
          This is an estimate built from the numbers you enter, not a promise or a measured result. Your costs and
          hours will differ.
        </p>
      </div>
    </section>
  )
}

function Slider({
  label, min, max, step, value, onChange, display, hint,
}: {
  label: string; min: number; max: number; step: number; value: number
  onChange: (v: number) => void; display: string; hint?: string
}) {
  const id = useId()
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <label htmlFor={id} className="text-base font-semibold text-foreground">{label}</label>
        <span className="text-base font-semibold text-primary tabular-nums">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={display}
        className="mt-2 h-11 w-full cursor-pointer accent-[#2563eb]"
      />
      {hint && <p className="text-base text-muted">{hint}</p>}
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-foreground-secondary">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
