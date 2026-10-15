'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteViolation } from '@/lib/violations'

export function ViolationActions({ violationId }: { violationId: string }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <>
      <ConfirmDialog
        title="Delete this violation?"
        description="It disappears from the violations list, the property record and exports. Notices already sent to the owner are not recalled."
        confirmLabel="Delete violation"
        destructive
        onConfirm={async () => {
          const result = await deleteViolation(violationId)
          if (!result.ok) {
            toast({ tone: 'error', message: result.error })
            throw new Error(result.error)
          }
          toast({ tone: 'success', message: 'Violation deleted.' })
          router.push('/violations')
        }}
        trigger={
          <Button variant="destructive-ghost" icon={<Trash2 aria-hidden />}>
            Delete
          </Button>
        }
      />
      <Button asChild variant="secondary">
        <Link href={`/violations/${violationId}/edit`}>
          <Pencil aria-hidden />
          Edit details
        </Link>
      </Button>
    </>
  )
}
