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
  C: { label: 'Production', cls: 'bg-success-subtle text-success ring-success/15' },
  B: { label: 'Human-reviewed', cls: 'bg-warning-subtle text-warning ring-warning/15' },
  A: { label: 'Demo only', cls: 'bg-subtle text-foreground-secondary ring-border' },
}

export function HubFeatures({
  theme,
  eyebrow,
  title,
  description,
  features,
}: HubFeaturesProps) {
  return (
    <section className="section">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12 md:mb-16">
          <div className="max-w-xl">
            <p className={cn('eyebrow', theme.accentText)}>
              {eyebrow}
            </p>
            <h2 className="t-h2 mt-4 text-foreground">
              {title}
            </h2>
          </div>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-foreground-secondary md:mt-0">{description}</p>
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
                className="card card-hover p-6 md:p-7"
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
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1',
                      barStyle[f.bar].cls,
                    )}
                  >
                    Bar {f.bar}
                  </span>
                </div>
                <h3 className="t-h3 mt-6 text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-foreground-secondary">{f.body}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
