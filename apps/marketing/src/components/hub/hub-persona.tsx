'use client'

import { motion } from 'framer-motion'
import { Quote } from 'lucide-react'
import type { HubTheme } from './hub-theme'
import { cn } from '@/lib/cn'

interface HubPersonaProps {
  theme: HubTheme
  eyebrow: string
  title: string
  description: string
  persona: {
    name: string
    role: string
    quote: string
    initials: string
  }
  bullets: { label: string; value: string }[]
}

export function HubPersona({
  theme,
  eyebrow,
  title,
  description,
  persona,
  bullets,
}: HubPersonaProps) {
  return (
    <section className="bg-ink-50/40 py-24 md:py-32">
      <div className="container-page">
        <div className="grid gap-12 md:grid-cols-[1fr,1.1fr] md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            <p className={cn('text-sm font-semibold uppercase tracking-wider', theme.accentText)}>
              {eyebrow}
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              {title}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-500">{description}</p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {bullets.map((b) => (
                <div
                  key={b.label}
                  className="rounded-xl border border-ink-200/70 bg-white p-4"
                >
                  <p className="text-2xl font-semibold tracking-tight text-ink-900">
                    {b.value}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">{b.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-ink-200/70 bg-white p-8 ring-card"
          >
            <Quote className={cn('h-7 w-7', theme.accentText)} />
            <p className="mt-4 text-lg leading-relaxed text-ink-800">
              {persona.quote}
            </p>
            <div className="mt-7 flex items-center gap-3 border-t border-ink-200/70 pt-5">
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white',
                  theme.accentSolid,
                )}
              >
                {persona.initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">{persona.name}</p>
                <p className="text-xs text-ink-500">{persona.role}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
