'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast, type ButtonProps } from '@homeowner-portal/ui'

type DeleteResult = { ok: true } | { ok: false; error: string }

/**
 * A delete button that asks first, in the design-system ConfirmDialog
 * (destructive: Cancel is focused, so Enter never deletes by accident).
 *
 * The successor to TwoClickDelete for pages restyled to design system v2:
 * the "click again within 5s" pattern gave no description of what would
 * be lost, and a keyboard user could arm and fire it with two Enters.
 * The dialog stays open with a spinner while `onDelete` runs; a failure
 * toasts and keeps the dialog open so the user can retry or cancel.
 */
export interface ConfirmDeleteButtonProps {
  onDelete: () => Promise<DeleteResult>
  /** Dialog title, e.g. "Delete this meeting?" */
  title: string
  /** What is lost. Shown under the title. */
  description?: React.ReactNode
  confirmLabel?: string
  successMessage?: string
  onAfterDelete?: () => void
  /** Visible label; omit for an icon-only button (then `aria-label` is used). */
  label?: string
  size?: ButtonProps['size']
  variant?: ButtonProps['variant']
  disabled?: boolean
  className?: string
}

export function ConfirmDeleteButton({
  onDelete,
  title,
  description,
  confirmLabel = 'Delete',
  successMessage = 'Deleted.',
  onAfterDelete,
  label,
  size = 'sm',
  variant = 'secondary',
  disabled,
  className,
}: ConfirmDeleteButtonProps) {
  const toast = useToast()
  const iconOnly = !label
  return (
    <ConfirmDialog
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive
      onConfirm={async () => {
        const result = await onDelete()
        if (!result.ok) {
          toast({ tone: 'error', message: result.error })
          throw new Error(result.error)
        }
        toast({ tone: 'success', message: successMessage })
        onAfterDelete?.()
      }}
      trigger={
        <Button
          type="button"
          size={iconOnly ? (size === 'xs' ? 'icon-xs' : 'icon-sm') : size}
          variant={iconOnly ? 'ghost' : variant}
          icon={<Trash2 aria-hidden />}
          aria-label={iconOnly ? title.replace(/\?$/, '') : undefined}
          disabled={disabled}
          className={className}
        >
          {label}
        </Button>
      }
    />
  )
}
