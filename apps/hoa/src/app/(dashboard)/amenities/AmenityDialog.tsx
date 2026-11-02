'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button, Checkbox, Dialog, DialogContent, DialogTrigger, Field, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { saveAmenity } from '@/lib/amenities/actions'
import { hourLabel, weekdayName, type Amenity } from '@/lib/amenities/model'

export interface AssociationOption {
  id: string
  name: string
}

interface DayRow {
  open: boolean
  openHour: string
  closeHour: string
}

interface BlackoutRow {
  startsOn: string
  endsOn: string
  reason: string
}

interface Values {
  associationId: string
  name: string
  description: string
  rules: string
  requiresApproval: boolean
  openHour: string
  closeHour: string
  differentByDay: boolean
  days: DayRow[]
  blackouts: BlackoutRow[]
  maxHours: string
  advanceDays: string
  maxActivePerUnit: string
  capacity: string
  concurrentLimit: string
  minNoticeHours: string
  cancelCutoffHours: string
  isActive: boolean
}

function initialValues(a: Amenity | null, associations: AssociationOption[]): Values {
  const open = String(a?.openHour ?? 8)
  const close = String(a?.closeHour ?? 22)
  return {
    associationId: associations[0]?.id ?? '',
    name: a?.name ?? '',
    description: a?.description ?? '',
    rules: a?.rules ?? '',
    requiresApproval: a?.requiresApproval ?? true,
    openHour: open,
    closeHour: close,
    differentByDay: Boolean(a?.weeklyHours),
    days: Array.from({ length: 7 }, (_, d) => {
      const h = a?.weeklyHours?.[d]
      return { open: a?.weeklyHours ? Boolean(h) : true, openHour: String(h?.open ?? a?.openHour ?? 8), closeHour: String(h?.close ?? a?.closeHour ?? 22) }
    }),
    blackouts: (a?.blackouts ?? []).map((b) => ({ startsOn: b.startsOn, endsOn: b.endsOn, reason: b.reason ?? '' })),
    maxHours: String(a?.maxHours ?? 4),
    advanceDays: String(a?.advanceDays ?? 60),
    maxActivePerUnit: String(a?.maxActivePerUnit ?? 2),
    capacity: a?.capacity ? String(a.capacity) : '',
    concurrentLimit: String(a?.concurrentLimit ?? 1),
    minNoticeHours: String(a?.minNoticeHours ?? 0),
    cancelCutoffHours: String(a?.cancelCutoffHours ?? 0),
    isActive: a?.isActive ?? true,
  }
}

const OPEN_HOURS = Array.from({ length: 24 }, (_, i) => i)
const CLOSE_HOURS = Array.from({ length: 24 }, (_, i) => i + 1)
const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))

