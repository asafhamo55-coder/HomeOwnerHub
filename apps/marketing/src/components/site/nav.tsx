'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Menu, X, ChevronDown, Search, ArrowRight } from 'lucide-react'
import { CommandPalette } from './command-palette'
import { cn } from '../../lib/cn'
import { Logo, SIGN_IN_URL, SIGN_UP_URL } from './brand'
import { TrackedLink } from './tracked-link'

// Grouped Features menu. Every href is a page that exists in this app
// (nav.test.tsx checks the list against app/**/page.tsx).
export const FEATURE_GROUPS: { title: string; items: { href: string; label: string; blurb: string }[] }[] = [
  {
    title: 'Money',
    items: [
      { href: '/hoa', label: 'Dues and accounting', blurb: 'Balances, late fees, bills and books.' },
      { href: '/georgia/late-fee-limits', label: 'Late fee limits', blurb: 'What Georgia lets you charge.' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { href: '/hoa#features', label: 'Announcements', blurb: 'Email, text and Spanish in one go.' },
      { href: '/templates', label: 'Templates', blurb: 'Notices and letters to start from.' },
    ],
  },
  {
    title: 'Rules and requests',
    items: [
      { href: '/georgia/violation-notice-checklist', label: 'Violations', blurb: 'Notice steps, from photo to letter.' },
      { href: '/hoa', label: 'Architecture requests', blurb: 'Review a project against your rules.' },
    ],
  },
  {
    title: 'AI and law',
    items: [
      { href: '/roadmap', label: 'AI workflows', blurb: 'What the AI does today and what is next.' },
      { href: '/states', label: 'State laws', blurb: 'Georgia, Florida, California and Texas.' },
    ],
  },
]

const links = [
  { href: '/georgia', label: 'Georgia' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const featuresRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const featuresTriggerRef = useRef<HTMLButtonElement>(null)
  const focusFirst = useRef(false)

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
        setFeaturesOpen(false)
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

  // Keyboard open of the Features menu: once it is visible, focus the first
  // item (hidden links cannot take focus before then).
  useEffect(() => {
    if (featuresOpen && focusFirst.current) {
      focusFirst.current = false
      featuresRef.current?.querySelector<HTMLElement>('#nav-features a[href]')?.focus()
    }
  }, [featuresOpen])

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (featuresOpen) {
        featuresRef.current?.querySelector<HTMLElement>('#nav-features a[href]')?.focus()
      } else {
        focusFirst.current = true
        setFeaturesOpen(true)
      }
    }
  }

  const onItemKey = (e: React.KeyboardEvent) => {
    const items = Array.from(featuresRef.current?.querySelectorAll<HTMLElement>('#nav-features a[href]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    let next: HTMLElement | undefined
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length]
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length]
    else if (e.key === 'Home') next = items[0]
    else if (e.key === 'End') next = items[items.length - 1]
    else if (e.key === 'Escape') {
      e.preventDefault()
      setFeaturesOpen(false)
      featuresTriggerRef.current?.focus()
      return
    }
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  const solid = scrolled || open

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b bg-surface/95 backdrop-blur-lg print:hidden transition-[border-color,box-shadow] duration-200',
        solid ? 'border-border shadow-[0_10px_30px_-22px_hsl(var(--foreground)/0.3)]' : 'border-transparent',
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
        </div>
      </div>
      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-[72px]">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="HomeownerHub home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <div
            ref={featuresRef}
            className="relative"
            onMouseEnter={() => setFeaturesOpen(true)}
            onMouseLeave={() => setFeaturesOpen(false)}
            onBlur={(e) => {
              if (!featuresRef.current?.contains(e.relatedTarget as Node)) setFeaturesOpen(false)
            }}
          >
            <button
              ref={featuresTriggerRef}
              type="button"
              onKeyDown={onTriggerKey}
              aria-expanded={featuresOpen}
              aria-controls="nav-features"
              onClick={() => setFeaturesOpen((v) => !v)}
              className="flex min-h-11 items-center gap-1 rounded-xl px-3.5 text-base font-medium text-foreground transition-colors hover:bg-subtle"
            >
              Features
              <ChevronDown
                aria-hidden
                className={cn('h-4 w-4 text-muted transition-transform duration-200', featuresOpen && 'rotate-180')}
              />
            </button>
            <div
              id="nav-features"
              onKeyDown={onItemKey}
              className={cn(
                'absolute left-0 top-full w-[560px] pt-2 transition-[opacity,transform] duration-200',
                featuresOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0',
              )}
            >
              <div className="grid grid-cols-2 gap-x-2 gap-y-3 rounded-2xl border border-border bg-elevated p-3 shadow-lg">
                {FEATURE_GROUPS.map((g) => (
                  <div key={g.title}>
                    <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</p>
                    {g.items.map((it) => (
                      <Link
                        key={it.label}
                        href={it.href}
                        onClick={() => setFeaturesOpen(false)}
                        className="flex flex-col rounded-xl px-3 py-2 transition-colors hover:bg-subtle"
                      >
                        <span className="text-[15px] font-semibold text-foreground">{it.label}</span>
                        <span className="text-sm leading-snug text-muted">{it.blurb}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-11 items-center rounded-xl px-3.5 text-base font-medium text-foreground transition-colors hover:bg-subtle"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search the site"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-foreground"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
          <a
            href={SIGN_IN_URL}
            className="inline-flex min-h-11 items-center rounded-xl px-3.5 text-base font-medium text-foreground transition-colors hover:bg-subtle"
          >
            Sign in
          </a>
          <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position="header" className="btn btn-primary">
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
            {FEATURE_GROUPS.map((g) => (
              <div key={g.title} className="mb-2">
                <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</p>
                {g.items.map((it) => (
                  <Link
                    key={it.label}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col rounded-xl px-3 py-2.5 hover:bg-subtle"
                  >
                    <span className="text-lg font-semibold text-foreground">{it.label}</span>
                    <span className="text-sm text-muted">{it.blurb}</span>
                  </Link>
                ))}
              </div>
            ))}
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-4 text-xl font-semibold tracking-[-0.01em] text-foreground hover:bg-subtle"
              >
                {l.label}
                <ArrowRight className="h-5 w-5 text-muted" aria-hidden />
              </Link>
            ))}
            <div className="mt-6 grid gap-3">
              <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position="mobile_menu" onClick={() => setOpen(false)} className="btn btn-primary btn-lg">
                Start free trial
              </TrackedLink>
              <TrackedLink href="/demo" event="demo_cta_click" position="mobile_menu" onClick={() => setOpen(false)} className="btn btn-secondary btn-lg">
                Book a demo
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
  )
}
