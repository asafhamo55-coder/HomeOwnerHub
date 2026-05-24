'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'

// Shared 2-click delete primitive.
//
// First click arms the button (turns red, shows "Click to confirm").
// Second click within 5 seconds actually fires onDelete. Auto-disarms
// at 5s if the user walks away. No modal dependency — replaces the
// useConfirm() pattern that was rendering invisibly in some browser
// + CSS combinations and silently swallowing the delete action.
//
// Use anywhere there's a destructive operation that needs a 1-step
// safety net but doesn't justify a full modal.

type DeleteResult = { ok: true } | { ok: false; error: string }

interface Props {
  onDelete: () => Promise<DeleteResult>
  /** Toast message on success. Default: "Deleted." */
  successMessage?: string
  /** Called after a successful delete (e.g. router.push / router.refresh). */
  onAfterDelete?: () => void
  /** Optional label shown next to the trash icon. Omit for icon-only. */
  label?: string
  size?: 'sm' | 'md' | 'lg'
  /** Button variant in unarmed state. Armed state always uses destructive. */
  variant?: 'ghost' | 'outline' | 'default'
  /** Disabled regardless of armed/pending state. */
  disabled?: boolean
}

export function TwoClickDelete({
  onDelete,
  successMessage = 'Deleted.',
  onAfterDelete,
  label,
  size = 'sm',
  variant = 'outline',
  disabled = false,
}: Props): React.ReactElement {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)

  // Auto-disarm after 5 seconds.
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 5000)
    return () => clearTimeout(timer)
  }, [armed])

  function handleClick() {
    if (disabled || pending) return
    if (!armed) {
      setArmed(true)
      return
    }
    startTransition(async () => {
      const result = await onDelete()
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        setArmed(false)
        return
      }
      toast({ tone: 'success', message: successMessage })
      setArmed(false)
      onAfterDelete?.()
    })
  }

  return (
    <Button
      size={size}
      variant={armed ? 'destructive' : variant}
      onClick={handleClick}
      disabled={disabled || pending}
      title={armed ? 'Click again to confirm delete' : 'Delete'}
    >
      {armed ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="ml-1 text-xs">Click to confirm</span>
        </>
      ) : (
        <>
          <Trash2 className="h-3.5 w-3.5" />
          {label ? <span>{label}</span> : null}
        </>
      )}
    </Button>
  )
}
