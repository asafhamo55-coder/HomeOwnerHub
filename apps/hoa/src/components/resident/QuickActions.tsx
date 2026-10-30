import Link from 'next/link'
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  Megaphone,
  MessageSquarePlus,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import { IconTile, type Tone } from '@/components/resident/screen'

/**
 * Resident home quick-action tiles. Pure presentation: the "N new"
 * announcement count is the one the home page already loads.
 */
export function QuickActions({ newAnnouncements }: { newAnnouncements: number }) {
  return (
    // Eight tiles today. The span classes keep a lone last tile from sitting
    // by itself if the count ever becomes odd again.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-sm:[&>:last-child:nth-child(odd)]:col-span-2 sm:[&>:last-child:nth-child(3n+1)]:col-span-3">
      <ActionTile
        icon={<MessageSquarePlus />}
        label="New request"
        hint="Maintenance, noise, billing"
        href="/resident/tickets/new"
      />
      <ActionTile icon={<Sparkles />} tone="ai" label="Ask the Docs" hint="Your rules, answered" href="/resident/ask" />
      <ActionTile icon={<FileText />} tone="slate" label="Documents" hint="CC&Rs, bylaws, rules" href="/resident/documents" />
      <ActionTile
        icon={<ClipboardList />}
        tone="emerald"
        label="Start an ARC"
        hint="Exterior changes"
        href="/resident/arc/new"
      />
      <ActionTile
        icon={<ShieldAlert />}
        tone="amber"
        label="Report a concern"
        hint="Tell the board"
        href="/resident/report-violation"
      />
      <ActionTile icon={<CreditCard />} tone="slate" label="Dues" hint="Balance & charges" href="/resident/dues" />
      <ActionTile icon={<CalendarDays />} tone="slate" label="Meetings" hint="Dates and agendas" href="/resident/meetings" />
      <ActionTile
        icon={<Megaphone />}
        tone="slate"
        label="Announcements"
        hint="News from your board"
        href="/resident/announcements"
        badge={newAnnouncements > 0 ? `${newAnnouncements} new` : null}
      />
    </div>
  )
}

function ActionTile({
  icon,
  label,
  hint,
  href,
  tone,
  badge,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  href: string
  tone?: Tone
  badge?: string | null
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 no-underline transition-colors duration-fast hover:border-border-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconTile icon={icon} tone={tone} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{hint}</span>
      </span>
      {badge ? (
        <span className="absolute right-3 top-3">
          <Badge variant="info" size="sm">
            {badge}
          </Badge>
        </span>
      ) : null}
    </Link>
  )
}
