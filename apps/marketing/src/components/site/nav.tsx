'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Menu, X, ChevronDown, Search, ArrowRight } from 'lucide-react'
import { CommandPalette } from './command-palette'
import { cn } from '@/lib/cn'
import { isOfferedHref } from '@/lib/hubs'
import { Logo, SIGN_IN_URL } from './brand'


const allProducts = [
  {
    href: '/hoa',
    name: 'HOA Hub',
    blurb: 'For volunteer boards. AI does the paperwork.',
    dot: 'bg-primary',
  },
  {
    href: '/landlords',
    name: 'PM Hub',
    blurb: 'For small landlords. Rent runs itself.',
    dot: 'bg-pm',
  },
  {
    href: '/eviction',
    name: 'Eviction Hub',
    blurb: 'Guided eviction support, attorney-reviewed.',
    dot: 'bg-eviction',
  },
]

// BL-097: PM and Eviction are not offered right now.
const products = allProducts.filter((p) => isOfferedHref(p.href))

const links = [
  { href: '/#workflows', label: 'Workflows' },
  { href: '/compare', label: 'Compare' },
  { href: '/pricing', label: 'Pricing' },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const productsRef = useRef<HTMLDivElement>(null)

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
      if (e.key === 'Escape') {
        setProductsOpen(false)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lock page scroll behind the open mobile menu.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const solid = scrolled || open

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-base',
        solid
          ? 'border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="HomeownerHub home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
          <div
            ref={productsRef}
            className="relative"
            onMouseEnter={() => setProductsOpen(true)}
            onMouseLeave={() => setProductsOpen(false)}
            onBlur={(e) => {
              if (!productsRef.current?.contains(e.relatedTarget as Node)) setProductsOpen(false)
            }}
          >
            <button
              type="button"
              aria-expanded={productsOpen}
              aria-controls="nav-products"
              onClick={() => setProductsOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-subtle hover:text-foreground"
            >
              Products
              <ChevronDown
                aria-hidden
                className={cn('h-4 w-4 text-muted transition-transform duration-base', productsOpen && 'rotate-180')}
              />
            </button>
            <div
              id="nav-products"
              className={cn(
                'absolute left-1/2 top-full w-[340px] -translate-x-1/2 pt-2 transition-[opacity,transform] duration-base',
                productsOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0',
              )}
            >
              <div className="overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-lg">
                {products.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    onClick={() => setProductsOpen(false)}
                    className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-subtle"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', p.dot)} aria-hidden />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">{p.name}</span>
                      <span className="text-[13px] leading-snug text-muted">{p.blurb}</span>
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {links.map((l) => (
            <NavLink key={l.href} href={l.href}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search the site"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-muted shadow-xs transition-colors hover:border-border-strong hover:text-foreground-secondary"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden lg:inline">Search…</span>
            <kbd className="hidden rounded border border-border bg-subtle px-1 py-px font-mono text-[10px] text-muted lg:inline-block">
              ⌘K
            </kbd>
          </button>
          <a
            href={SIGN_IN_URL}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground-secondary transition-colors hover:bg-subtle hover:text-foreground"
          >
            Sign in
          </a>
          <Link
            href="/demo"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg shadow-xs transition-colors hover:bg-primary-hover"
          >
            Book a demo
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <a
            href={SIGN_IN_URL}
            className="inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-medium text-foreground-secondary hover:text-foreground"
          >
            Sign in
          </a>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground-secondary hover:bg-subtle hover:text-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-background md:hidden"
        >
          <nav aria-label="Mobile" className="container-page flex flex-col gap-1 py-4">
            <p className="px-3 pb-1 pt-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Products
            </p>
            {products.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 rounded-xl p-3 hover:bg-subtle"
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', p.dot)} aria-hidden />
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-foreground">{p.name}</span>
                  <span className="text-sm text-muted">{p.blurb}</span>
                </span>
              </Link>
            ))}
            <div className="my-3 h-px bg-border" />
            {[...links, { href: '/case-studies/madison-park', label: 'Case study' }].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-medium text-foreground hover:bg-subtle"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-4 grid gap-2">
              <Link
                href="/demo"
                onClick={() => setOpen(false)}
                className="block rounded-xl bg-primary px-4 py-3 text-center text-base font-semibold text-primary-fg hover:bg-primary-hover"
              >
                Book a demo
              </Link>
              <a
                href={SIGN_IN_URL}
                className="block rounded-xl border border-border-strong bg-surface px-4 py-3 text-center text-base font-semibold text-foreground hover:bg-subtle"
              >
                Sign in
              </a>
            </div>
          </nav>
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
      className="rounded-lg px-3 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-subtle hover:text-foreground"
    >
      {children}
    </Link>
  )
}

