import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { format } from 'date-fns'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusBadge,
} from '@homeowner-portal/ui'
import { listInvitations, type InvitationStatus } from '@/lib/vendor-invitations'
import { InviteVendorForm } from './InviteVendorForm'
import { RevokeInvitationButton } from './RevokeInvitationButton'

export const metadata = { title: 'Vendor invitations' }

const INVITATION_STATUS_TONES: Record<InvitationStatus, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  pending: 'warning',
  submitted: 'success',
  expired: 'destructive',
  revoked: 'destructive',
}

const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  expired: 'Link expired',
  revoked: 'Revoked',
}

export default async function InvitationsPage() {
  const invitations = await listInvitations()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/vendors"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to vendors
      </Link>

      <header className="space-y-1">
        <h1>Vendor invitations</h1>
        <p className="text-sm text-muted">
          Send a vendor a tokenized link. They fill in their own business
          details and (optionally) upload COI, W-9, and license. The
          submission lands in your vendors list as a 'prospect'.
        </p>
      </header>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle className="text-base">Invite a vendor</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteVendorForm />
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Recent invitations
        </h2>
        {invitations.length === 0 ? (
          <EmptyState
            icon={<Mail className="h-10 w-10" aria-hidden />}
            title="No invitations yet"
            description="Send your first invitation above. Vendors get a one-time link valid for 7 days."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {inv.invitee_name ?? inv.invitee_email}
                    </p>
                    <p className="text-xs text-muted">
                      {inv.invitee_email}
                      {' · sent '}
                      {format(new Date(inv.created_at), 'PP')}
                      {' · expires '}
                      {format(new Date(inv.expires_at), 'PP')}
                    </p>
                    {inv.vendor_id && inv.status === 'submitted' ? (
                      <p className="mt-0.5 text-xs">
                        <Link
                          href={`/vendors/${inv.vendor_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          View submitted vendor →
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <StatusBadge
                      status={inv.status}
                      tones={INVITATION_STATUS_TONES}
                      labels={INVITATION_STATUS_LABELS}
                    />
                    {inv.status === 'pending' ? (
                      <RevokeInvitationButton invitationId={inv.id} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