/** Add an amenity, or change one. The server checks everything again. */
export function AmenityDialog({ amenity, associations = [] }: { amenity: Amenity | null; associations?: AssociationOption[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Values>(() => initialValues(amenity, associations))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [affected, setAffected] = useState<number | null>(null)
  const [choice, setChoice] = useState<'keep' | 'cancel'>('keep')
  const [affectedNote, setAffectedNote] = useState('')
  const [pending, startTransition] = useTransition()
  const formId = `amenity-${amenity?.id ?? 'new'}`

  const set =
    <K extends keyof Values>(key: K) =>
    (v: Values[K]) => {
      setValues((prev) => ({ ...prev, [key]: v }))
      if (errors[key]) setErrors(({ [key]: _gone, ...rest }) => rest)
      setAffected(null)
    }
  const text = (key: 'name' | 'description' | 'rules' | 'maxHours' | 'advanceDays' | 'maxActivePerUnit' | 'capacity' | 'concurrentLimit' | 'minNoticeHours' | 'cancelCutoffHours') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key)(e.currentTarget.value)

  function setDay(i: number, patch: Partial<DayRow>) {
    set('days')(values.days.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  }
  function setBlackout(i: number, patch: Partial<BlackoutRow>) {
    set('blackouts')(values.blackouts.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  }

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
          capacity: values.capacity.trim() === '' ? null : num(values.capacity),
          concurrentLimit: num(values.concurrentLimit),
          minNoticeHours: num(values.minNoticeHours),
          cancelCutoffHours: num(values.cancelCutoffHours),
          weeklyHours: values.differentByDay
            ? values.days.flatMap((d, weekday) => (d.open ? [{ weekday, openHour: Number(d.openHour), closeHour: Number(d.closeHour) }] : []))
            : null,
          blackouts: values.blackouts
            .filter((b) => b.startsOn)
            .map((b) => ({ startsOn: b.startsOn, endsOn: b.endsOn || b.startsOn, reason: b.reason })),
          ...(amenity ? {} : { associationId: values.associationId || undefined }),
          ...(affected !== null ? { affected: choice, affectedNote } : {}),
        },
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        if (res.affected !== undefined) setAffected(res.affected)
        if (!res.fieldErrors || res.affected !== undefined) toast({ tone: 'error', message: res.error })
        return
      }
      setErrors({})
      setAffected(null)
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
        if (next) {
          setValues(initialValues(amenity, associations))
          setAffected(null)
          setErrors({})
        }
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
        description="Residents pick a day and a free time that fit these rules. Two bookings can never overlap."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {affected !== null ? (choice === 'cancel' ? 'Save and cancel them' : 'Save and keep them') : 'Save'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          {affected !== null ? (
            <div className="space-y-3 rounded-lg border border-warning/25 bg-warning-subtle p-4 sm:col-span-2" role="alert">
              <p className="text-base font-semibold text-foreground">
                This change affects {affected === 1 ? '1 booking' : `${affected} bookings`}.
              </p>
              <p className="text-base text-foreground-secondary">Choose what happens to them. Nothing is canceled unless you choose that.</p>
              <div className="space-y-2">
                <Checkbox
                  label="Keep them as they are"
                  checked={choice === 'keep'}
                  onChange={() => setChoice('keep')}
                  disabled={pending}
                />
                <Checkbox
                  label="Cancel them and tell each resident"
                  checked={choice === 'cancel'}
                  onChange={() => setChoice('cancel')}
                  disabled={pending}
                />
              </div>
              {choice === 'cancel' ? (
                <Field label="Note for the residents" required error={errors.affectedNote}>
                  <Input value={affectedNote} onChange={(e) => setAffectedNote(e.currentTarget.value)} disabled={pending} autoComplete="off" />
                </Field>
              ) : null}
            </div>
          ) : null}
          {!amenity && associations.length > 1 ? (
            <div className="sm:col-span-2">
              <Field label="Which community is this for?" required error={errors.associationId}>
                <Select value={values.associationId} onValueChange={set('associationId')} disabled={pending}>
                  {associations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Field label="Name" required error={errors.name} hint="For example: Clubhouse, Pool pavilion, Tennis court.">
              <Input value={values.name} onChange={text('name')} disabled={pending} autoComplete="off" />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Checkbox
              label="Different hours on different days"
              description="Off: the same hours every day."
              checked={values.differentByDay}
              onChange={(e) => set('differentByDay')(e.currentTarget.checked)}
              disabled={pending}
            />
          </div>
          {values.differentByDay ? (
            <div className="space-y-3 sm:col-span-2">
              {values.days.map((d, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[10rem_1fr_1fr]">
                  <Checkbox label={weekdayName(i)} checked={d.open} onChange={(e) => setDay(i, { open: e.currentTarget.checked })} disabled={pending} />
                  {d.open ? (
                    <>
                      <Field label="Opens at">
                        <Select value={d.openHour} onValueChange={(v) => setDay(i, { openHour: v })} disabled={pending}>
                          {OPEN_HOURS.map((h) => (
                            <option key={h} value={String(h)}>
                              {hourLabel(h)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Closes at">
                        <Select value={d.closeHour} onValueChange={(v) => setDay(i, { closeHour: v })} disabled={pending}>
                          {CLOSE_HOURS.map((h) => (
                            <option key={h} value={String(h)}>
                              {hourLabel(h)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </>
                  ) : (
                    <p className="text-base text-foreground-secondary sm:col-span-2">Closed</p>
                  )}
                </div>
              ))}
              {errors.weeklyHours ? <p className="text-base text-danger" role="alert">{errors.weeklyHours}</p> : null}
            </div>
          ) : (
            <>
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
            </>
          )}

          <Field label="Longest booking, in hours" required error={errors.maxHours} hint="On the days clocks change, a booking can be an hour longer or shorter in real time.">
            <Input value={values.maxHours} onChange={text('maxHours')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Book how many days ahead" required error={errors.advanceDays}>
            <Input value={values.advanceDays} onChange={text('advanceDays')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Bookings one home can hold at a time" required error={errors.maxActivePerUnit}>
            <Input value={values.maxActivePerUnit} onChange={text('maxActivePerUnit')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Most people at once" optional error={errors.capacity} hint="Leave empty for no limit.">
            <Input value={values.capacity} onChange={text('capacity')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="How many bookings at the same time" required error={errors.concurrentLimit} hint="1 for a room. 4 for four tennis courts listed as one.">
            <Input value={values.concurrentLimit} onChange={text('concurrentLimit')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Book at least this many hours ahead" required error={errors.minNoticeHours} hint="0 means no minimum.">
            <Input value={values.minNoticeHours} onChange={text('minNoticeHours')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Residents can cancel until this many hours before" required error={errors.cancelCutoffHours} hint="0 means any time before it starts. After that they ask the board.">
            <Input value={values.cancelCutoffHours} onChange={text('cancelCutoffHours')} inputMode="numeric" disabled={pending} />
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

          <div className="space-y-3 sm:col-span-2">
            <p className="text-base font-semibold text-foreground">Closed dates</p>
            <p className="text-base text-foreground-secondary">Days the space cannot be booked, like winter for a pool or election night.</p>
            {values.blackouts.map((b, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                <Field label="First day">
                  <Input type="date" value={b.startsOn} onChange={(e) => setBlackout(i, { startsOn: e.currentTarget.value })} disabled={pending} />
                </Field>
                <Field label="Last day">
                  <Input type="date" value={b.endsOn} onChange={(e) => setBlackout(i, { endsOn: e.currentTarget.value })} disabled={pending} />
                </Field>
                <Field label="Why (optional)">
                  <Input value={b.reason} onChange={(e) => setBlackout(i, { reason: e.currentTarget.value })} disabled={pending} autoComplete="off" />
                </Field>
                <Button type="button" variant="ghost" onClick={() => set('blackouts')(values.blackouts.filter((_, j) => j !== i))} disabled={pending}>
                  Remove
                </Button>
              </div>
            ))}
            {errors.blackouts ? <p className="text-base text-danger" role="alert">{errors.blackouts}</p> : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => set('blackouts')([...values.blackouts, { startsOn: '', endsOn: '', reason: '' }])}
              disabled={pending}
            >
              Add a closed date
            </Button>
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
