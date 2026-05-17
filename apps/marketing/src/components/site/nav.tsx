'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu, X, ChevronDown, Search } from 'lucide-react'
import { CommandPalette } from './command-palette'
import { cn } from '@/lib/cn'

const products = [
  {
    href: '/hoa',
    name: 'HOA Hub',
    blurb: 'For volunteer boards. AI does the paperwork.',
    dot: 'bg-emerald-500',
  },
  {
    href: '/landlords',
    name: 'PM Hub',
    blurb: 'For small landlords. Rent runs itself.',
    dot: 'bg-ember-500',
  },
  {
    href: '/eviction',
    name: 'Eviction Hub',
    blurb: 'Guided eviction support, attorney-reviewed.',
    dot: 'bg-violet-500',
  },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-ink-200/60 bg-white/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink-900">
            Ledger
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <div
            className="relative"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <button className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:text-ink-900">
              Products
              <ChevronDown className={cn('h-4 w-4 transition-transform', hover && 'rotate-180')} />
            </button>
            <div
              className={cn(
                'absolute left-1/2 top-full w-[320px] -translate-x-1/2 pt-2 transition-all duration-200',
                hover ? 'visible opacity-100' : 'invisible opacity-0',
              )}
            >
              <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-2 ring-card">
                {products.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-ink-50"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 rounded-full', p.dot)} />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-ink-900">{p.name}</span>
                      <span className="text-xs text-ink-500">{p.blurb}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <NavLink href="/#workflows">Workflows</NavLink>
          <NavLink href="/compare">Compare</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="Open search"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:border-ink-300 hover:text-ink-700"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search…</span>
            <kbd className="hidden rounded border border-ink-200 bg-ink-50 px-1 py-px font-mono text-[10px] text-ink-500 lg:inline-block">
              ⌘K
            </kbd>
          </button>
          <Link
            href="/login"
            className="text-sm font-medium text-ink-700 hover:text-ink-900"
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
          >
            Book a demo
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/demo"
            className="rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Book demo
          </Link>
          <button
            className="rounded-lg p-2 text-ink-700"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-200/60 bg-white/95 backdrop-blur md:hidden">
          <div className="container-page space-y-1 py-4">
            {products.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl p-3 hover:bg-ink-50"
              >
                <span className={cn('h-2 w-2 rounded-full', p.dot)} />
                <span className="text-sm font-medium text-ink-900">{p.name}</span>
              </Link>
            ))}
            <div className="my-2 h-px bg-ink-200" />
            <Link href="/#workflows" onClick={() => setOpen(false)} className="block p-3 text-sm font-medium text-ink-700">
              Workflows
            </Link>
            <Link href="/#case-study" onClick={() => setOpen(false)} className="block p-3 text-sm font-medium text-ink-700">
              Case study
            </Link>
            <Link href="/pricing" onClick={() => setOpen(false)} className="block p-3 text-sm font-medium text-ink-700">
              Pricing
            </Link>
            <Link
              href="/demo"
              onClick={() => setOpen(false)}
              className="mt-2 block rounded-xl bg-ink-900 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Book a demo
            </Link>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:text-ink-900"
    >
      {children}
    </Link>
  )
}

// Concept B letterform mark: capital `L` for Ledger, in a soft-cornered blue
// square. Geometric, flat-cut, 2.8-unit stroke at viewBox scale.
function Logo() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-7 w-7"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="#1D4ED8" />
      <path
        d="M11 7.5v17M11 24.5h12"
        stroke="#ffffff"
        strokeWidth="2.8"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  )
}
