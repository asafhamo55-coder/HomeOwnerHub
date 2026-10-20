'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react'
import { CovenantBrainDemo } from './covenant-brain-demo'
import { PHOTOS } from '@/lib/photos'
import { SHIPPED_HOA_WORKFLOWS } from '@/lib/workflows'

const heroBgUrl = `${PHOTOS.suburbanAerial.src}?w=2400&q=80&auto=format&fit=crop`

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-24 md:pb-20 md:pt-28">
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
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Built with Madison Park HOA
            </p>

            <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.02em] text-foreground md:text-[52px] lg:text-[60px]">
              AI that runs the paperwork. The board still runs the HOA.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground-secondary">
              Ask any rule question and get the answer with the CC&amp;R
              section cited. Approve violation letters and scanned bills in
              one click, and draft announcements from a sentence. Nothing is
              sent, filed or entered until the board approves.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/demo"
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
              >
                Book a demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="#demo"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-secondary underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                or watch it answer a CC&amp;R question
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <p className="mt-4 text-xs text-muted">
              Six-month free pilot · No auto-conversion · No data migration
            </p>

            <dl className="mt-10 grid max-w-md grid-cols-3 divide-x divide-border border-t border-border/80 pt-6">
              <Stat value={String(SHIPPED_HOA_WORKFLOWS.length)} label="AI workflows live" />
              <Stat value="Cited" label="Every document answer" />
              <Stat value="Self-serve" label="Setup + roster import" />
            </dl>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
            id="demo"
          >
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface ring-hero">
              <div className="flex items-center gap-1.5 border-b border-border/70 bg-subtle/60 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <div className="ml-3 flex items-center gap-2 rounded-md bg-surface px-2.5 py-1 text-xs text-muted ring-1 ring-border/70">
                  <FileText className="h-3 w-3" />
                  <span className="font-mono">app.homeownerledger.com/ai/ask</span>
                </div>
                <span className="ml-auto hidden items-center gap-1 rounded-md bg-success-subtle px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-success ring-1 ring-success/15 sm:inline-flex">
                  <ShieldCheck className="h-3 w-3" />
                  Bar C
                </span>
              </div>

              <CovenantBrainDemo />
            </div>

            <p className="mt-4 text-xs text-muted">
              Every answer cited back to the document. Audit-logged. If your documents don&apos;t cover it, it says so.
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
      <dt className="num text-[26px] font-semibold tracking-tight text-foreground">
        {value}
      </dt>
      <dd className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
        {label}
      </dd>
    </div>
  )
}
