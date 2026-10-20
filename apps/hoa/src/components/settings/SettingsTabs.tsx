import Link from 'next/link'
import { Tabs } from '@homeowner-portal/ui'

type SettingsPath =
  | '/settings'
  | '/settings/members'
  | '/settings/payments'
  | '/settings/reminders'
  | '/settings/vendors'
  | '/settings/mailbox'
  | '/settings/billing'
  | '/settings/data'
  | '/settings/notifications'
  | '/settings/activity'
  | '/settings/handover'

/**
 * Sub-navigation across the settings pages. Mirrors the role gating of
 * each page (and of nav.ts): General and the HOA mailbox are admin-only
 * (requireAdmin), Members, Resident payments, Dues reminders, Vendors, Billing, Your data, Notifications, Activity log and Board handover are open to board and admin
 * (requireBoardOrAdmin). A tab is never shown to a role its page would
 * bounce.
 */
const ITEMS: Array<{ label: string; href: SettingsPath; adminOnly: boolean }> = [
  { label: 'General', href: '/settings', adminOnly: true },
  { label: 'Members', href: '/settings/members', adminOnly: false },
  { label: 'Resident payments', href: '/settings/payments', adminOnly: false },
  { label: 'Dues reminders', href: '/settings/reminders', adminOnly: false },
  { label: 'Vendors', href: '/settings/vendors', adminOnly: false },
  { label: 'HOA mailbox', href: '/settings/mailbox', adminOnly: true },
  { label: 'Billing', href: '/settings/billing', adminOnly: false },
  { label: 'Your data', href: '/settings/data', adminOnly: false },
  { label: 'Notifications', href: '/settings/notifications', adminOnly: false },
  { label: 'Activity log', href: '/settings/activity', adminOnly: false },
  { label: 'Board handover', href: '/settings/handover', adminOnly: false },
]

export function SettingsTabs({ current, role }: { current: SettingsPath; role: 'admin' | 'board' }) {
  const items = ITEMS.filter((i) => role === 'admin' || !i.adminOnly).map((i) => ({
    label: i.label,
    href: i.href,
    active: i.href === current,
  }))
  return <Tabs items={items} linkAs={Link} aria-label="Settings sections" />
}
