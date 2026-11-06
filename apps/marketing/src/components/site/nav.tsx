'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  Menu, X, ChevronDown, Search, ArrowRight, Wallet, Scale, Megaphone, FileText, ShieldAlert,
  Ruler, Sparkles, Route, Landmark, type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Logo, SIGN_IN_URL, SIGN_UP_URL } from './brand'
import { TrackedLink } from './tracked-link'

// The palette indexes the whole guide library (~500 kB raw). Load it only the
// first time someone opens it, so it stays out of every page's first load.
const CommandPalette = dynamic(() => import('./command-palette').then((m) => m.CommandPalette), { ssr: false })

// Grouped Features menu. Every href is a page that exists in this app
// (nav.test.tsx checks the list against app/**/page.tsx).
export const FEATURE_GROUPS: { title: string; items: { href: string; label: string; blurb: string; icon: LucideIcon }[] }[] = [
  {
    title: 'Money',
    items: [
      { href: '/features/dues-and-accounting', label: 'Dues and accounting', blurb: 'Balances, late fees, bills and books.', icon: Wallet },
      { href: '/georgia/late-fee-limits', label: 'Late fee limits', blurb: 'What Georgia lets you charge.', icon: Scale },
    ],
  },
  {
    title: 'Communication',
    items: [
      { href: '/features/announcements', label: 'Announcements', blurb: 'Email, text and Spanish in one go.', icon: Megaphone },
      { href: '/templates', label: 'Templates', blurb: 'Notices and letters to start from.', icon: FileText },
    ],
  },
  {
    title: 'Rules and requests',
    items: [
      { href: '/features/violations', label: 'Violations', blurb: 'Notice steps, from photo to letter.', icon: ShieldAlert },
      { href: '/features/architecture-requests', label: 'Architecture requests', blurb: 'Review a project against your rules.', icon: Ruler },
    ],
  },
  {
    title: 'AI and law',
    items: [
      { href: '/features/ask-your-documents', label: 'Ask your documents', blurb: 'Cited answers from your CC&R.', icon: Sparkles },
      { href: '/roadmap', label: 'AI workflows', blurb: 'What the AI does today and what is next.', icon: Route },
      { href: '/states', label: 'State laws', blurb: 'Georgia, Florida, California and Texas.', icon: Landmark },
    ],
  },
]

const isActive = (pathname: string | null, href: string) =>
  !!pathname && (pathname === href || pathname.startsWith(href + '/'))

