'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, UserCheck } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import {
  inviteVendorsToRfp,
  revokeRfpInvitation,
  type InvitableVendor,
  type RfpInvitationRow,
} from '@/lib/rfp-invitations'

const COMPLIANCE_VARIANT: Record<
  NonNullable<InvitableVendor['compliance_status']>,
  'success' | 'warning' | 'destructive' | 'outline'
> = {
  green: 'success',
  yellow: 'warning',
  red: 'destructive',
  missing: 'outline',
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
    failed: Array<{ vendorId: string; reason: string }>
  } | null>(null)

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
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite vendors</CardTitle>
          <p className="text-xs text-muted">
            Pick vendors to invite. Each gets a unique email link to submit
            their bid. Vendors without a primary email are skipped.
          </p>
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
                      className={`flex items-start gap-3 rounded-md border p-2 transition-colors ${
                        isSelected
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-border hover:bg-foreground/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-border"
                        checked={isSelected}
                        onChange={() => toggle(v.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {v.legal_name}
                        </p>
                        <p className="text-xs text-muted">
                          {(v.trades ?? []).join(', ') || 'No trades on file'}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        {v.compliance_status ? (
                          <Badge variant={COMPLIANCE_VARIANT[v.compliance_status]} size="sm">
                            {v.compliance_status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" size="sm">
                            no review
                          </Badge>
                        )}
                        <Badge variant="outline" size="sm">
                          {v.status}
                        </Badge>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {summary ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Sent {summary.sent}{summary.skipped > 0 ? `, skipped ${summary.skipped} already invited` : ''}
              {summary.failed.length > 0 ? (
                <>
                  , {summary.failed.length} failed
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {summary.failed.map((f) => (
                      <li key={f.vendorId}>{f.reason}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              onClick={handleInvite}
              disabled={isPending || selected.size === 0}
            >
              <Send className="h-4 w-4" />
              {isPending ? 'Sending…' : `Send ${selected.size || ''}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Invitations sent ({invitations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted">
              No invitations yet. Pick vendors on the left and send.
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
    <li className="rounded-md border border-border bg-foreground/10 p-2">
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
            <Badge variant="success" size="sm">
              <UserCheck className="mr-1 h-3 w-3" />
              {invitation.bid_status}
            </Badge>
          ) : null}
          {!invitation.has_bid ? (
            <Button variant="outline" size="sm" onClick={handleRevoke} disabled={isPending}>
              {isPending ? '…' : 'Revoke'}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </li>
  )
}
