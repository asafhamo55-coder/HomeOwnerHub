'use client'
import * as React from 'react'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ClipboardCheck, Megaphone, MessageCircleQuestion, ShieldAlert, Wallet } from 'lucide-react'
import { cn } from '../../lib/cn'
import { AnnouncementsScreen, ApprovalsScreen, AskScreen, DuesScreen, ViolationsScreen } from './tour-screens'

// "See it work" product tour on the home page. A manual tablist (no
// auto-rotate, so nothing to pause and nothing that moves for reduced-motion
// users). Roving tabindex, arrow keys, Home and End. Every panel is in the
// HTML so there is no layout shift when a tab changes. Only shipped features
// appear; all names and data are sample data.

export type TourTab = {
  id: string
  label: string
  icon: typeof Wallet
  heading: string
  bullets: string[]
  screen: ReactNode
}

export const TOUR_TABS: TourTab[] = [
  {
    id: 'approvals',
    label: 'Approvals',
    icon: ClipboardCheck,
    heading: 'One queue for everything the AI drafted',
    bullets: [
      'Read each draft next to the rule or record it came from.',
      'Edit, approve or send it back. Nothing goes out before you approve.',
      'Every approval is logged, so the board can show who decided what.',
    ],
    screen: <ApprovalsScreen />,
  },
  {
    id: 'dues',
    label: 'Dues and credits',
    icon: Wallet,
    heading: 'Dues, balances and notices in one place',
    bullets: [
      'See who has paid, who has a credit and who is past due.',
      'A late notice is drafted from the ledger with the statute cited.',
      'You approve the letter before it reaches the homeowner.',
    ],
    screen: <DuesScreen />,
  },
  {
    id: 'violations',
    label: 'Violations',
    icon: ShieldAlert,
    heading: 'From a photo to a letter you can stand behind',
    bullets: [
      'Add a photo and a short note. The AI finds the rule in your CC&R.',
      'The letter cites the section, so the homeowner sees the reason.',
      'Track each case through notice, cure and close.',
    ],
    screen: <ViolationsScreen />,
  },
  {
    id: 'announcements',
    label: 'Announcements',
    icon: Megaphone,
    heading: 'Write once, reach everyone the way they read',
    bullets: [
      'Type a few board notes and get an email, a text and a Spanish version.',
      'Replies to residents are drafted for the board to read first.',
      'Text versions are kept short enough to send as one message.',
    ],
    screen: <AnnouncementsScreen />,
  },
  {
    id: 'ask',
    label: 'Ask your documents',
    icon: MessageCircleQuestion,
    heading: 'Rule questions answered from your own documents',
    bullets: [
      'Ask in plain English. The answer names the exact section.',
      'When your documents do not cover it, the answer says so.',
      'Upload your CC&R, bylaws and rules once and ask any time.',
    ],
    screen: <AskScreen />,
  },
]

export function ProductTour({ tabs = TOUR_TABS }: { tabs?: TourTab[] }) {
  const uid = useId()
  const [active, setActive] = useState(0)
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function go(next: number) {
    const i = (next + tabs.length) % tabs.length
    setActive(i)
    refs.current[i]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        go(active + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        go(active - 1)
        break
      case 'Home':
        e.preventDefault()
        go(0)
        break
      case 'End':
        e.preventDefault()
        go(tabs.length - 1)
        break
    }
  }

  return (
    <section id="product-tour" aria-labelledby={`${uid}-h`} className="section scroll-mt-16 bg-subtle/60">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">See it work</p>
          <h2 id={`${uid}-h`} className="t-h2 mt-4 text-foreground">
            The screens your board will actually use,{' '}
            <span className="t-serif text-primary">start to finish.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-foreground-secondary">
            Pick a task. Each screen below shows sample data from a made-up community, the way the app lays it out.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Product tour"
          onKeyDown={onKeyDown}
          className="-mx-5 mt-10 flex gap-2 overflow-x-auto px-5 pb-2 md:mx-0 md:justify-center md:px-0 [scrollbar-width:none]"
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
                  'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selected
                    ? 'border-primary bg-primary text-primary-fg shadow-sm'
                    : 'border-border bg-surface text-foreground-secondary hover:border-border-strong hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t.label}
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
                'grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-12',
                i === active ? 'grid' : 'hidden',
              )}
            >
              <div className="relative">
                <div
                  className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-primary/10 blur-2xl"
                  aria-hidden
                />
                {t.screen}
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t.heading}</h3>
                <ul className="mt-5 space-y-3.5">
                  {t.bullets.map((b) => (
                    <li key={b} className="flex gap-3 text-[15px] leading-relaxed text-foreground-secondary">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted">
          Sample community and sample data. The board approves every draft.
        </p>
      </div>
    </section>
  )
}
