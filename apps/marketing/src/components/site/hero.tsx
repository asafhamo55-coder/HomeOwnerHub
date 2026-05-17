'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react'
import { CovenantBrainDemo } from './covenant-brain-demo'
import { PHOTOS } from '@/lib/photos'

const heroBgUrl = `${PHOTOS.suburbanAerial.src}?w=2400&q=80&auto=format&fit=crop`

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 md:pt-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[600px] [mask-image:linear-gradient(to_bottom,black_0%,black_50%,transparent_100%)]">
        <Image
          src={heroBgUrl}
          alt={PHOTOS.suburbanAerial.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-[0.08]"
        />
      </div>

      <div className="container-page pt-10 md:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid items-center gap-12 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:gap-16"
        >
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Built with Madison Park HOA · 180 doors
            </p>

            <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.02em] text-ink-900 md:text-[52px] lg:text-[60px]">
              AI that runs the paperwork. The board still runs the HOA.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-600">
              Ask any rule question — get the answer in 4 seconds with the
              CC&amp;R section cited. Approve notices, minutes, and reserve
              updates in one tap.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/demo"
                className="group inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-ink-800"
              >
                Book a demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="#demo"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 underline-offset-4 transition-colors hover:text-ink-900 hover:underline"
              >
                or watch it answer a CC&amp;R question
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <p className="mt-4 text-xs text-ink-500">
              Six-month free pilot · No auto-conversion · No data migration · Cancel anytime
            </p>

            <dl className="mt-10 grid max-w-md grid-cols-3 divide-x divide-ink-200 border-t border-ink-200/80 pt-6">
              <Stat value="17" label="AI workflows" />
              <Stat value="<1%" label="Hallucination" />
              <Stat value="15 min" label="Onboarding" />
            </dl>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
            id="demo"
          >
            <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white ring-hero">
              <div className="flex items-center gap-1.5 border-b border-ink-200/70 bg-ink-50/60 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
                <div className="ml-3 flex items-center gap-2 rounded-md bg-white px-2.5 py-1 text-xs text-ink-500 ring-1 ring-ink-200/70">
                  <FileText className="h-3 w-3" />
                  <span className="font-mono">app.ledger.ai/covenant-brain</span>
                </div>
                <span className="ml-auto hidden items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100 sm:inline-flex">
                  <ShieldCheck className="h-3 w-3" />
                  Bar C
                </span>
              </div>

              <CovenantBrainDemo />
            </div>

            <p className="mt-4 text-xs text-ink-500">
              Every answer cited back to the document. Audit-logged. No hallucinations.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-4 first:pl-0 last:pr-0">
      <dt className="font-mono text-[22px] font-semibold tracking-tight text-ink-900">
        {value}
      </dt>
      <dd className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">
        {label}
      </dd>
    </div>
  )
}
