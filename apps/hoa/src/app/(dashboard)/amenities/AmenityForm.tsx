'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ChoiceGroup,
  Field,
  Fieldset,
  Input,
  Radio,
  Select,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
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

/** Where each server field error shows, for the summary links. */
const FIELD_TARGETS: Record<string, { label: string; id: string; more?: boolean }> = {
  associationId: { label: 'Community', id: 'amenity-association' },
  name: { label: 'Name', id: 'amenity-name' },
  description: { label: 'About it', id: 'amenity-about' },
  openHour: { label: 'Opens at', id: 'amenity-open' },
  closeHour: { label: 'Closes at', id: 'amenity-close' },
  weeklyHours: { label: 'Hours by day', id: 'amenity-weekly' },
  maxHours: { label: 'Longest booking', id: 'amenity-max-hours' },
  advanceDays: { label: 'How far ahead', id: 'amenity-advance' },
  maxActivePerUnit: { label: 'Bookings per home', id: 'amenity-per-home', more: true },
  capacity: { label: 'People at once', id: 'amenity-capacity', more: true },
  concurrentLimit: { label: 'Bookings at the same time', id: 'amenity-concurrent', more: true },
  minNoticeHours: { label: 'Minimum notice', id: 'amenity-notice', more: true },
  cancelCutoffHours: { label: 'Cancel cutoff', id: 'amenity-cutoff', more: true },
  blackouts: { label: 'Closed dates', id: 'amenity-closed' },
  rules: { label: 'Rules for residents', id: 'amenity-rules' },
  affectedNote: { label: 'Note for the residents', id: 'amenity-affected-note' },
}

