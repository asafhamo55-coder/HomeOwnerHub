'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Menu, X, ChevronDown, Search, ArrowRight } from 'lucide-react'
import { CommandPalette } from './command-palette'
import { cn } from '../../lib/cn'
import { HOA_PRODUCT_NAME, isOfferedHref } from '../../lib/hubs'
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
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const productsTriggerRef = useRef<HTMLButtonElement>(null)
  const focusFirstProduct = useRef(false)

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

  // Focus management for the mobile menu: move focus in on open, keep Tab
  // inside the toggle plus the menu, and hand focus back to the toggle on any
  // close (Escape, toggle, link click, CTA).
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      menuRef.current?.querySelector<HTMLElement>('a[href], button')?.focus()
      const onTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return
        const items = [
          toggleRef.current,
          ...Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? []),
        ].filter((el): el is HTMLElement => !!el)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (!items.includes(active as HTMLElement)) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
      window.addEventListener('keydown', onTab)
      return () => window.removeEventListener('keydown', onTab)
    }
    if (wasOpen.current) {
      wasOpen.current = false
      toggleRef.current?.focus()
    }
  }, [open])

  // Keyboard open of the Products menu: once it is visible, focus the first
  // item (hidden links cannot take focus before then).
  useEffect(() => {
    if (productsOpen && focusFirstProduct.current) {
      focusFirstProduct.current = false
      productsRef.current?.querySelector<HTMLElement>('#nav-products a[href]')?.focus()
    }
  }, [productsOpen])

  const onProductsTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      focusFirstProduct.current = true
      if (productsOpen) {
        focusFirstProduct.current = false
        productsRef.current?.querySelector<HTMLElement>('#nav-products a[href]')?.focus()
      } else {
        setProductsOpen(true)
      }
    }
  }

  const onProductsItemKey = (e: React.KeyboardEvent) => {
    const items = Array.from(productsRef.current?.querySelectorAll<HTMLElement>('#nav-products a[href]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    let next: HTMLElement | undefined
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length]
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length]
    else if (e.key === 'Home') next = items[0]
    else if (e.key === 'End') next = items[items.length - 1]
    else if (e.key === 'Escape') {
      e.preventDefault()
      setProductsOpen(false)
      productsTriggerRef.current?.focus()
      return
    }
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

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
                ref={productsTriggerRef}
                type="button"
                onKeyDown={onProductsTriggerKey}
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
                onKeyDown={onProductsItemKey}
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
                        <span className="text-sm leading-snug text-muted">{p.blurb}</span>
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
            Start free trial
          </TrackedLink>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <button
            ref={toggleRef}
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
          ref={menuRef}
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
                Start free trial
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
