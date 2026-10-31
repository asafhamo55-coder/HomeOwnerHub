import {
  Alert,
  Avatar,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
} from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { InvitePlatformAdminForm } from './InvitePlatformAdminForm'
import { RevokeButton } from './RevokeButton'
import { formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'Platform admins' }

interface AdminRow {
  user_id: string
  email: string | null
  granted_at: string
  granted_by_email: string | null
  note: string | null
}

type RawRow = {
  user_id: string
  granted_at: string
  note: string | null
  granted_by: string | null
  user: { email: string | null } | null
  granter: { email: string | null } | null
}

export default async function PlatformAdminsPage() {
  await requirePlatformAdmin()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  const db = createAdminClient()
  const res = await loadOrFail(
    'platform admins',
    db
      .from('platform_admins' as never)
      .select(
        'user_id, granted_at, note, granted_by, user:profiles!platform_admins_user_id_fkey(email), granter:profiles!platform_admins_granted_by_fkey(email)',
      )
      .is('revoked_at', null)
      .order('granted_at', { ascending: true }) as unknown as PromiseLike<{
      data: RawRow[] | null
      error: { code?: string; message?: string } | null
    }>,
  )

  const rows: AdminRow[] = res.ok
    ? (res.data ?? []).map((r) => ({
        user_id: r.user_id,
        email: r.user?.email ?? null,
        granted_at: r.granted_at,
        granted_by_email: r.granter?.email ?? null,
        note: r.note,
      }))
    : []

  return (
    <Page
      width="default"
      title="Platform admins"
      description={
        res.ok
          ? `${rows.length} active platform admin${rows.length === 1 ? '' : 's'} with cross-tenant access. Every action they take is logged.`
          : 'Staff with cross-tenant access. Every action they take is logged.'
      }
    >
      <Alert variant="warning" title="Grant this only to HomeownerHub staff">
        Platform admins can view and change data in every tenant. The last active platform admin can’t be
        revoked — grant someone else first.
      </Alert>

      <section className="space-y-3" aria-labelledby="active-admins">
        <h2 id="active-admins" className="text-lg">
          Active admins
        </h2>
        {res.ok ? (
          <DataTable
            caption="Active platform admins"
            mobile="cards"
            rows={rows}
            rowKey={(r) => r.user_id}
            empty={<EmptyState variant="compact" title="No active platform admins" />}
            columns={[
              {
                key: 'admin',
                header: 'Admin',
                mobilePrimary: true,
                cell: (r) => (
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={r.email ?? r.user_id} size="sm" />
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {r.email ?? r.user_id}
                      {r.user_id === currentUser?.id ? <span className="ml-2 text-xs font-normal text-muted">(you)</span> : null}
                    </span>
                  </div>
                ),
              },
              {
                key: 'granted',
                header: 'Granted',
                cell: (r) => (
                  <span className="text-foreground-secondary">
                    {formatShortDate(r.granted_at)}
                    {r.granted_by_email ? <span className="block text-xs text-muted">by {r.granted_by_email}</span> : null}
                  </span>
                ),
              },
              {
                key: 'note',
                header: 'Note',
                hideBelowLg: true,
                cell: (r) => <span className="text-foreground-secondary">{r.note ?? '—'}</span>,
              },
              {
                key: 'actions',
                header: <span className="sr-only">Actions</span>,
                className: 'w-px text-right',
                cell: (r) =>
                  r.user_id !== currentUser?.id ? <RevokeButton userId={r.user_id} email={r.email ?? r.user_id} /> : null,
              },
            ]}
          />
        ) : (
          <LoadFailed what="platform admins" retryHref="/admin/admins" />
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Grant platform admin</CardTitle>
          <CardDescription>
            Existing accounts are promoted immediately; anyone else gets an invitation email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvitePlatformAdminForm />
        </CardContent>
      </Card>
    </Page>
  )
}
