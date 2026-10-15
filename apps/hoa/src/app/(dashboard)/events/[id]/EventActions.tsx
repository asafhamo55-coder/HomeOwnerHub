'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, MoreHorizontal, Pause, Play } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { deleteEvent, sendTestAlert, toggleEventActive } from '@/lib/events'

export function EventActions({ eventId, isActive }: { eventId: string; isActive: boolean }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  // Confirm first, transition second: awaiting the dialog inside a
  // transition defers its open commit and the dialog never appears.
  async function handleSendTest() {
    const ok = await confirm({
      title: 'Send a test alert now?',
      description:
        "We'll notify this event's configured audience on its configured channels right now. The event's 'last alert' fields will update so the scheduled run skips this occurrence.",
      confirmLabel: 'Send test alert',
    })
    if (!ok) return
    startTransition(async () => {
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
            : 'No recipients available to alert. Check the event audience has contact info on file.',
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
      toast({ tone: 'success', message: isActive ? 'Reminders paused.' : 'Reminders resumed.' })
      router.refresh()
    })
  }

  return (
    <>
      <ConfirmDeleteButton
        onDelete={() => deleteEvent(eventId)}
        title="Delete this event?"
        description="This removes the reminder and its history. You can't undo this — recreate it from scratch if you change your mind."
        confirmLabel="Delete event"
        successMessage="Event deleted."
        onAfterDelete={() => router.push('/events')}
        label="Delete"
        variant="destructive-ghost"
        size="md"
        disabled={pending}
      />
      <Button
        variant="secondary"
        onClick={handleTogglePause}
        loading={pending}
        icon={isActive ? <Pause aria-hidden /> : <Play aria-hidden />}
      >
        {isActive ? 'Pause reminders' : 'Resume reminders'}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More actions" disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={<Bell aria-hidden />} onSelect={() => void handleSendTest()}>
            Send test alert now
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
