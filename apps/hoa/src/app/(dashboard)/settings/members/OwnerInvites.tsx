'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MailPlus, RotateCw, XCircle } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import {
  inviteAllOwners,
  previewOwnerInvites,
  resendInvitation,
  revokeInvitation,
  type OwnerInviteOutcome,
} from '@/lib/owner-invites-actions'
import type { PendingInvitation } from '@/lib/owner-invites'
import { formatShortDate } from '@/lib/format-datetime'

// BL-128: "Invite all owners without an account" (preview → confirm →
// one batch), and the pending-invitation list with Resend and Revoke.

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function summarizeOutcome(o: OwnerInviteOutcome): string {
  const parts: string[] = []
  if (o.invited) parts.push(`${plural(o.invited, 'invitation')} sent`)
  if (o.failed) parts.push(`${o.failed} couldn’t be invited`)
  if (o.held) parts.push(`${o.held} held back by test mode`)
  if (o.rateLimited) parts.push('email paused for now; try the rest in a few minutes')
  else if (o.remaining) parts.push(`${o.remaining} left for the next batch`)
  return parts.length ? `${parts.join(' · ')}.` : 'Nothing to send.'
}

export function InviteAllOwners({ total, held }: { total: number | null; held: number }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  function run() {
    setError(null)
    setResult(null)
    startTransition(async () => {
      const preview = await previewOwnerInvites()
      if (!preview.ok) {
        setError(preview.error)
        return
      }
      const p = preview.data
      if (p.sendNow === 0) {
        setResult(
          p.total === 0
            ? 'Every owner with an email on file already has an account or an invitation.'
            : `${plural(p.held, 'owner')} can’t be emailed in test mode, so nothing was sent.`,
        )
        return
      }
      const ok = await confirm({
        title: `Invite ${plural(p.sendNow, 'owner')} to the portal?`,
        description: (
          <span className="block space-y-2">
            <span className="block">
              Each gets the same invitation email as a single invite, and their account is linked to the home they own
              on file.
            </span>
            {p.remaining > 0 ? (
              <span className="block">
                {plural(p.total, 'owner')} have no account. Invitations go out {p.sendNow} at a time; send the next{' '}
                {p.remaining} after this.
              </span>
            ) : null}
            {p.held > 0 ? <span className="block">{plural(p.held, 'owner')} will be skipped (test mode).</span> : null}
          </span>
        ),
        confirmLabel: `Send ${plural(p.sendNow, 'invitation')}`,
      })
      if (!ok) return
      const sent = await inviteAllOwners(p.sendNow)
      if (!sent.ok) {
        setError(sent.error)
        return
      }
      const text = summarizeOutcome(sent.data)
      setResult(text)
      toast({ tone: sent.data.failed ? 'warning' : 'success', message: text })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-secondary">
        {total === null
          ? 'We couldn’t count owners without an account right now.'
          : total === 0
            ? 'Every owner with an email on file already has an account or an invitation.'
            : `${plural(total, 'owner')} with an email on file ${total === 1 ? 'has' : 'have'} no portal account yet.`}
        {held > 0 && total ? ` ${held} can’t be emailed in test mode.` : ''}
      </p>
      <Button type="button" onClick={run} loading={isPending} disabled={!total} icon={<MailPlus aria-hidden />}>
        Invite all owners without an account
      </Button>
      {result ? <p className="text-sm text-foreground">{result}</p> : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function PendingInvitations({
  invitations,
  viewerRole,
}: {
  invitations: PendingInvitation[]
  viewerRole: 'admin' | 'board'
}) {
  if (invitations.length === 0) {
    return <p className="text-sm text-muted">No pending invitations. Everyone invited has signed in.</p>
  }
  return (
    <ul className="divide-y divide-border">
      {invitations.map((inv) => (
        <PendingRow key={inv.userId} inv={inv} canManage={viewerRole === 'admin' || inv.role === 'resident'} />
      ))}
    </ul>
  )
}

function PendingRow({ inv, canManage }: { inv: PendingInvitation; canManage: boolean }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const who = inv.name || inv.email || 'This person'

  function resend() {
    setError(null)
    startTransition(async () => {
      const r = await resendInvitation(inv.userId)
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast({ tone: 'success', message: 'Invitation sent again.' })
      router.refresh()
    })
  }

  async function revoke() {
    const ok = await confirm({
      title: 'Revoke this invitation?',
      description: `${who} won’t be able to use the invitation link. Their name and email stay on the roster, so you can invite them again later.`,
      confirmLabel: 'Revoke',
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const r = await revokeInvitation(inv.userId)
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast({ tone: 'success', message: 'Invitation revoked.' })
      router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{inv.name || inv.email || 'Unknown'}</p>
        <p className="truncate text-xs text-muted">
          {inv.name && inv.email ? `${inv.email} · ` : ''}
          {inv.role === 'resident' ? 'Resident' : inv.role === 'board' ? 'Board' : 'Admin'}
          {inv.invitedAt ? ` · invited ${formatShortDate(inv.invitedAt)}` : ''}
        </p>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
      {canManage ? (
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="outline" onClick={resend} disabled={isPending} icon={<RotateCw aria-hidden />}>
            Resend
          </Button>
          <Button type="button" size="sm" variant="destructive-ghost" onClick={revoke} disabled={isPending} icon={<XCircle aria-hidden />}>
            Revoke
          </Button>
        </div>
      ) : null}
    </li>
  )
}
