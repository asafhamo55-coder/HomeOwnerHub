'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Phone, AlertCircle, TrendingUp } from 'lucide-react'

export function PmRentVisual() {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-1.5 border-b border-ink-200/70 pb-3">
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="h-2 w-2 rounded-full bg-ink-200" />
        <span className="ml-3 text-[10px] text-ink-400">PM Hub · This month</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-ember-50 px-1.5 py-0.5 text-[9px] font-semibold text-ember-700 ring-1 ring-ember-100">
          <TrendingUp className="h-2.5 w-2.5" />
          $4,200 collected
        </span>
      </div>

      <div className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Your rentals</p>

        <div className="mt-3 space-y-2">
          <Unit delay={0} address="215 Oak St #1" tenant="Alex J." rent="$1,050" status="paid" dueDate="Paid Mar 2" />
          <Unit delay={0.1} address="215 Oak St #2" tenant="Jordan M." rent="$950" status="paid" dueDate="Paid Mar 2" />
          <Unit delay={0.2} address="412 Elm Ave" tenant="Casey P." rent="$1,100" status="paid" dueDate="Paid Mar 1" />
          <Unit delay={0.3} address="88 Ridge Rd" tenant="Riley T." rent="$1,100" status="late" dueDate="5 days late" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="mt-4 rounded-xl border border-ember-200 bg-ember-50/40 p-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ember-700">
            Delinquency Coach
          </p>
          <p className="mt-1 text-[12px] leading-snug text-ink-700">
            Riley has paid on-time 14 months running. First late payment — likely temporary. Suggest a check-in call before escalating.
          </p>
          <button className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-ink-800 ring-1 ring-ink-200">
            <Phone className="h-2.5 w-2.5" />
            Call Riley
          </button>
        </motion.div>
      </div>
    </div>
  )
}

function Unit({
  address,
  tenant,
  rent,
  status,
  dueDate,
  delay,
}: {
  address: string
  tenant: string
  rent: string
  status: 'paid' | 'late'
  dueDate: string
  delay: number
}) {
  const paid = status === 'paid'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + delay, duration: 0.4 }}
      className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-2.5"
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          paid ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
        }`}
      >
        {paid ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[12px] font-semibold text-ink-900">{address}</p>
        <p className="truncate text-[11px] text-ink-500">
          {tenant} · {rent}
        </p>
      </div>
      <span
        className={`text-[10px] font-medium ${paid ? 'text-emerald-700' : 'text-rose-700'}`}
      >
        {dueDate}
      </span>
    </motion.div>
  )
}
