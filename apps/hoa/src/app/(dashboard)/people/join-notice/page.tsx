import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { appUrl } from '@/lib/app-origin'
import { JOIN_PATH, WELCOME_PATH, joinQrSvg, noticeContacts } from '@/lib/join-notice'
import { JoinNotice } from './JoinNotice'
import { PrintButton } from './PrintButton'

export const metadata = { title: 'How to join notice' }
export const dynamic = 'force-dynamic'

/**
 * /people/join-notice: a one-page printable "How to join HomeownerHub" for
 * owners who do not read email. Board and admins only; anyone else gets a
 * 404. Nothing is sent from here: the board prints it and leaves it in
 * mailboxes or hands it out at a meeting.
 */
export default async function JoinNoticePage() {
  const role = await getCurrentUserRole()
  if (!role || (role.role !== 'admin' && role.role !== 'board')) notFound()

  const supabase = await getSupabaseServerClient()
  const load = await loadOrFail(
    'join notice association',
    supabase
      .from('associations')
      .select('id, name, compliance_settings')
      .eq('organization_id', role.org.id)
      .order('name', { ascending: true })
      .limit(1),
  )

  const crumbs = [
    { label: 'Settings', href: '/settings/members' },
    { label: 'How to join notice' },
  ]

  if (!load.ok) {
    return (
      <Page width="default" linkAs={Link} breadcrumbs={crumbs} title="How to join notice">
        <LoadFailed what="your association" />
      </Page>
    )
  }
  const row = ((load.data ?? []) as Array<{ id: string; name: string; compliance_settings: unknown }>)[0] ?? null
  const associationName = row?.name ?? role.org.name
  const joinUrl = appUrl(JOIN_PATH)
  const qrSvg = await joinQrSvg(joinUrl)

  return (
    <Page width="default" linkAs={Link} breadcrumbs={crumbs} title="How to join notice">
      <div className="space-y-5">
        <div className="space-y-3 print:hidden">
          <p className="text-sm text-foreground-secondary">
            One page in large type for owners who do not read email. Print it and leave it in mailboxes, or hand it out at a meeting.
          </p>
          {!M5_APPLIED ? (
            <Alert variant="warning" title="Ask to join is not switched on yet">
              Owners who open the address will be told it is not available. Use the email invitations until it is on.
            </Alert>
          ) : null}
          <p className="text-sm text-foreground-secondary">
            Phone numbers and emails you list under{' '}
            <Link href="/settings/association" className="font-medium text-primary underline">
              Contacts
            </Link>{' '}
            will be printed and visible to anyone who picks this up.
          </p>
          <PrintButton />
        </div>
        <JoinNotice
          associationName={associationName}
          joinUrl={joinUrl}
          welcomeUrl={appUrl(WELCOME_PATH)}
          qrSvg={qrSvg}
          contacts={noticeContacts(row?.compliance_settings)}
        />
      </div>
    </Page>
  )
}
