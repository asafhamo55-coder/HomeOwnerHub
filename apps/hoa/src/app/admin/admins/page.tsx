import { Shield } from 'lucide-react'
import { format } from 'date-fns'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { InvitePlatformAdminForm } from './InvitePlatformAdminForm'
import { RevokeButton } from './RevokeButton'

export const metadata = { title: 'Platform admins' }

interface AdminRow {
  user_id: string
  email: string | null
  granted_at: string
  granted_by_email: string | null
  note: string | null
}

export default async function PlatformAdminsPage() {
  await requirePlatformAdmin()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  const db = createAdminClient()
  const { data } = await db
    .from('platform_admins' as never)
    .select(
      'user_id, granted_at, note, granted_by, user:profiles!platform_admins_user_id_fkey(email), granter:profiles!platform_admins_granted_by_fkey(email)',
    )
    .is('revoked_at', null)
    .order('granted_at', { ascending: true })

  const rows = ((data ?? []) as unknown as Array<{
    user_id: string
    granted_at: string
    note: string | null
    granted_by: string | null
    user: { email: string | null } | null
    granter: { email: string | null } | null
  }>).map<AdminRow>((r) => ({
    user_id: r.user_id,
    email: r.user?.email ?? null,
    granted_at: r.granted_at,
    granted_by_email: r.granter?.email ?? null,
    note: r.note,
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Platform admins</h1>
        </div>
        <p className="text-sm text-muted">
          {rows.length} active platform admin{rows.length === 1 ? '' : 's'}. Platform admins
          have cross-tenant superuser access — every action is logged.
        </p>
      </header>

      <Alert variant="warning" title="Treat this list carefully">
        <span className="block text-sm">
          Platform admins can view and modify data across every tenant. Grant only to
          HomeownerHub staff. You can't revoke the last active platform admin — grant
          someone else first.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Grant platform admin</CardTitle>
        </CardHeader>
        <CardContent>
          <InvitePlatformAdminForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active admins</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.user_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {r.email ?? r.user_id}
                    {r.user_id === currentUser?.id ? (
                      <span className="ml-2 text-xs text-muted">(you)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    Granted {format(new Date(r.granted_at), 'PP')}
                    {r.granted_by_email ? ` by ${r.granted_by_email}` : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                </div>
                {r.user_id !== currentUser?.id ? (
                  <RevokeButton userId={r.user_id} email={r.email ?? r.user_id} />
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
