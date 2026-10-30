import Link from 'next/link'
import { Banknote, CalendarClock, Gavel, Mail, Receipt, UserCog, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill, type StatusTone } from '@homeowner-portal/ui'
import { SETUP_LABEL, setupProgress, type SetupState } from './setup-hub'

export type SetupCardKey = 'payments' | 'late-fees' | 'reminders' | 'receipts' | 'mailbox' | 'professionals'

export interface SetupCard {
  key: SetupCardKey
  title: string
  href: string
  state: SetupState
}

const ICONS: Record<SetupCardKey, LucideIcon> = {
  payments: Banknote,
  'late-fees': Gavel,
  reminders: CalendarClock,
  receipts: Receipt,
  mailbox: Mail,
  professionals: UserCog,
}

const TONE: Record<SetupState, StatusTone> = {
  set_up: 'success',
  not_set_up: 'neutral',
  needs_attention: 'warning',
  unknown: 'info',
}

export function SetupHub({ cards }: { cards: SetupCard[] }) {
  const progress = setupProgress(cards.map((c) => c.state))
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle as="h2">Set up your association</CardTitle>
        <CardDescription>
          <span className="num font-medium text-foreground">{progress.label}</span>. Open any area to change it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => {
            const Icon = ICONS[c.key]
            return (
              <li key={c.key}>
                <Link
                  href={c.href}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon aria-hidden className="size-5 shrink-0 text-foreground-secondary" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{c.title}</span>
                  <StatusPill tone={TONE[c.state]} label={SETUP_LABEL[c.state]} size="sm" />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
