'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { deleteProperty } from '@/lib/properties'

export function PropertyActions({ propertyId, address }: { propertyId: string; address: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="secondary">
        <Link href={`/properties/${propertyId}/edit`}>
          <Pencil aria-hidden />
          Edit
        </Link>
      </Button>
      <ConfirmDeleteButton
        title="Delete this property?"
        description={`${address} will be removed from the property list. Its residents, violations and dues stay on file.`}
        confirmLabel="Delete property"
        successMessage="Property deleted."
        label="Delete"
        variant="secondary"
        onDelete={async () => {
          // deleteProperty throws on failure instead of returning {ok, error}.
          try {
            await deleteProperty(propertyId)
            return { ok: true as const }
          } catch {
            return { ok: false as const, error: 'Couldn’t delete the property. Try again.' }
          }
        }}
        onAfterDelete={() => router.push('/properties')}
      />
    </div>
  )
}
