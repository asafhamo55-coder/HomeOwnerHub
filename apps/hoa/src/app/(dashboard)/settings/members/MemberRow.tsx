'use client'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, Trash2 } from 'lucide-react'
import { Avatar, Button, Select, StatusPill, useConfirm, type StatusTone } from '@homeowner-portal/ui'
import { changeMemberRole, removeMember, type MemberRole, type MemberRow as MemberRowType } from '@/lib/members'
import type { ConsentState } from '@/lib/email-consent'
import { ConsentStatus } from '@/components/consent/ConsentStatus'
import { RecordConsentDialog } from '@/components/consent/RecordConsentDialog'

const ROLE_TONE: Record<MemberRole, StatusTone> = {
  admin: 'brand',
  board: 'info',
  resident: 'neutral',
}

const ROLE_LABEL: Record<MemberRole, string> = {
  admin: 'Admin',
  board: 'Board',
  resident: 'Resident',
}

export function MemberRow({
  member,
  isSelf,
  viewerRole,
  consent,
}: {
  member: MemberRowType
  isSelf: boolean
  viewerRole: 'admin' | 'board'
  /**
   * BL-020 (M1): the member's newest consent event, null = none on record.
   * Omitted (undefined) until M1_APPLIED — the row is then exactly as before.
   */
  consent?: ConsentState | null
}) {
  // Mirrors 0058: only admins change roles; board can remove residents only.
  const canChangeRole = viewerRole === 'admin'
  const canRemove = !isSelf && (viewerRole === 'admin' || member.role === 'resident')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  function handleRoleChange(role: MemberRole) {
    if (role === member.role) return
    setError(null)
    startTransition(async () => {
      const result = await changeMemberRole(member.user_id, role)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  async function handleRemove() {
    if (isSelf) return
    const ok = await confirm({
      title: 'Remove member?',
      description: `${member.email ?? 'This member'} will lose access to this HOA.`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await removeMember(member.user_id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const displayName = member.full_name ?? member.email ?? 'Unknown user'

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <Avatar name={displayName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {displayName}
          {isSelf ? <span className="ml-1.5 text-xs font-normal text-muted">(you)</span> : null}
        </p>
        {member.full_name && member.email ? <p className="truncate text-xs text-muted">{member.email}</p> : null}
        {member.linkedProperty ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
            <Home className="size-3" aria-hidden />
            <Link
              href={propertyHref(asPropertyId(member.linkedProperty.propertyId))}
              className="font-medium text-foreground hover:text-primary hover:underline"
            >
              {member.linkedProperty.address}
              {member.linkedProperty.unitNumber ? ` · ${member.linkedProperty.unitNumber}` : ''}
            </Link>
            <span>({member.linkedProperty.residencyRole.replace('_', ' ')})</span>
          </p>
        ) : null}
        {consent !== undefined ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ConsentStatus state={consent} />
            <RecordConsentDialog
              userId={member.user_id}
              memberName={displayName}
              currentlyGranted={consent?.granted === true}
              size="xs"
            />
          </div>
        ) : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canChangeRole ? (
          <Select
            value={member.role}
            onValueChange={(v) => handleRoleChange(v as MemberRole)}
            disabled={isPending}
            variant="ghost"
            className="!w-auto"
            aria-label={`Role for ${displayName}`}
          >
            <option value="admin">Admin</option>
            <option value="board">Board</option>
            <option value="resident">Resident</option>
          </Select>
        ) : (
          <StatusPill tone={ROLE_TONE[member.role]} icon={null} label={ROLE_LABEL[member.role]} />
        )}
        {canRemove ? (
          <Button
            variant="destructive-ghost"
            size="icon-sm"
            onClick={handleRemove}
            loading={isPending}
            aria-label={`Remove ${displayName}`}
            icon={<Trash2 aria-hidden />}
          />
        ) : null}
      </div>
    </li>
  )
}
