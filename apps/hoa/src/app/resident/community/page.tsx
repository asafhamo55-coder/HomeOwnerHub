import { notFound } from 'next/navigation'
import { CalendarCheck, MessagesSquare, Vote } from 'lucide-react'
import { M9_APPLIED } from '@homeowner-portal/db/m9'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { M13_APPLIED } from '@homeowner-portal/db/m13'
import { communityLinks } from '@/lib/resident-community'
import { ScreenHeader, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'Community' }
export const dynamic = 'force-dynamic'

const ICONS = {
  polls: <Vote />,
  amenities: <CalendarCheck />,
  board: <MessagesSquare />,
} as const

// One simple page with a big tappable row per community feature that is on.
export default function ResidentCommunityPage() {
  const links = communityLinks({ polls: M9_APPLIED, amenities: M11_APPLIED, board: M13_APPLIED })
  if (links.length === 0) notFound()
  return (
    <div className="space-y-6">
      <ScreenHeader title="Community" subtitle="Things to do with your neighbors and your board." />
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.key}>
            <TappableRow icon={ICONS[l.key]} tone="slate" title={l.title} subtitle={l.hint} href={l.href} className="min-h-20" />
          </li>
        ))}
      </ul>
    </div>
  )
}
