'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@homeowner-portal/ui'
import { setDocumentVisibleToOwners } from '@/lib/document-owner-visibility'
import type { DocSource } from '@/lib/resident-documents/visibility'

/**
 * BL-052: the board's "Visible to owners" switch for one document. Rendered
 * only once M1_APPLIED and only for a type that is not always visible
 * (the caller decides — see ownerVisibility()). Flips optimistically and
 * rolls back on failure.
 */
export function OwnerVisibilitySwitch({
  documentId,
  source,
  initial,
  label = 'Visible to owners',
  description,
  size = 'md',
}: {
  documentId: string
  source: DocSource
  initial: boolean
  label?: string
  description?: string
  size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    setError(null)
    setChecked(next)
    startTransition(async () => {
      const res = await setDocumentVisibleToOwners(documentId, next, source)
      if (!res.ok) {
        setChecked(!next)
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <Switch
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
        disabled={pending}
        label={label}
        description={description}
        size={size}
      />
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
