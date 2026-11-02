'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button, Checkbox, Dialog, DialogContent, DialogTrigger, Field, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { saveAmenity } from '@/lib/amenities/actions'
import { hourLabel, type Amenity } from '@/lib/amenities/model'

interface Values {
  name: string
  description: string
  rules: string
  requiresApproval: boolean
  openHour: string
  closeHour: string
  maxHours: string
  advanceDays: string
  maxActivePerUnit: string
  isActive: boolean
}

function initialValues(a: Amenity | null): Values {
  return {
    name: a?.name ?? '',
    description: a?.description ?? '',
    rules: a?.rules ?? '',
    requiresApproval: a?.requiresApproval ?? true,
    openHour: String(a?.openHour ?? 8),
    closeHour: String(a?.closeHour ?? 22),
    maxHours: String(a?.maxHours ?? 4),
    advanceDays: String(a?.advanceDays ?? 60),
    maxActivePerUnit: String(a?.maxActivePerUnit ?? 2),
    isActive: a?.isActive ?? true,
  }
}

const OPEN_HOURS = Array.from({ length: 24 }, (_, i) => i)
const CLOSE_HOURS = Array.from({ length: 24 }, (_, i) => i + 1)

/** Add an amenity, or change one. The server checks everything again. */
export function AmenityDialog({ amenity }: { amenity: Amenity | null }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Values>(() => initialValues(amenity))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const formId = `amenity-${amenity?.id ?? 'new'}`

  const set =
    <K extends keyof Values>(key: K) =>
    (v: Values[K]) => {
      setValues((prev) => ({ ...prev, [key]: v }))
      if (errors[key]) setErrors(({ [key]: _gone, ...rest }) => rest)
    }
  const text = (key: Exclude<keyof Values, 'requiresApproval' | 'isActive'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key)(e.currentTarget.value)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveAmenity({
        id: amenity?.id ?? null,
        amenity: {
          name: values.name,
          description: values.description,
          rules: values.rules,
          requiresApproval: values.requiresApproval,
          openHour: Number(values.openHour),
          closeHour: Number(values.closeHour),
          maxHours: Number(values.maxHours),
          advanceDays: Number(values.advanceDays),
          maxActivePerUnit: Number(values.maxActivePerUnit),
          isActive: values.isActive,
        },
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        if (!res.fieldErrors) toast({ tone: 'error', message: res.error })
        return
      }
      setErrors({})
      setOpen(false)
      toast({ tone: 'success', message: amenity ? 'Amenity updated.' : 'Amenity added.' })
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        if (next) setValues(initialValues(amenity))
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        {amenity ? (
          <Button variant="ghost" size="sm" icon={<Pencil aria-hidden />}>
            Edit
          </Button>
        ) : (
          <Button icon={<Plus aria-hidden />}>Add an amenity</Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={amenity ? 'Edit amenity' : 'Add an amenity'}
        description="Residents pick a day and hours that fit these rules. Two bookings can never overlap."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Save
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" required error={errors.name} hint="For example: Clubhouse, Pool pavilion, Tennis court.">
              <Input value={values.name} onChange={text('name')} disabled={pending} autoComplete="off" />
            </Field>
          </div>
          <Field label="Opens at" required error={errors.openHour}>
            <Select value={values.openHour} onValueChange={set('openHour')} disabled={pending}>
              {OPEN_HOURS.map((h) => (
                <option key={h} value={String(h)}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Closes at" required error={errors.closeHour}>
            <Select value={values.closeHour} onValueChange={set('closeHour')} disabled={pending}>
              {CLOSE_HOURS.map((h) => (
                <option key={h} value={String(h)}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Longest booking, in hours" required error={errors.maxHours}>
            <Input value={values.maxHours} onChange={text('maxHours')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Book how many days ahead" required error={errors.advanceDays}>
            <Input value={values.advanceDays} onChange={text('advanceDays')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Bookings one home can hold at a time" required error={errors.maxActivePerUnit}>
            <Input value={values.maxActivePerUnit} onChange={text('maxActivePerUnit')} inputMode="numeric" disabled={pending} />
          </Field>
          <div className="flex items-end">
            <Checkbox
              label="The board approves each booking"
              description="Off: bookings are confirmed right away."
              checked={values.requiresApproval}
              onChange={(e) => set('requiresApproval')(e.currentTarget.checked)}
              disabled={pending}
            />
          </div>
          <div className="sm:col-span-2">
            <Field label="About it" optional error={errors.description}>
              <Textarea value={values.description} onChange={text('description')} rows={2} disabled={pending} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Rules residents must follow" optional error={errors.rules} hint="Cleanup, guests, noise, alcohol, anything the board requires.">
              <Textarea value={values.rules} onChange={text('rules')} rows={4} disabled={pending} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Checkbox
              label="Open for booking"
              description="Turn this off to stop new bookings. Existing ones stay."
              checked={values.isActive}
              onChange={(e) => set('isActive')(e.currentTarget.checked)}
              disabled={pending}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
