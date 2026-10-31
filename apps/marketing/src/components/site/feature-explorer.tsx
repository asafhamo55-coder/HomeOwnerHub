'use client'
import * as React from 'react'

import Link from 'next/link'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowRight, Check, FileText, Home, Megaphone, MessageCircleQuestion, ShieldAlert, Wallet } from 'lucide-react'
import { cn } from '../../lib/cn'
import { AnnouncementsScreen, AskScreen, DuesScreen, ViolationsScreen } from './tour-screens'

// Home feature explorer: an accessible tablist (roving tabindex, arrow
// keys, Home and End), no auto-rotate, every panel in the HTML. Every bullet
// restates a shipped feature from lib/features.ts or lib/workflows.ts, each
// of which names the apps/hoa route that proves it. Card and ACH online
// payments are NOT shipped, so nothing here mentions paying online.
// The screens are the in-repo HTML mockups (sample data): a stopgap until
// real screenshots exist.

export type ExplorerTab = {
  id: string
  title: string
  sub: string
  icon: typeof Wallet
  heading: string
  body: string
  bullets: [string, string, string, string]
  linkLabel: string
  href: string
  screen: ReactNode
}

function ArcScreen() {
  return (
    <div className="app-window">
      <div className="flex items-center justify-between border-b border-border bg-subtle/70 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
          <Home className="h-3.5 w-3.5 text-primary" aria-hidden />
          Request: new fence, 12 Maple Ct
        </span>
        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold text-warning">
          Awaiting board decision
        </span>
      </div>
      <div className="space-y-3 p-4 text-xs text-foreground-secondary">
        <p className="font-semibold text-foreground">Review against your guidelines</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            Height is within the limit in the guidelines
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            Photos show the planned location
          </li>
          <li className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />
            Decision letter drafted, ready to edit
          </li>
        </ul>
        <p className="text-[11px] text-muted">Sample data. The board decides.</p>
      </div>
    </div>
  )
}

export const EXPLORER_TABS: ExplorerTab[] = [
  {
    id: 'dues',
    title: 'Dues and accounting',
    sub: 'Balances, late fees, books',
    icon: Wallet,
    heading: 'Know who has paid, and keep the books straight',
    body: 'See every home’s balance in one place. Late notices and bills are drafted for you, and the board approves each one.',
    bullets: [
      'A balance and statement for every home',
      'A late-fee policy your board sets, held to the state cap',
      'Collections letters drafted for the board to review',
      'Scan a vendor bill, check it, then enter it in Accounting',
    ],
    linkLabel: 'See what the workspace does',
    href: '/hoa',
    screen: <DuesScreen />,
  },
  {
    id: 'violations',
    title: 'Violations',
    sub: 'Photo to letter',
    icon: ShieldAlert,
    heading: 'From a photo to a letter you can stand behind',
    body: 'Add a photo and a short note. The AI finds the rule in your documents and drafts the letter. You approve it.',
    bullets: [
      'The letter cites the section of your rules',
      'Follow-up letters: second notice, hearing, fine, decision',
      'Hearings are recorded before a fine is set',
      'Walk the community on your phone and drafts land in Approvals',
    ],
    linkLabel: 'See what the workspace does',
    href: '/hoa',
    screen: <ViolationsScreen />,
  },
  {
    id: 'announcements',
    title: 'Announcements',
    sub: 'Email, text, Spanish',
    icon: Megaphone,
    heading: 'Write once, reach every home',
    body: 'Type a few notes. Get an email, a short text and a Spanish version. Choose who gets it, then check it before it goes.',
    bullets: [
      'Send to all homes, owners, renters, or one street',
      'Preview the email, text and Spanish versions on a phone',
      'Schedule a send in your time zone',
      'See who received and opened it, home by home',
    ],
    linkLabel: 'See what the workspace does',
    href: '/hoa',
    screen: <AnnouncementsScreen />,
  },
  {
    id: 'documents',
    title: 'Documents and answers',
    sub: 'Ask your own rules',
    icon: MessageCircleQuestion,
    heading: 'Rule questions, answered from your documents',
    body: 'Upload your CC&R, bylaws and rules once. Then ask in plain English and get the exact section back.',
    bullets: [
      'Every answer names the section it came from',
      'It says so when your documents do not cover the question',
      'Owners can ask the documents before they email the board',
      'State-law answers cite the statute, Georgia first',
    ],
    linkLabel: 'See Georgia first',
    href: '/georgia',
    screen: <AskScreen />,
  },
  {
    id: 'arc',
    title: 'Architecture requests',
    sub: 'Review with citations',
    icon: Home,
    heading: 'Review home projects without the back and forth',
    body: 'Owners can check a request against your guidelines before they send it. The board sees a cited review and decides.',
    bullets: [
      'A review that cites your guidelines',
      'Findings read from the owner’s photos',
      'Decision letters you can edit before they go',
      'Nothing is sent until the board decides',
    ],
    linkLabel: 'See what the workspace does',
    href: '/hoa',
    screen: <ArcScreen />,
  },
]

export function FeatureExplorer() {
  const uid = useId()
  const [active, setActive] = useState(0)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const tabs = EXPLORER_TABS

  function go(next: number) {
    const i = (next + tabs.length) % tabs.length
    setActive(i)
    refs.current[i]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      go(active + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      go(active - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(tabs.length - 1)
    }
  }

  return (
    <section id="features" aria-labelledby={`${uid}-h`} className="section scroll-mt-20">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">What you can do</p>
          <h2 id={`${uid}-h`} className="t-h2 mt-4 text-foreground">
            Everything your board does, <span className="text-primary">in one place.</span>
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="Features"
          onKeyDown={onKeyDown}
          className="-mx-5 mt-10 flex gap-3 overflow-x-auto px-5 pb-3 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 [scrollbar-width:none]"
        >
          {tabs.map((t, i) => {
            const selected = i === active
            const Icon = t.icon
            return (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`${uid}-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  'flex min-h-[72px] shrink-0 items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selected
                    ? 'border-primary bg-surface shadow-[0_14px_30px_-18px_hsl(var(--primary)/0.6)]'
                    : 'border-border bg-surface/60 hover:border-border-strong',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    selected ? 'bg-primary text-primary-fg' : 'bg-primary-subtle text-primary',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold leading-tight text-foreground">{t.title}</span>
                  <span className="mt-0.5 text-sm leading-tight text-muted">{t.sub}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-8">
          {tabs.map((t, i) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`${uid}-panel-${t.id}`}
              aria-labelledby={`${uid}-tab-${t.id}`}
              hidden={i !== active}
              className={cn(
                'card grid-cols-[minmax(0,1fr)] items-center gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:p-10',
                i === active ? 'grid' : 'hidden',
              )}
            >
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">{t.heading}</h3>
                <p className="mt-3 text-base text-foreground-secondary">{t.body}</p>
                <ul className="mt-5 space-y-3">
                  {t.bullets.map((b) => (
                    <li key={b} className="flex gap-3 text-base text-foreground-secondary">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
                <Link
                  href={t.href}
                  className="mt-6 inline-flex min-h-[44px] items-center gap-2 text-base font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {t.linkLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <div className="rounded-2xl bg-primary-subtle/60 p-4 sm:p-6">{t.screen}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted">Sample community and sample data. Real screenshots are coming.</p>
      </div>
    </section>
  )
}
