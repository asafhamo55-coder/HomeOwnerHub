'use client'

import { motion } from 'framer-motion'
import { BookOpen, FileText, Calendar, Receipt, MessageSquare, ClipboardCheck, Mail, Languages } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

// Personified AI agents — each workflow rendered as a "team member" the
// volunteer board gets to delegate to. The pattern is closer to Haven AI's
// "Maintenance Agent" than to a generic feature grid.
//
// Truth rule (BL-090): every agent here is a shipped HOA workflow in
// lib/workflows.ts. The unbuilt Delinquency Coach (PM) and Court Filing
// (Eviction) cards were replaced by AI ARC review and Spanish announcements.

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
    ring: 'from-primary to-primary',
    fill: 'bg-primary-subtle',
    pulse: 'bg-success-solid',
    bar: 'C',
    blurb: 'Answers any rule question in seconds, cited to the CC&R section.',
  },
  {
    name: 'Violation Drafter',
    role: 'Notice writer',
    Icon: FileText,
    ring: 'from-success-solid to-success-solid',
    fill: 'bg-success-subtle',
    pulse: 'bg-warning-solid',
    bar: 'B',
    blurb: 'Photo + caption in. Drafted letter out, rule cited. Board approves.',
  },
  {
    name: 'Minutes Drafter',
    role: 'Meeting scribe',
    Icon: Calendar,
    ring: 'from-eviction to-eviction',
    fill: 'bg-eviction-subtle',
    pulse: 'bg-warning-solid',
    bar: 'B',
    blurb: 'Turns your meeting transcript into board-ready minutes to approve.',
  },
  {
    name: 'Bill Scanner',
    role: 'Bookkeeper',
    Icon: Receipt,
    ring: 'from-accent to-accent',
    fill: 'bg-accent-subtle',
    pulse: 'bg-warning-solid',
    bar: 'B',
    blurb: 'Reads a vendor bill into Approvals. Nothing is entered until the board approves.',
  },
  {
    name: 'ARC Reviewer',
    role: 'Committee aide',
    Icon: ClipboardCheck,
    ring: 'from-warning-solid to-warning-solid',
    fill: 'bg-warning-subtle',
    pulse: 'bg-warning-solid',
    bar: 'B',
    blurb: 'Checks an ARC request and its photos against your guidelines and drafts the letter. The board decides.',
  },
  {
    name: 'Inbox Drafter',
    role: 'Correspondent',
    Icon: Mail,
    ring: 'from-info-solid to-primary',
    fill: 'bg-info-subtle',
    pulse: 'bg-warning-solid',
    bar: 'B',
    blurb: 'Drafts replies in your shared HOA inbox. A person edits and sends.',
  },
  {
    name: 'Resident Portal',
    role: 'Front desk',
    Icon: MessageSquare,
    ring: 'from-danger-solid to-danger-solid',
    fill: 'bg-danger-subtle',
    pulse: 'bg-success-solid',
    bar: 'C',
    blurb: 'Residents ask the AI before they email the board.',
  },
  {
    name: 'Translator',
    role: 'Spanish version',
    Icon: Languages,
    ring: 'from-muted to-foreground/90',
    fill: 'bg-subtle',
    pulse: 'bg-warning-solid',
    bar: 'B',
    blurb: 'Drafts a Spanish version of an announcement. The board reads and confirms it before sending.',
  },
]

const barChip: Record<'C' | 'B' | 'A', string> = {
  C: 'bg-success-subtle text-success ring-success/15',
  B: 'bg-warning-subtle text-warning ring-warning/15',
  A: 'bg-subtle text-foreground-secondary ring-border',
}

export function Agents() {
  return (
    <section className="border-y border-border/60 bg-subtle/30 py-24 md:py-28">
      <div className="container-page">
        <header className="mb-12 md:flex md:items-end md:justify-between md:gap-12 md:mb-16">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Meet the agents
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Eight AI workers your board gets to delegate to.
            </h2>
          </div>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted md:mt-0">
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
              className="rounded-2xl border border-border/70 bg-surface p-5 transition-colors hover:border-border-strong"
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
                <p className="text-base font-semibold tracking-tight text-foreground">
                  {a.name}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                  {a.role}
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground-secondary">{a.blurb}</p>
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
          'flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-border',
          agent.fill,
        )}
      >
        <Icon className="h-5 w-5 text-foreground" />
      </div>
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-surface',
          agent.pulse,
        )}
      >
        <span className={cn('h-1.5 w-1.5 animate-pulse-soft rounded-full', agent.pulse)} />
      </span>
    </div>
  )
}