const MORE_LINKS = [
  { href: '/security', label: 'Security' },
  { href: '/docs', label: 'Docs' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/status', label: 'Status' },
]

const links = [
  { href: '/georgia', label: 'Georgia' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteLoaded, setPaletteLoaded] = useState(false)
  useEffect(() => {
    if (paletteOpen) setPaletteLoaded(true)
  }, [paletteOpen])
  const featuresRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const featuresTriggerRef = useRef<HTMLButtonElement>(null)
  const focusFirst = useRef(false)
  const pathname = usePathname()

  // Outside pointer press closes the Features menu (touch laptops have no
  // mouseleave to rely on).
  useEffect(() => {
    if (!featuresOpen) return
    const onDown = (e: PointerEvent) => {
      if (!featuresRef.current?.contains(e.target as Node)) setFeaturesOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [featuresOpen])

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
  const navLink =
    'relative flex min-h-11 items-center rounded-xl px-3.5 text-base font-medium text-foreground transition-colors hover:bg-subtle hover:text-primary'

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b bg-surface/95 backdrop-blur-lg print:hidden transition-[border-color,box-shadow] duration-200',
        solid ? 'border-border shadow-[0_10px_30px_-18px_hsl(var(--foreground)/0.35)]' : 'border-transparent',
      )}
    >
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
              className={cn(navLink, 'gap-1', featuresOpen && 'bg-subtle text-primary')}
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
                'mega absolute left-1/2 top-full w-[920px] max-w-[calc(100vw-2rem)] -translate-x-[38%] pt-3',
                featuresOpen ? 'mega-open' : 'mega-closed',
              )}
            >
              <div className="grid grid-cols-[1fr_1fr_17rem] gap-2 rounded-3xl border border-border bg-elevated p-3 shadow-[0_30px_70px_-30px_hsl(var(--primary)/0.45)]">
                <div className="col-span-2 grid grid-cols-2 gap-x-2 gap-y-2 p-2">
                  {FEATURE_GROUPS.map((g) => (
                    <div key={g.title}>
                      <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</p>
                      {g.items.map((it) => (
                        <Link
                          key={it.label}
                          href={it.href}
                          onClick={() => setFeaturesOpen(false)}
                          aria-current={isActive(pathname, it.href) ? 'page' : undefined}
                          className="group flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-primary-subtle aria-[current=page]:bg-primary-subtle"
                        >
                          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
                            <it.icon className="h-5 w-5" aria-hidden />
                          </span>
                          <span className="flex flex-col">
                            <span className="text-base font-semibold leading-snug text-foreground">{it.label}</span>
                            <span className="text-sm leading-snug text-muted">{it.blurb}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="tile-grad flex flex-col justify-between rounded-2xl p-6 text-[#fff]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e9d5ff]">Built in</p>
                    <p className="mt-3 text-xl font-semibold leading-snug">Georgia law, cited in every answer</p>
                    <p className="mt-2 text-sm leading-relaxed text-[#e9d5ff]">
                      Read what SB 406 and the Georgia POA Act mean for your board, in plain English.
                    </p>
                  </div>
                  <div className="mt-6 flex flex-col gap-2">
                    <Link
                      href="/georgia"
                      onClick={() => setFeaturesOpen(false)}
                      className="inline-flex min-h-11 items-center justify-between rounded-xl bg-[#fff] px-4 text-[15px] font-semibold text-[#3b0764] transition-colors hover:bg-[#f0e8ff]"
                    >
                      See Georgia guides
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link
                      href="/demo"
                      onClick={() => setFeaturesOpen(false)}
                      className="inline-flex min-h-11 items-center px-1 text-[15px] font-medium text-[#fff] underline-offset-4 hover:underline"
                    >
                      Book a demo
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href) ? 'page' : undefined}
              className={cn(navLink, 'aria-[current=page]:text-primary aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3.5 aria-[current=page]:after:bottom-1 aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded aria-[current=page]:after:bg-primary')}
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
            <Search className="h-5 w-5" aria-hidden />
          </button>
          <a href={SIGN_IN_URL} className={navLink}>
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
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-strong px-3.5 text-base font-semibold text-foreground hover:bg-subtle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            <span aria-hidden>{open ? 'Close' : 'Menu'}</span>
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          ref={menuRef}
          className="mobile-sheet absolute inset-x-0 top-full h-[calc(100dvh-4rem)] flex flex-col border-t border-border bg-surface md:hidden"
        >
          <nav aria-label="Mobile" className="flex min-h-0 flex-1 flex-col">
            <div className="container-page flex-1 overflow-y-auto pb-6 pt-2">
              {FEATURE_GROUPS.map((g) => (
                <div key={g.title} className="border-b border-border py-3">
                  <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</p>
                  {g.items.map((it) => (
                    <Link
                      key={it.label}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(pathname, it.href) ? 'page' : undefined}
                      className="flex min-h-[52px] items-center gap-3 rounded-xl px-1 text-[17px] font-semibold text-foreground active:bg-subtle aria-[current=page]:text-primary"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                        <it.icon className="h-5 w-5" aria-hidden />
                      </span>
                      {it.label}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="border-b border-border py-3">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                    className="flex min-h-[52px] items-center justify-between rounded-xl px-1 text-[17px] font-semibold text-foreground active:bg-subtle aria-[current=page]:text-primary"
                  >
                    {l.label}
                    <ArrowRight className="h-5 w-5 text-muted" aria-hidden />
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 pt-3">
                {MORE_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-12 items-center text-base text-foreground-secondary"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="border-t border-border bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_30px_-20px_hsl(var(--foreground)/0.35)]">
              <div className="mx-auto grid max-w-md grid-cols-[1fr_1.4fr] gap-3">
                <a href={SIGN_IN_URL} className="btn btn-secondary btn-lg">
                  Sign in
                </a>
                <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position="mobile_menu" onClick={() => setOpen(false)} className="btn btn-primary btn-lg">
                  Start free trial
                </TrackedLink>
              </div>
              <TrackedLink href="/demo" event="demo_cta_click" position="mobile_menu" onClick={() => setOpen(false)} className="mx-auto mt-1 flex min-h-12 max-w-md items-center justify-center text-base font-semibold text-primary underline-offset-4 hover:underline">
                Book a demo
              </TrackedLink>
            </div>
          </nav>
        </div>
      )}

      {paletteLoaded && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
    </header>
  )
}
