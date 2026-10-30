'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Menu, X, ChevronDown, Search, ArrowRight } from 'lucide-react'
import { CommandPalette } from './command-palette'
import { cn } from '@/lib/cn'
import { HOA_PRODUCT_NAME, isOfferedHref } from '@/lib/hubs'
import { Logo, SIGN_IN_URL } from './brand'
import { TrackedLink } from './tracked-link'

const allProducts = [
  {
    href: '/hoa',
    name: HOA_PRODUCT_NAME,
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
// With a single product the "Products" menu would hold one link, so the
// product itself becomes a plain nav link instead.
const productMenu = products.length > 1

const links = [
  ...(productMenu ? [] : [{ href: '/hoa', label: 'Features' }]),
  { href: '/states', label: 'State laws' },
  { href: '/compare', label: 'Compare' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
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
    <>
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b bg-surface/95 backdrop-blur-lg print:hidden transition-[border-color,box-shadow] duration-200',
        solid
          ? 'border-border shadow-[0_10px_30px_-22px_hsl(var(--foreground)/0.3)]'
          : 'border-transparent',
      )}
    >
      <div className="util-bar" data-hidden={scrolled ? 'true' : 'false'}>
        <div className="container-page flex h-full items-center justify-end gap-5 text-[13px] text-foreground-secondary">
          {[
            { href: '/security', label: 'Security' },
            { href: '/docs', label: 'Docs' },
            { href: '/roadmap', label: 'Roadmap' },
            { href: '/status', label: 'Status' },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-8 items-center transition-colors hover:text-foreground hover:underline">
              {l.label}
            </Link>
          ))}
          <a href={SIGN_IN_URL} className="font-medium text-foreground hover:underline">
            Sign in
          </a>
        </div>
      </div>
      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-[72px]">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="HomeownerHub home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {productMenu && (
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
                className="flex items-center gap-1 rounded-full px-3.5 py-2 text-[15px] font-medium text-foreground transition-colors hover:bg-subtle"
              >
                Products
                <ChevronDown
                  aria-hidden
                  className={cn('h-4 w-4 text-muted transition-transform duration-200', productsOpen && 'rotate-180')}
                />
              </button>
              <div
                id="nav-products"
                className={cn(
                  'absolute left-1/2 top-full w-[340px] -translate-x-1/2 pt-2 transition-[opacity,transform] duration-200',
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
          )}

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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-foreground lg:w-auto lg:gap-2 lg:border lg:border-border lg:bg-surface lg:px-3"
          >
            <Search className="h-4 w-4" aria-hidden />
            <kbd className="hidden rounded border border-border bg-subtle px-1 py-px font-sans text-[11px] text-muted lg:inline-block">
              ⌘K
            </kbd>
          </button>
          <a
            href={SIGN_IN_URL}
            className="inline-flex h-10 items-center rounded-full px-3.5 text-[15px] font-medium text-foreground transition-colors hover:bg-subtle"
          >
            Sign in
          </a>
          <TrackedLink href="/demo" event="demo_cta_click" position="header" className="btn btn-secondary !min-h-10 !px-4">
            Book a demo
          </TrackedLink>
          <TrackedLink href="/demo" event="pilot_cta_click" position="header" className="btn btn-primary !min-h-10 !px-4">
            Start free pilot
          </TrackedLink>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-subtle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-surface md:hidden"
        >
          <nav aria-label="Mobile" className="container-page flex flex-col py-4">
            {productMenu &&
              products.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-xl p-3 hover:bg-subtle"
                >
                  <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', p.dot)} aria-hidden />
                  <span className="flex flex-col">
                    <span className="text-lg font-semibold text-foreground">{p.name}</span>
                    <span className="text-sm text-muted">{p.blurb}</span>
                  </span>
                </Link>
              ))}
            {[...links, { href: '/case-studies', label: 'Case studies' }, { href: '/security', label: 'Security' }].map(
              (l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-4 text-xl font-semibold tracking-[-0.01em] text-foreground hover:bg-subtle"
                >
                  {l.label}
                  <ArrowRight className="h-5 w-5 text-muted" aria-hidden />
                </Link>
              ),
            )}
            <div className="mt-6 grid gap-3">
              <TrackedLink href="/demo" event="demo_cta_click" position="mobile_menu" onClick={() => setOpen(false)} className="btn btn-primary btn-lg">
                Book a demo
              </TrackedLink>
              <TrackedLink href="/demo" event="pilot_cta_click" position="mobile_menu" onClick={() => setOpen(false)} className="btn btn-secondary btn-lg">
                Start free pilot
              </TrackedLink>
              <a href={SIGN_IN_URL} className="btn btn-ghost btn-lg">
                Sign in
              </a>
            </div>
          </nav>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
    {/* Skip-link target. <main> wraps the nav on every page, so pointing the
        skip link at <main> would land on the nav it is meant to skip. */}
    <div id="content-start" tabIndex={-1} className="outline-none" />
    </>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3.5 py-2 text-[15px] font-medium text-foreground transition-colors hover:bg-subtle"
    >
      {children}
    </Link>
  )
}
