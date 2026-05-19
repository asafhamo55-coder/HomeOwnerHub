'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Badge, Button, Select } from '@homeowner-portal/ui'
import { changeMemberRole, removeMember, type MemberRole, type MemberRow as MemberRowType } from '@/lib/members'

const ROLE_VARIANT: Record<MemberRole, 'default' | 'success' | 'outline'> = {
  admin: 'success',
  board: 'default',
  resident: 'outline',
}

export function MemberRow({ member, isSelf }: { member: MemberRowType; isSelf: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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

  function handleRemove() {
    if (isSelf) return
    if (!window.confirm(`Remove ${member.email ?? 'this member'} from the HOA?`)) return
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

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {member.full_name ?? member.email ?? '(unknown user)'}
          {isSelf ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
        </p>
        {member.full_name && member.email ? (
          <p className="text-xs text-muted">{member.email}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <Select
          value={member.role}
          onValueChange={(v) => handleRoleChange(v as MemberRole)}
          disabled={isPending}
          variant="ghost"
          className="!w-auto text-xs"
        >
          <option value="admin">Admin</option>
          <option value="board">Board</option>
          <option value="resident">Resident</option>
        </Select>
        <Badge variant={ROLE_VARIANT[member.role]} size="sm">
          {member.role}
        </Badge>
        {!isSelf ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={isPending}
            aria-label="Remove member"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}
