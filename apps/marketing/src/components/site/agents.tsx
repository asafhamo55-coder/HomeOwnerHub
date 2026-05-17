'use client'

import { motion } from 'framer-motion'
import { BookOpen, FileText, Calendar, PiggyBank, MessageSquare, Wallet, Globe, Scale } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

// Personified AI agents — each workflow rendered as a "team member" the
// volunteer board (or landlord) gets to delegate to. The pattern is closer
// to Haven AI's "Maintenance Agent" than to a generic feature grid.

interface Agent {
  name: string
  role: string
  Icon: LucideIcon
  /** Outer gradient ring color pair (tailwind classes). */
  ring: string
  /** Inner fill swatch. */
  fill: string
  /** Subtle activity dot color. */
  pulse: string
  bar: 'C' | 'B' | 'A'
  blurb: string
}

const AGENTS: Agent[] = [
  {
    name: 'Covenant Brain',
    role: 'Rule librarian',
    Icon: BookOpen,
    ring: 'from-brand-400 to-brand-700',
    fill: 'bg-brand-50',
    pulse: 'bg-emerald-500',
    bar: 'C',
    blurb: 'Answers any rule question in 4s, cited to the CC&R section.',
  },
  {
    name: 'Violation Drafter',
    role: 'Notice writer',
    Icon: FileText,
    ring: 'from-emerald-400 to-emerald-700',
    fill: 'bg-emerald-50',
    pulse: 'bg-amber-500',
    bar: 'B',
    blurb: 'Photo + caption in. Legally formatted notice out. Board approves.',
  },
  {
    name: 'Minutes Engine',
    role: 'Meeting scribe',
    Icon: Calendar,
    ring: 'from-violet-400 to-violet-700',
    fill: 'bg-violet-50',
    pulse: 'bg-amber-500',
    bar: 'B',
    blurb: 'Records the meeting. Drafts board-ready minutes the night of.',
  },
  {
    name: 'Reserve Live',
    role: 'Fund watcher',
    Icon: PiggyBank,
    ring: 'from-ember-400 to-ember-700',
    fill: 'bg-ember-50',
    pulse: 'bg-amber-500',
    bar: 'B',
    blurb: 'Real-time reserve projection. Flags variance before it hurts.',
  },
  {
    name: 'Delinquency Coach',
    role: 'Late-rent diplomat',
    Icon: Wallet,
    ring: 'from-amber-400 to-amber-700',
    fill: 'bg-amber-50',
    pulse: 'bg-amber-500',
    bar: 'B',
    blurb: 'Reads tenant history. Suggests check-in, not escalation, first.',
  },
  {
    name: 'Multilingual Comms',
    role: 'Translator',
    Icon: Globe,
    ring: 'from-cyan-400 to-brand-600',
    fill: 'bg-cyan-50',
    pulse: 'bg-emerald-500',
    bar: 'C',
    blurb: 'Every outbound message auto-translated to recipient preference.',
  },
  {
    name: 'Resident Portal',
    role: 'Front desk',
    Icon: MessageSquare,
    ring: 'from-pink-400 to-rose-600',
    fill: 'bg-rose-50',
    pulse: 'bg-emerald-500',
    bar: 'C',
    blurb: 'Residents ask the AI before they email the board.',
  },
  {
    name: 'Court Filing',
    role: 'Eviction template',
    Icon: Scale,
    ring: 'from-slate-400 to-slate-700',
    fill: 'bg-slate-50',
    pulse: 'bg-slate-400',
    bar: 'A',
    blurb: 'County-correct templates. Demo only — your attorney files.',
  },
]

const barChip: Record<'C' | 'B' | 'A', string> = {
  C: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  B: 'bg-amber-50 text-amber-700 ring-amber-100',
  A: 'bg-slate-50 text-slate-700 ring-slate-200',
}

export function Agents() {
  return (
    <section className="border-y border-ink-200/60 bg-ink-50/30 py-24 md:py-28">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12 md:mb-16">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Meet the agents
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Eight AI workers your board gets to delegate to.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-500 md:mt-0">
            Each agent does one job. Each ships with a Bar A/B/C label so you
            know what it can do unsupervised. Together they replace what
            volunteers shouldn't have to do.
          </p>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((a, i) => (
            <motion.li
              key={a.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
              className="rounded-2xl border border-ink-200/70 bg-white p-5 transition-colors hover:border-ink-300"
            >
              <div className="flex items-start justify-between">
                <AgentAvatar agent={a} />
                <span
                  className={cn(
                    'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1',
                    barChip[a.bar],
                  )}
                >
                  Bar {a.bar}
                </span>
              </div>
              <div className="mt-5">
                <p className="text-base font-semibold tracking-tight text-ink-900">
                  {a.name}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
                  {a.role}
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{a.blurb}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// Flat icon tile + status dot. Per the visual audit: 8 different gradient
// rings was the biggest color-discipline leak on the site; flat tiles let
// the Bar chip do the categorical work and feel Anthropic/Cursor.
export function AgentAvatar({ agent }: { agent: Agent }) {
  const Icon = agent.Icon
  return (
    <div className="relative">
      <div
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-ink-200',
          agent.fill,
        )}
      >
        <Icon className="h-5 w-5 text-ink-900" />
      </div>
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-white',
          agent.pulse,
        )}
      >
        <span className={cn('h-1.5 w-1.5 animate-pulse-soft rounded-full', agent.pulse)} />
      </span>
    </div>
  )
}
