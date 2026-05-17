'use client'

import { motion } from 'framer-motion'
import type { HubTheme } from './hub-theme'
import { HUB_ICONS, type HubIconKey } from './hub-icons'
import { cn } from '@/lib/cn'

interface Feature {
  icon: HubIconKey
  title: string
  bar: 'C' | 'B' | 'A'
  body: string
}

interface HubFeaturesProps {
  theme: HubTheme
  eyebrow: string
  title: string
  description: string
  features: Feature[]
}

const barStyle = {
  C: { label: 'Production', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  B: { label: 'Human-reviewed', cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  A: { label: 'Demo only', cls: 'bg-slate-50 text-slate-700 ring-slate-200' },
}

export function HubFeatures({
  theme,
  eyebrow,
  title,
  description,
  features,
}: HubFeaturesProps) {
  return (
    <section className="py-20 md:py-28">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12 md:mb-16">
          <div className="max-w-xl">
            <p className={cn('font-mono text-[11px] font-semibold uppercase tracking-[0.18em]', theme.accentText)}>
              {eyebrow}
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              {title}
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-500 md:mt-0">{description}</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = HUB_ICONS[f.icon]
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
                className="rounded-2xl border border-ink-200/70 bg-white p-6 transition-colors hover:border-ink-300"
              >
                <div className="flex items-start justify-between">
                  <div
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-xl',
                      theme.accentBg,
                      theme.accentText,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1',
                      barStyle[f.bar].cls,
                    )}
                  >
                    Bar {f.bar}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.body}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
