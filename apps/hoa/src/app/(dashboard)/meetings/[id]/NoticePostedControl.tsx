'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { Button, Field, Input } from '@homeowner-portal/ui'
import { recordMeetingNoticePosted } from '@/lib/meetings'
import { formatDateTime } from '@/lib/format-datetime'

/**
 * BL-050 (M1): record when this meeting's notice was posted
 * (hoa_meeting_minutes.notice_posted_at) so /legal/compliance checks
 * Florida's 14-day / 48-hour rule (§720.303(2)) against the real date.
 * Rendered only once M1_APPLIED.
 */
export function NoticePostedControl({ meetingId, postedAt }: { meetingId: string; postedAt: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(iso: string | null) {
    setError(null)
    startTransition(async () => {
      const res = await recordMeetingNoticePosted(meetingId, iso)
      if (!res.ok) {
        setError(res.error ?? 'Couldn’t save the notice date. Try again.')
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function saveTyped() {
    // datetime-local is the board member's local wall time.
    const t = value ? new Date(value) : null
    if (!t || Number.isNaN(t.getTime())) {
      setError('Enter a valid date and time.')
      return
    }
    save(t.toISOString())
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground">
        {postedAt ? `Posted ${formatDateTime(postedAt)}` : 'Not recorded'}
      </p>
      {editing ? (
        <div className="space-y-2">
          <Field label="When was the notice posted?">
            <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} disabled={pending} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveTyped} loading={pending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Megaphone aria-hidden />} onClick={() => save(new Date().toISOString())} loading={pending}>
            Mark notice posted
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={pending}>
            {postedAt ? 'Change date' : 'Enter a date'}
          </Button>
          {postedAt ? (
            <Button size="sm" variant="ghost" onClick={() => save(null)} disabled={pending}>
              Clear
            </Button>
          ) : null}
        </div>
      )}
      <p className="text-xs text-muted">Florida: post 14 days before an owners’ meeting, 48 hours before a board meeting.</p>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
