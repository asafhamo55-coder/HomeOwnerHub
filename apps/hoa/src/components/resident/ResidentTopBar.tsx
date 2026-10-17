import Link from 'next/link'
import { Home } from 'lucide-react'

// Slim, app-style top bar for the resident portal: the community name on
// the left, a tappable initials avatar on the right that opens the
// Account screen. Deliberately minimal — the bottom tab bar carries
// primary navigation, and the per-screen hero carries the greeting.

function initialsFrom(value: string): string {
  const cleaned = value.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || value
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || value.slice(0, 2)).toUpperCase()
}

export function ResidentTopBar({
  orgName,
  userEmail,
  help,
}: {
  orgName: string
  userEmail: string
  /** The "?" help button (BL-070), shown beside the avatar. */
  help?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <Link
          href="/resident"
          className="flex min-w-0 items-center gap-2 no-underline text-foreground"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg">
            <Home className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold">{orgName}</span>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {help}
          <Link
            href="/resident/account"
            aria-label="Account"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-foreground no-underline transition hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {initialsFrom(userEmail)}
          </Link>
        </div>
      </div>
    </header>
  )
}
