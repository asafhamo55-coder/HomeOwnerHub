import Link from 'next/link'
import { Mail } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { listInvitationsResult, type InvitationRow } from '@/lib/vendor-invitations'
import { INVITATION_STATUS_LABELS, INVITATION_STATUS_TONES } from '@/lib/status/vendors'
import { VendorTabs } from '@/components/vendors/VendorTabs'
import { shortDate } from '@/components/vendors/format'
import { InviteVendorForm } from './InviteVendorForm'
import { RevokeInvitationButton } from './RevokeInvitationButton'

export const metadata = { title: 'Vendor invitations' }

const columns: DataTableColumn<InvitationRow>[] = [
  {
    key: 'vendor',
    header: 'Vendor',
    mobilePrimary: true,
    cell: (inv) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{inv.invitee_name ?? inv.invitee_email}</p>
        {inv.invitee_name ? <p className="truncate text-xs text-muted">{inv.invitee_email}</p> : null}
        {inv.vendor_id && inv.status === 'submitted' ? (
          <Link href={`/vendors/${inv.vendor_id}`} className="text-xs font-medium text-primary hover:underline">
            View submitted vendor
          </Link>
        ) : null}
      </div>
    ),
  },
  { key: 'sent', header: 'Sent', cell: (inv) => <span className="num">{shortDate(inv.created_at)}</span> },
  {
    key: 'expires',
    header: 'Link expires',
    hideBelowLg: true,
    cell: (inv) => <span className="num">{shortDate(inv.expires_at)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (inv) => (
      <StatusBadge status={inv.status} tones={INVITATION_STATUS_TONES} labels={INVITATION_STATUS_LABELS} />
    ),
  },
  {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    className: 'text-right',
    cell: (inv) => (inv.status === 'pending' ? <RevokeInvitationButton invitationId={inv.id} /> : null),
  },
]

export default async function InvitationsPage() {
  const result = await listInvitationsResult()

  return (
    <Page
      title="Vendors"
      description="Invite a vendor to fill in their own details and upload their COI, W-9 and license."
      tabs={<VendorTabs current="/vendors/invitations" />}
      linkAs={Link}
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Invite a vendor</CardTitle>
          <CardDescription>
            They get a one-time link, valid for 7 days. Their submission lands in your vendor list as a
            prospect.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteVendorForm />
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="recent-invitations">
        <h2 id="recent-invitations" className="text-lg font-semibold text-foreground">
          Recent invitations
        </h2>
        {!result.ok ? (
          <LoadFailed what="invitations" retryHref="/vendors/invitations" />
        ) : (
          <DataTable
            columns={columns}
            rows={result.data}
            rowKey={(r) => r.id}
            mobile="cards"
            linkAs={Link}
            caption="Vendor invitations"
            empty={
              <EmptyState
                variant="compact"
                icon={<Mail aria-hidden />}
                title="No invitations yet"
                description="Invitations you send appear here with their status."
              />
            }
          />
        )}
      </section>
    </Page>
  )
}
