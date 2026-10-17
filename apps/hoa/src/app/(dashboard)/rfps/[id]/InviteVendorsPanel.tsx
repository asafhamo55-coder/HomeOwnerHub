'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, UserCheck } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
  StatusPill,
  cn,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import {
  BID_STATUS_LABELS,
  BID_STATUS_TONES,
  COMPLIANCE_LABELS,
  COMPLIANCE_TONES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONES,
  complianceKey,
} from '@/lib/status/vendors'
import { tradesLabel } from '@/components/vendors/format'
import {
  inviteVendorsToRfp,
  revokeRfpInvitation,
  type InvitableVendor,
  type RfpInvitationRow,
  type RfpInviteFailureReason,
} from '@/lib/rfp-invitations'

const FAILURE_LABEL: Record<RfpInviteFailureReason, string> = {
  vendor_not_found: 'vendor not found',
  vendor_has_no_email: 'no email on file',
  invitation_create_failed: 'couldn’t create the invitation — try again',
  email_send_failed: 'invitation created, but the email didn’t send',
}


interface Props {
  rfpId: string
  invitableVendors: InvitableVendor[]
  invitations: RfpInvitationRow[]
}

export function InviteVendorsPanel({ rfpId, invitableVendors, invitations }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    sent: number
    skipped: number
    failed: Array<{ vendorId: string; reason: RfpInviteFailureReason }>
  } | null>(null)

  const vendorName = (id: string) =>
    invitableVendors.find((v) => v.id === id)?.legal_name ?? 'Vendor'

  const eligible = useMemo(
    () => invitableVendors.filter((v) => !v.already_invited),
    [invitableVendors],
  )

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleInvite() {
    if (selected.size === 0) return
    setError(null)
    setSummary(null)
    startTransition(async () => {
      const result = await inviteVendorsToRfp({
        rfpId,
        vendorIds: Array.from(selected),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSummary(result.data)
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle as="h2">Invite vendors</CardTitle>
          <CardDescription>
            Each gets a unique email link to submit a bid. Vendors without an email are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {eligible.length === 0 ? (
            <p className="text-sm text-muted">
              All vendors are already invited or none are eligible.
            </p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {eligible.map((v) => {
                const isSelected = selected.has(v.id)
                return (
                  <li key={v.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-fast',
                        isSelected ? 'border-primary/40 bg-primary-subtle' : 'border-border hover:bg-subtle',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 rounded border-input accent-primary"
                        checked={isSelected}
                        onChange={() => toggle(v.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {v.legal_name}
                        </p>
                        <p className="text-xs text-muted">{tradesLabel(v.trades) ?? 'No trade on file'}</p>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <StatusBadge
                          status={complianceKey(v.compliance_status)}
                          tones={COMPLIANCE_TONES}
                          labels={COMPLIANCE_LABELS}
                        />
                        <StatusBadge status={v.status} tones={VENDOR_STATUS_TONES} labels={VENDOR_STATUS_LABELS} />
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          {error ? (
            <Alert variant="error" title="Couldn’t send invitations">
              {error}
            </Alert>
          ) : null}
          {summary ? (
            <Alert variant={summary.failed.length > 0 ? 'warning' : 'success'}>
              Sent {summary.sent}{summary.skipped > 0 ? `, skipped ${summary.skipped} already invited` : ''}
              {summary.failed.length > 0 ? (
                <>
                  , {summary.failed.length} failed
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {summary.failed.map((f) => (
                      <li key={f.vendorId}>
                        {vendorName(f.vendorId)}: {FAILURE_LABEL[f.reason] ?? 'not sent'}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Alert>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="num text-sm text-muted">{selected.size} selected</span>
            <Button
              variant="secondary"
              onClick={handleInvite}
              loading={isPending}
              disabled={selected.size === 0}
              icon={<Send aria-hidden />}
            >
              {selected.size > 0 ? `Send ${selected.size} ${selected.size === 1 ? 'invite' : 'invites'}` : 'Send invites'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle as="h2">Invitations sent</CardTitle>
          <CardDescription className="num">{invitations.length} sent</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted">
              No invitations yet. Pick vendors and send.
            </p>
          ) : (
            <ul className="space-y-2">
              {invitations.map((inv) => (
                <InvitationRow key={inv.id} invitation={inv} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InvitationRow({ invitation }: { invitation: RfpInvitationRow }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleRevoke() {
    const ok = await confirm({
      title: `Revoke ${invitation.vendor_legal_name}?`,
      description: 'Their bid link will stop working. They can be re-invited later.',
      confirmLabel: 'Revoke invitation',
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await revokeRfpInvitation(invitation.id)
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Invitation revoked.' })
      router.refresh()
    })
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {invitation.vendor_legal_name}
          </p>
          <p className="text-xs text-muted">
            Invited {new Date(invitation.invited_at).toLocaleDateString()}
            {invitation.acknowledged_at
              ? ` · opened ${new Date(invitation.acknowledged_at).toLocaleDateString()}`
              : ' · not opened yet'}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {invitation.has_bid ? (
            invitation.bid_status ? (
              <StatusBadge status={invitation.bid_status} tones={BID_STATUS_TONES} labels={BID_STATUS_LABELS} />
            ) : (
              <StatusPill tone="success" label="Bid received" icon={<UserCheck aria-hidden />} />
            )
          ) : null}
          {!invitation.has_bid ? (
            <Button variant="ghost" size="sm" onClick={handleRevoke} loading={isPending}>
              Revoke
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </li>
  )
}