function HourSelect({ value, onChange, list, disabled, id }: { value: string; onChange: (v: string) => void; list: number[]; disabled: boolean; id?: string }) {
  return (
    <Select id={id} value={value} onValueChange={onChange} disabled={disabled}>
      {list.map((h) => (
        <option key={h} value={String(h)}>
          {hourLabel(h)}
        </option>
      ))}
    </Select>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle as="h2">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/** Add an amenity, or change one. The server checks everything again. */
export function AmenityForm({ amenity, associations = [] }: { amenity: Amenity | null; associations?: AssociationOption[] }) {
  const router = useRouter()
  const toast = useToast()
  const [values, setValues] = useState<Values>(() => initialValues(amenity, associations))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState<{ title: string; message: string; links: { label: string; id: string }[] } | null>(null)
  const [affected, setAffected] = useState<number | null>(null)
  const [choice, setChoice] = useState<'keep' | 'cancel'>('keep')
  const [affectedNote, setAffectedNote] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const summaryRef = useRef<HTMLDivElement>(null)

  // A failed save moves focus to the summary so a screen reader and a
  // keyboard user land on what went wrong.
  useEffect(() => {
    if (summary) summaryRef.current?.focus()
  }, [summary])

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

  function goTo(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      const el = document.getElementById(id)
      el?.scrollIntoView?.({ block: 'center' })
      el?.focus()
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setSummary(null)
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
        const fe = res.fieldErrors ?? {}
        setErrors(fe)
        if (res.affected !== undefined) setAffected(res.affected)
        const links = Object.keys(fe).flatMap((k) => (FIELD_TARGETS[k] ? [{ label: FIELD_TARGETS[k].label, id: FIELD_TARGETS[k].id }] : []))
        if (Object.keys(fe).some((k) => FIELD_TARGETS[k]?.more)) setMoreOpen(true)
        if (res.affected !== undefined) links.unshift({ label: 'Choose what happens to the bookings', id: 'amenity-affected' })
        setSummary({
          title: res.affected !== undefined ? 'One more step before saving' : 'This amenity was not saved',
          message: res.error,
          links,
        })
        return
      }
      setErrors({})
      setAffected(null)
      toast({ tone: 'success', message: amenity ? 'Amenity updated.' : 'Amenity added.' })
      router.push('/amenities')
    })
  }

  const dayPlural = (n: number) => (n === 1 ? '1 booking' : `${n} bookings`)

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {summary ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="amenity-summary-title"
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Alert variant="error" role="none">
            <p id="amenity-summary-title" className="font-semibold leading-snug text-foreground">
              {summary.title}
            </p>
            <p>{summary.message}</p>
            {summary.links.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {summary.links.map((l) => (
                  <li key={l.id}>
                    <a href={`#${l.id}`} onClick={goTo(l.id)} className="inline-flex min-h-11 items-center">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Alert>
        </div>
      ) : null}

      <Section title="The basics">
        {!amenity && associations.length > 1 ? (
          <Field id="amenity-association" label="Which community is this for?" required error={errors.associationId}>
            <Select value={values.associationId} onValueChange={set('associationId')} disabled={pending}>
              {associations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field id="amenity-name" label="Name" required error={errors.name} hint="For example: Clubhouse, Pool pavilion, Tennis court.">
          <Input value={values.name} onChange={text('name')} disabled={pending} autoComplete="off" />
        </Field>
        <Field id="amenity-about" label="About it" optional error={errors.description} hint="Residents see this when they book.">
          <Textarea value={values.description} onChange={text('description')} rows={2} disabled={pending} />
        </Field>
      </Section>

      <Section title="When it's open">
        <Fieldset legend="Hours">
          <ChoiceGroup>
            <Radio
              name="hours-mode"
              label="Same hours every day"
              checked={!values.differentByDay}
              onChange={() => set('differentByDay')(false)}
              disabled={pending}
            />
            <Radio
              name="hours-mode"
              label="Different hours on different days"
              checked={values.differentByDay}
              onChange={() => set('differentByDay')(true)}
              disabled={pending}
            />
          </ChoiceGroup>
        </Fieldset>
        {values.differentByDay ? (
          <div id="amenity-weekly" tabIndex={-1} className="space-y-3 outline-none">
            {values.days.map((d, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-3">
                <Checkbox
                  label={weekdayName(i)}
                  description={d.open ? 'Open' : 'Closed all day'}
                  checked={d.open}
                  onChange={(e) => setDay(i, { open: e.currentTarget.checked })}
                  disabled={pending}
                />
                {d.open ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={
                        <>
                          Opens at<span className="sr-only"> on {weekdayName(i)}</span>
                        </>
                      }
                    >
                      <HourSelect value={d.openHour} onChange={(v) => setDay(i, { openHour: v })} list={OPEN_HOURS} disabled={pending} />
                    </Field>
                    <Field
                      label={
                        <>
                          Closes at<span className="sr-only"> on {weekdayName(i)}</span>
                        </>
                      }
                    >
                      <HourSelect value={d.closeHour} onChange={(v) => setDay(i, { closeHour: v })} list={CLOSE_HOURS} disabled={pending} />
                    </Field>
                  </div>
                ) : null}
              </div>
            ))}
            {errors.weeklyHours ? (
              <p className="text-sm font-medium text-danger" role="alert">
                {errors.weeklyHours}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="amenity-open" label="Opens at" required error={errors.openHour}>
              <HourSelect value={values.openHour} onChange={set('openHour')} list={OPEN_HOURS} disabled={pending} />
            </Field>
            <Field id="amenity-close" label="Closes at" required error={errors.closeHour}>
              <HourSelect value={values.closeHour} onChange={set('closeHour')} list={CLOSE_HOURS} disabled={pending} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Booking rules" description="Residents pick a day and a free time that fit these rules.">
        <Fieldset legend="Who confirms a booking?">
          <ChoiceGroup>
            <Radio
              name="approval"
              label="The board approves each booking"
              description="Residents ask. You answer from this page."
              checked={values.requiresApproval}
              onChange={() => set('requiresApproval')(true)}
              disabled={pending}
            />
            <Radio
              name="approval"
              label="Confirmed right away"
              description="A free time is booked as soon as a resident picks it."
              checked={!values.requiresApproval}
              onChange={() => set('requiresApproval')(false)}
              disabled={pending}
            />
          </ChoiceGroup>
        </Fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="amenity-max-hours" label="Longest booking, in hours" required error={errors.maxHours}>
            <Input value={values.maxHours} onChange={text('maxHours')} inputMode="numeric" disabled={pending} />
          </Field>
          <Field id="amenity-advance" label="Book how many days ahead" required error={errors.advanceDays}>
            <Input value={values.advanceDays} onChange={text('advanceDays')} inputMode="numeric" disabled={pending} />
          </Field>
        </div>
      </Section>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">More rules</CardTitle>
          <CardDescription>The usual limits are already filled in. Change them only if you need to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="secondary"
            aria-expanded={moreOpen}
            aria-controls="amenity-more-rules"
            iconRight={moreOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            onClick={() => setMoreOpen((o) => !o)}
          >
            {moreOpen ? 'Hide more rules' : 'Show more rules'}
          </Button>
          {moreOpen ? (
            <div id="amenity-more-rules" className="grid gap-4 sm:grid-cols-2">
              <Field id="amenity-per-home" label="Bookings per home" required error={errors.maxActivePerUnit} hint="Most one home can hold at a time.">
                <Input value={values.maxActivePerUnit} onChange={text('maxActivePerUnit')} inputMode="numeric" disabled={pending} />
              </Field>
              <Field id="amenity-capacity" label="People at once" optional error={errors.capacity} hint="Leave empty for no limit.">
                <Input value={values.capacity} onChange={text('capacity')} inputMode="numeric" disabled={pending} />
              </Field>
              <Field id="amenity-concurrent" label="Bookings at the same time" required error={errors.concurrentLimit} hint="1 for a room. 4 for four courts listed as one.">
                <Input value={values.concurrentLimit} onChange={text('concurrentLimit')} inputMode="numeric" disabled={pending} />
              </Field>
              <Field id="amenity-notice" label="Minimum notice, in hours" required error={errors.minNoticeHours} hint="0 means no minimum.">
                <Input value={values.minNoticeHours} onChange={text('minNoticeHours')} inputMode="numeric" disabled={pending} />
              </Field>
              <Field id="amenity-cutoff" label="Cancel cutoff, in hours" required error={errors.cancelCutoffHours} hint="0 means any time before it starts.">
                <Input value={values.cancelCutoffHours} onChange={text('cancelCutoffHours')} inputMode="numeric" disabled={pending} />
              </Field>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Section title="Closed dates" description="Days it cannot be booked, like winter for a pool.">
        <div id="amenity-closed" tabIndex={-1} className="space-y-4 outline-none">
          {values.blackouts.map((b, i) => (
            <div key={i} className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Field label="First day">
                <Input type="date" value={b.startsOn} onChange={(e) => setBlackout(i, { startsOn: e.currentTarget.value })} disabled={pending} />
              </Field>
              <Field label="Last day">
                <Input type="date" value={b.endsOn} onChange={(e) => setBlackout(i, { endsOn: e.currentTarget.value })} disabled={pending} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Why" optional>
                  <Input value={b.reason} onChange={(e) => setBlackout(i, { reason: e.currentTarget.value })} disabled={pending} autoComplete="off" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove closed date ${i + 1}`}
                  onClick={() => set('blackouts')(values.blackouts.filter((_, j) => j !== i))}
                  disabled={pending}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {errors.blackouts ? (
            <p className="text-sm font-medium text-danger" role="alert">
              {errors.blackouts}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => set('blackouts')([...values.blackouts, { startsOn: '', endsOn: '', reason: '' }])}
            disabled={pending}
          >
            Add a closed date
          </Button>
        </div>
      </Section>

      <Section title="Rules for residents">
        <Field id="amenity-rules" label="House rules" optional error={errors.rules} hint="Cleanup, guests, noise, anything you require. Residents must agree before they book.">
          <Textarea value={values.rules} onChange={text('rules')} rows={4} disabled={pending} />
        </Field>
      </Section>

      <Section title="Open for booking">
        <Checkbox
          label="Residents can book this now"
          description="Turn off to stop new bookings. Existing ones stay."
          checked={values.isActive}
          onChange={(e) => set('isActive')(e.currentTarget.checked)}
          disabled={pending}
        />
      </Section>

      {affected !== null ? (
        <div id="amenity-affected" tabIndex={-1} className="space-y-3 rounded-xl border border-warning/30 bg-warning-subtle p-4 outline-none">
          <h2 className="text-base font-semibold text-foreground">This change affects {dayPlural(affected)}.</h2>
          <Fieldset legend="What should happen to them?" hint="Nothing is canceled unless you choose that.">
            <ChoiceGroup>
              <Radio
                name="affected"
                label="Keep them as they are"
                checked={choice === 'keep'}
                onChange={() => setChoice('keep')}
                disabled={pending}
              />
              <Radio
                name="affected"
                label="Cancel them and tell each resident"
                checked={choice === 'cancel'}
                onChange={() => setChoice('cancel')}
                disabled={pending}
              />
            </ChoiceGroup>
          </Fieldset>
          {choice === 'cancel' ? (
            <Field id="amenity-affected-note" label="Note for the residents" required error={errors.affectedNote}>
              <Input value={affectedNote} onChange={(e) => setAffectedNote(e.currentTarget.value)} disabled={pending} autoComplete="off" />
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button asChild variant="ghost" className="w-full sm:w-auto">
          <Link href="/amenities">Cancel</Link>
        </Button>
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {amenity ? 'Save changes' : 'Add amenity'}
        </Button>
      </div>
    </form>
  )
}
