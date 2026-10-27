import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadFailed, Page } from '@homeowner-portal/ui'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { expiryLabel } from '@/lib/professionals/model'
import { loadDualControlCents, loadMatterOptions, loadOfficers, loadPendingInvites, loadProfessionals } from '@/lib/professionals/load'
import { DualControlForm, InviteProfessionalForm, OfficerTitles, PendingInviteRow, ProfessionalRowView } from './ProfessionalsPanel'

export const metadata = { title: 'Professionals' }
export const dynamic = 'force-dynamic'

export default async function ProfessionalsPage() {
  if (!M6_APPLIED) redirect('/settings/members')
  const { role, org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const today = todayIn(await currentTimeZone())
  const [pros, options, officers, dual, pending] = await Promise.all([
    loadProfessionals(supabase, org.id),
    loadMatterOptions(supabase, org.id),
    loadOfficers(supabase, org.id),
    loadDualControlCents(supabase, org.id),
    loadPendingInvites(supabase, org.id),
  ])

  return (
    <Page title="Professionals" description="Your CPA and attorney get only the access their job needs, for a time you set. Everything they send comes to Approvals first.">
      <SettingsTabs current="/settings/professionals" role={role} />
      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Invite a professional</CardTitle>
            <CardDescription>A CPA reads the books and reports. An attorney sees only the matters you assign.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteProfessionalForm today={today} options={options.ok ? options.options : []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Who has access</CardTitle>
          </CardHeader>
          {!pros.ok ? (
            <div className="px-5 pb-5">
              <LoadFailed what="the access list" retryHref="/settings/professionals" />
            </div>
          ) : pros.rows.length === 0 ? (
            <CardContent>
              <p className="text-sm text-foreground-secondary">No outside professionals yet.</p>
            </CardContent>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {pros.rows.map((r) => (
                <ProfessionalRowView
                  key={r.userId}
                  row={r}
                  today={today}
                  options={options.ok ? options.options : []}
                  note={expiryLabel(r.accessExpiresAt, today)}
                />
              ))}
            </ul>
          )}
        </Card>

        {pending.ok && pending.rows.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Invited</CardTitle>
              <CardDescription>They get no access until they open the link we emailed, sign in with that address and accept.</CardDescription>
            </CardHeader>
            <ul className="divide-y divide-border border-t border-border">
              {pending.rows.map((r) => (
                <PendingInviteRow key={r.id} invite={r} />
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle as="h2">Officers</CardTitle>
            <CardDescription>The Treasurer signs off money approvals first. Titles also name your officers elsewhere.</CardDescription>
          </CardHeader>
          <CardContent>
            {officers.ok ? <OfficerTitles rows={officers.rows} canEdit={role === 'admin'} /> : <LoadFailed what="the board" retryHref="/settings/professionals" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Dual control</CardTitle>
          </CardHeader>
          <CardContent>
            {dual === 'error' ? <LoadFailed what="the amount" retryHref="/settings/professionals" /> : <DualControlForm cents={dual} canEdit={role === 'admin'} />}
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}
