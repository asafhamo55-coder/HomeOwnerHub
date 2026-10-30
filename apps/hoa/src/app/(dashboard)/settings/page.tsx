import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  NoOrgSelected,
  Page,
  StatusPill,
} from '@homeowner-portal/ui'
import { requireAdmin } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getMyProfile } from '@/lib/profile'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { ProfileForm } from './ProfileForm'
import { SetupHub, type SetupCard } from './SetupHub'
import { lateFeesState, mailboxState, paymentsState, professionalsState, receiptsState, remindersState } from './setup-hub'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { SUPPORT_EMAIL } from '@/lib/support'
import { tryLoad } from '@/lib/load-or-fail'
import { getBoardZelleSettings } from '@/lib/pay-settings'
import { getBoardLateFeePolicy } from '@/lib/late-fees/actions'
import { getBoardReminderSettings } from '@/lib/reminder-settings'
import { getBoardPaymentReceiptSettings } from '@/lib/resident-notify/receipt-actions'
import { getMailboxStatus } from '@/lib/inbox/queries'
import { loadOfficers } from '@/lib/professionals/load'

/** Board loaders return `{ ok: false, reason }` or may throw; the hub only needs ok or not. */
async function settle<T>(p: Promise<{ ok: true; data: T } | { ok: false }>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const r = await p
    return r.ok ? { ok: true, data: r.data } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export default async function SettingsPage() {
  await requireAdmin()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const supabase = await getSupabaseServerClient()
  const [membersRes, profile, zelle, lateFees, reminders, receipts, mailbox, officers] = await Promise.all([
    timed('/settings', 'settings.memberCount', () =>
      supabase.from('org_members').select('user_id', { count: 'exact', head: true }).eq('org_id', org.id),
    ),
    timed('/settings', 'settings.profile', () => getMyProfile()),
    timed('/settings', 'settings.hub.payments', () => settle(getBoardZelleSettings())),
    timed('/settings', 'settings.hub.lateFees', () => settle(getBoardLateFeePolicy())),
    timed('/settings', 'settings.hub.reminders', () => settle(getBoardReminderSettings())),
    timed('/settings', 'settings.hub.receipts', () => settle(getBoardPaymentReceiptSettings())),
    timed('/settings', 'settings.hub.mailbox', () => tryLoad('settings hub mailbox', () => getMailboxStatus(supabase, org.id))),
    M6_APPLIED ? timed('/settings', 'settings.hub.officers', () => loadOfficers(supabase, org.id)) : Promise.resolve(null),
  ])
  // A failed count reads "—", never a confident "1 person".
  const memberCount = membersRes.error ? null : membersRes.count

  const cards: SetupCard[] = [
    { key: 'payments', title: 'Resident payments', href: '/settings/payments', state: paymentsState(zelle) },
    { key: 'late-fees', title: 'Late fees', href: '/settings/late-fees', state: lateFeesState(lateFees) },
    { key: 'reminders', title: 'Dues reminders', href: '/settings/reminders', state: remindersState(reminders) },
    { key: 'receipts', title: 'Payment receipts', href: '/settings/payments', state: receiptsState(receipts) },
    { key: 'mailbox', title: 'HOA mailbox', href: '/settings/mailbox', state: mailboxState(mailbox) },
  ]
  if (officers) {
    cards.push({
      key: 'professionals',
      title: 'Professionals and treasurer',
      href: '/settings/professionals',
      state: professionalsState(officers.ok ? { ok: true, data: officers.rows } : { ok: false }),
    })
  }
  const usState = lateFees.ok ? lateFees.data.usState : null

  return (
    <Page
      width="narrow"
      title="Settings"
      description="Your profile and your association’s account."
      tabs={<SettingsTabs current="/settings" role="admin" />}
      linkAs={Link}
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Your profile</CardTitle>
          <CardDescription>The name shown in the dashboard greeting, emails and the members list.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile ? (
            <ProfileForm profile={profile} />
          ) : (
            <p className="text-sm text-muted">Your profile couldn’t be loaded. Refresh to try again.</p>
          )}
        </CardContent>
      </Card>

      <SetupHub cards={cards} />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">{org.name}</CardTitle>
          <CardDescription>
            {usState ? `${usState} association` : 'Association'} on the{' '}
            <StatusPill tone="brand" icon={null} label={PLAN_LABEL[org.plan] ?? org.plan} /> plan
            {org.doors_count != null ? <>, <span className="num">{org.doors_count}</span> doors</> : null}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link href="/settings/members" className="font-medium text-primary hover:underline">
            {memberCount == null ? 'View members' : `${memberCount} ${memberCount === 1 ? 'person' : 'people'}`}
          </Link>
          <Link href="/settings/association" className="font-medium text-primary hover:underline">
            Association details
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Change request: ${org.name}`)}`}
            className="font-medium text-primary hover:underline"
          >
            Contact support
          </a>
          <span className="text-foreground-secondary">{SUPPORT_EMAIL}</span>
        </CardContent>
      </Card>
    </Page>
  )
}
