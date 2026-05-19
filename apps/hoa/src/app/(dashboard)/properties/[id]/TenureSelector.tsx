'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Plus } from 'lucide-react'
import { Button, Select, useToast } from '@homeowner-portal/ui'
import { setPropertyTenure, type PropertyTenure } from '@/lib/properties'
import { addToWaitingList } from '@/lib/leases'

const TENURE_OPTIONS: Array<{ value: PropertyTenure; label: string }> = [
  { value: 'owner_occupied', label: 'Owner-occupied' },
  { value: 'leased', label: 'Leased' },
  { value: 'unknown', label: 'Unknown' },
]

interface Props {
  propertyId: string
  currentTenure: PropertyTenure
  capInPlace: boolean
}

export function TenureSelector({
  propertyId,
  currentTenure,
  capInPlace,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<PropertyTenure>(currentTenure)
  const [pending, startTransition] = useTransition()
  const [waitingPending, startWaiting] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await setPropertyTenure({
        propertyId,
        tenure: value,
      })
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Tenure updated.' })
      setEditing(false)
      router.refresh()
    })
  }

  function handleAddWaitingList() {
    startWaiting(async () => {
      const result = await addToWaitingList({ propertyId })
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Added to lease waiting list.' })
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
          Change tenure
        </Button>
        {currentTenure === 'owner_occupied' && capInPlace ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddWaitingList}
            loading={waitingPending}
            disabled={waitingPending}
          >
            <Plus className="h-3.5 w-3.5" />
            Add to waiting list
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={value}
          onValueChange={(v) => setValue(v as PropertyTenure)}
          disabled={pending}
          className="!w-auto"
        >
          {TENURE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={handleSave} loading={pending} disabled={pending}>
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(false)
            setValue(currentTenure)
          }}
          disabled={pending}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  )
}
