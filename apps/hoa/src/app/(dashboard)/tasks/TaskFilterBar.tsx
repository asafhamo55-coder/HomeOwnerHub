'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Field, Select } from '@homeowner-portal/ui'

interface TaskFilterBarProps {
  assignee: string
  meeting: string
  /** null when the board member list could not be read. */
  assignees: Array<{ userId: string; name: string }> | null
  meetings: Array<{ id: string; label: string }>
}

/** Assignee and meeting filters, kept in the URL so a filtered view can be shared or bookmarked. */
export function TaskFilterBar({ assignee, meeting, assignees, meetings }: TaskFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function set(key: 'assignee' | 'meeting', value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Assigned to" className="w-full sm:w-56">
        <Select value={assignee} onValueChange={(v) => set('assignee', v)}>
          <option value="all">Everyone</option>
          <option value="me">My tasks</option>
          <option value="unassigned">Unassigned</option>
          {(assignees ?? []).map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Meeting" className="w-full sm:w-72">
        <Select value={meeting} onValueChange={(v) => set('meeting', v)}>
          <option value="all">All meetings</option>
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}
