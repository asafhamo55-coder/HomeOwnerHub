'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Pause, Play, Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteEvent, sendTestAlert, toggleEventActive } from '@/lib/events'

export function EventActions({
  eventId,
  isActive,
}: {
  eventId: string
  isActive: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleSendTest() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Send a test alert now?',
        description:
          "We'll email everyone on the board for this HOA right now. The event's 'last alert' fields will update so the cron skips this occurrence.",
        confirmLabel: 'Send test alert',
      })
      if (!ok) return
      const result = await sendTestAlert(eventId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      const { sent, failed } = result.data
      toast({
        tone: sent > 0 ? 'success' : 'info',
        message:
          sent > 0
            ? `Sent ${sent} alert${sent === 1 ? '' : 's'}${failed > 0 ? ` (${failed} failed)` : ''}.`
            : 'No recipients available to alert. Make sure the board has email addresses.',
      })
      router.refresh()
    })
  }

  function handleTogglePause() {
    startTransition(async () => {
      const result = await toggleEventActive(eventId, !isActive)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({
        tone: 'success',
        message: isActive ? 'Event paused.' : 'Event resumed.',
      })
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this event?',
        description:
          "This removes the reminder and its history. You can't undo this — recreate it from scratch if you change your mind.",
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteEvent(eventId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Event deleted.' })
      router.push('/events')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleSendTest}
        disabled={pending}
      >
        <Bell className="h-3.5 w-3.5" />
        Send test alert
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleTogglePause}
        disabled={pending}
      >
        {isActive ? (
          <>
            <Pause className="h-3.5 w-3.5" />
            Pause
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5" />
            Resume
          </>
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleDelete}
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  )
}
