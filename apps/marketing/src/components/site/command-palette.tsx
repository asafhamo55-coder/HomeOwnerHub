'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, FileText, Building2, Home, Scale, BookOpen, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react'
import { WORKFLOWS } from '@/lib/workflows'
import { cn } from '@/lib/cn'

interface PaletteItem {
  label: string
  href: string
  category: 'Page' | 'Workflow' | 'Product' | 'Resource'
  hint?: string
  Icon: typeof Search
}

const PAGES: PaletteItem[] = [
  { label: 'HOA Hub', href: '/hoa', category: 'Product', Icon: Building2, hint: 'For volunteer boards' },
  { label: 'PM Hub', href: '/landlords', category: 'Product', Icon: Home, hint: 'For small landlords' },
  { label: 'Eviction Hub', href: '/eviction', category: 'Product', Icon: Scale, hint: 'Attorney-reviewed' },
  { label: 'Pricing', href: '/pricing', category: 'Page', Icon: FileText },
  { label: 'Book a demo', href: '/demo', category: 'Page', Icon: ArrowRight },
  { label: 'Compare to alternatives', href: '/compare', category: 'Page', Icon: FileText, hint: 'vs management cos · Vantaca · DIY' },
  { label: 'Public roadmap', href: '/roadmap', category: 'Page', Icon: FileText },
  { label: 'Case study · Madison Park', href: '/case-studies/madison-park', category: 'Page', Icon: FileText },
  { label: 'About', href: '/about', category: 'Page', Icon: FileText },
  { label: 'Security & audit', href: '/security', category: 'Resource', Icon: ShieldCheck },
  { label: 'AI honesty bars', href: '/honesty-bars', category: 'Resource', Icon: AlertCircle },
  { label: 'Docs', href: '/docs', category: 'Resource', Icon: BookOpen },
  { label: 'Blog', href: '/blog', category: 'Resource', Icon: BookOpen },
  { label: 'Status', href: '/status', category: 'Resource', Icon: ShieldCheck },
]

const WORKFLOW_ITEMS: PaletteItem[] = WORKFLOWS.map((w) => ({
  label: w.name,
  href: `/roadmap`,
  category: 'Workflow' as const,
  hint: `${w.hub} · Bar ${w.bar} · ${w.status}`,
  Icon: Sparkles,
}))

const ALL: PaletteItem[] = [...PAGES, ...WORKFLOW_ITEMS]

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return ALL.slice(0, 12)
    const q = query.toLowerCase()
    return ALL.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.hint?.toLowerCase().includes(q) ?? false) ||
        i.category.toLowerCase().includes(q),
    ).slice(0, 24)
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const item = results[activeIdx]
        if (item) {
          router.push(item.href)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, activeIdx, onClose, router])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink-200/70 px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows, pages, docs…"
            className="w-full bg-transparent py-4 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
          <kbd className="hidden rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-500 sm:inline-block">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-ink-500">
              No matches for "{query}"
            </div>
          )}
          <ul>
            {results.map((r, i) => {
              const isActive = i === activeIdx
              return (
                <li key={`${r.href}-${r.label}`}>
                  <button
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => {
                      router.push(r.href)
                      onClose()
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      isActive ? 'bg-ink-900 text-white' : 'text-ink-800 hover:bg-ink-50',
                    )}
                  >
                    <r.Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isActive ? 'text-white/80' : 'text-ink-400',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.label}</p>
                      {r.hint && (
                        <p
                          className={cn(
                            'truncate text-xs',
                            isActive ? 'text-white/60' : 'text-ink-500',
                          )}
                        >
                          {r.hint}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[10px] uppercase tracking-wider',
                        isActive ? 'text-white/60' : 'text-ink-400',
                      )}
                    >
                      {r.category}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-ink-200/70 bg-ink-50/40 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-500">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  )
}
