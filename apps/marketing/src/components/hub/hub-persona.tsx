'use client'

import { motion } from 'framer-motion'
import { Check, Quote } from 'lucide-react'
import type { HubTheme } from './hub-theme'
import { cn } from '@/lib/cn'

interface HubPersonaProps {
  theme: HubTheme
  eyebrow: string
  title: string
  description: string
  /** A verified, attributable quote. Omit it and pass `facts` instead. */
  persona?: {
    name: string
    role: string
    quote: string
    initials: string
  }
  /** Product facts shown in place of a quote when there is no verified one. */
  facts?: { title: string; items: string[] }
  bullets: { label: string; value: string }[]
}

export function HubPersona({
  theme,
  eyebrow,
  title,
  description,
  persona,
  facts,
  bullets,
}: HubPersonaProps) {
  return (
    <section className="section bg-subtle/60">
      <div className="container-page">
        <div className="grid gap-12 md:grid-cols-[1fr,1.1fr] md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            <p className={cn('eyebrow', theme.accentText)}>
              {eyebrow}
            </p>
            <h2 className="t-h2 mt-4 text-foreground">
              {title}
            </h2>
            <p className="t-lead mt-5">{description}</p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {bullets.map((b) => (
                <div
                  key={b.label}
                  className="rounded-xl border border-border/70 bg-surface p-4"
                >
                  <p className="text-2xl font-semibold tracking-tight text-foreground">
                    {b.value}
                  </p>
                  <p className="mt-1 text-xs text-muted">{b.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="card p-8 md:p-10"
          >
            {persona ? (
              <>
                <Quote className={cn('h-7 w-7', theme.accentText)} />
                <p className="mt-4 text-lg leading-relaxed text-foreground">
                  {persona.quote}
                </p>
                <div className="mt-7 flex items-center gap-3 border-t border-border/70 pt-5">
                  <div
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-primary-fg',
                      theme.accentSolid,
                    )}
                  >
                    {persona.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{persona.name}</p>
                    <p className="text-xs text-muted">{persona.role}</p>
                  </div>
                </div>
              </>
            ) : facts ? (
              <>
                <p className="text-sm font-semibold text-foreground">{facts.title}</p>
                <ul className="mt-5 space-y-3">
                  {facts.items.map((item) => (
                    <li key={item} className="flex gap-3 text-base leading-relaxed text-foreground-secondary">
                      <Check className={cn('mt-1 h-4 w-4 shrink-0', theme.accentText)} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
