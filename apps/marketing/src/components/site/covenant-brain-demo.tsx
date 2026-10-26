'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Search, BookOpen, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'

const QUERIES = [
  {
    q: 'Can residents paint their fence without approval?',
    citation: 'CC&R Section 3.4 — Architectural Standards',
    answer:
      'No. Section 3.4 of your CC&R requires fence color and material changes to be submitted to the Architectural Review Committee at least 14 days before work begins. Repainting in the original approved color is exempt.',
    chips: ['Sec. 3.4 Architectural', 'ARC review', '14-day notice'],
  },
  {
    q: 'What are the quiet hours?',
    citation: 'CC&R Section 6.2 — Nuisance and Noise',
    answer:
      '10:00 PM to 7:00 AM on weekdays, and 11:00 PM to 8:00 AM on weekends. Section 6.2 of your CC&R prohibits any noise audible beyond the unit during these hours. Repeat violations carry a $50 fine per occurrence.',
    chips: ['Sec. 6.2 Nuisance', '$50 fine', 'Weekend hours'],
  },
  {
    q: 'Can we fine a homeowner for late lawn care?',
    citation: 'Bylaws Section 4.1 + O.C.G.A. § 44-3-223',
    answer:
      'Yes, if your declaration allows fines: Georgia’s POA Act lets an association fine only to the extent its declaration provides, for rules that were given to owners (§ 44-3-223). Bylaws Section 4.1 sets your process: (1) written notice describing the violation, (2) at least 14 days to cure, (3) a chance for a hearing.',
    chips: ['Bylaws Sec. 4.1', '§ 44-3-223', 'Hearing'],
  },
]

export function CovenantBrainDemo() {
  // With "reduce motion" on, skip the typing loop and show the first answer.
  const reduce = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<'typing' | 'thinking' | 'answering' | 'rest'>('typing')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (reduce) {
      setTyped(QUERIES[idx].q)
      setPhase('rest')
      return
    }
    const current = QUERIES[idx]
    const target = current.q
    if (phase === 'typing') {
      if (typed.length < target.length) {
        timer.current = setTimeout(() => setTyped(target.slice(0, typed.length + 1)), 28)
      } else {
        timer.current = setTimeout(() => setPhase('thinking'), 400)
      }
    } else if (phase === 'thinking') {
      timer.current = setTimeout(() => setPhase('answering'), 900)
    } else if (phase === 'answering') {
      timer.current = setTimeout(() => setPhase('rest'), 4200)
    } else if (phase === 'rest') {
      timer.current = setTimeout(() => {
        setTyped('')
        setIdx((i) => (i + 1) % QUERIES.length)
        setPhase('typing')
      }, 1200)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [idx, typed, phase, reduce])

  const current = QUERIES[idx]

  return (
    <div className="grid gap-0 md:grid-cols-[1fr,1.15fr]">
      {/* Left: prompt panel */}
      <div className="border-b border-border/70 bg-subtle/30 p-6 md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <Sparkles className="h-3 w-3 text-accent-fg" />
          Ask anything about your covenants
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-3 ring-soft">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-h-[1.5rem] text-sm text-foreground">
              {typed}
              <span className="ml-0.5 inline-block h-4 w-[2px] -translate-y-[1px] bg-foreground align-middle animate-blink" />
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Try one
          </p>
          {QUERIES.map((q, i) => (
            <button
              key={q.q}
              aria-pressed={i === idx}
              onClick={() => {
                setIdx(i)
                setTyped('')
                setPhase('typing')
              }}
              className={cn(
                'block w-full rounded-lg border px-3 py-2 text-left text-xs transition-all',
                i === idx
                  ? 'border-primary/25 bg-primary-subtle text-primary'
                  : 'border-border bg-surface text-foreground-secondary hover:border-border-strong',
              )}
            >
              {q.q}
            </button>
          ))}
        </div>
      </div>

      {/* Right: answer panel */}
      <div className="relative min-h-[360px] bg-surface p-6">
        <AnimatePresence mode="wait">
          {phase === 'thinking' && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col gap-3 p-6"
            >
              <ThinkingLine label="Reading CC&R..." />
              <ThinkingLine label="Matching covenant rules..." delay={0.2} />
              <ThinkingLine label="Composing answer with citations..." delay={0.4} />
            </motion.div>
          )}
          {(phase === 'answering' || phase === 'rest') && (
            <motion.div
              key={`answer-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-fg">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold text-foreground-secondary">Covenant Brain</span>
                <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium text-foreground-secondary ring-1 ring-border">
                  <BookOpen className="h-3 w-3" />
                  {current.citation}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{current.answer}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {current.chips.map((c) => (
                  <span
                    key={c}
                    className="rounded-md bg-primary-subtle px-2 py-1 text-[11px] font-medium text-primary ring-1 ring-primary/15"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-subtle/40 px-3 py-2">
                <span className="text-[11px] text-muted">
                  Source: sample community · CC&amp;R and bylaws
                </span>
                <span className="text-[11px] font-medium text-foreground-secondary">View in document →</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function ThinkingLine({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-2 text-xs text-muted"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      {label}
    </motion.div>
  )
}
