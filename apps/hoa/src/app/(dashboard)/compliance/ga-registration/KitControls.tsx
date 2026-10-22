'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { Button, ConfirmDialog, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { updateGaRegistration, type GaRegistrationInput } from '@/lib/ga-registration/actions'
import {
  GA_AMENDMENT_REASONS,
  GA_AMENDMENT_REASON_LABEL,
  MAX_CONFIRMATION,
  MAX_DETAIL,
  defaultCoversYear,
  type GaAmendmentReason,
  type GaDecision,
} from '@/lib/ga-registration/model'

/**
 * BL-149: the registration kit's controls. Each one calls the single
 * board-only server action (updateGaRegistration), which re-checks the
 * role, the association and every field, signs the record and audits it.
 * Nothing here files anything with the Secretary of State.
 */

function useSave() {
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fieldError, setFieldError] = useState<{ field: string | null; message: string } | null>(null)
  function save(input: GaRegistrationInput, success: string, after?: () => void) {
    setFieldError(null)
    startTransition(async () => {
      const res = await updateGaRegistration(input)
      if (!res.ok) {
        setFieldError({ field: res.field ?? null, message: res.error })
        if (!res.field) toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({ tone: 'success', message: success })
      after?.()
      router.refresh()
    })
  }
  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : undefined)
  return { pending, save, errorFor }
}

export function PrintKitButton() {
  return (
    <Button type="button" variant="secondary" icon={<Printer aria-hidden />} onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  )
}

export function DecisionControls({ associationId, decision }: { associationId: string; decision: GaDecision | null }) {
  const { pending, save } = useSave()
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        type="button"
        variant={decision === 'register' ? 'primary' : 'secondary'}
        disabled={pending || decision === 'register'}
        onClick={() => save({ op: 'decide', associationId, decision: 'register' }, 'Recorded: the board will register.')}
      >
        {decision === 'register' ? 'Board decided to register' : 'We will register'}
      </Button>
      <Button
        type="button"
        variant={decision === 'opt_out' ? 'primary' : 'secondary'}
        disabled={pending || decision === 'opt_out'}
        onClick={() => save({ op: 'decide', associationId, decision: 'opt_out' }, 'Recorded: the board opted out.')}
      >
        {decision === 'opt_out' ? 'Board opted out' : 'We opted out in writing'}
      </Button>
    </div>
  )
}

/** The years a registration or renewal filed on `filedOn` may cover. */
function yearOptions(filedOn: string): number[] {
  const y = Number(filedOn.slice(0, 4))
  return Number.isInteger(y) ? [...new Set([Math.max(y, 2027), Math.max(y + 1, 2027)])] : [2027]
}

export function FilingForm({ associationId, today, registered }: { associationId: string; today: string; registered: boolean }) {
  const { pending, save, errorFor } = useSave()
  const [kind, setKind] = useState<'registration' | 'renewal'>(registered ? 'renewal' : 'registration')
  const [filedOn, setFiledOn] = useState(today)
  const [confirmation, setConfirmation] = useState('')
  const [coversYear, setCoversYear] = useState<string>('')
  const years = yearOptions(filedOn)
  const fallback = /^\d{4}-\d{2}-\d{2}$/.test(filedOn) ? defaultCoversYear(kind, filedOn) : 2027
  const chosen = coversYear && years.includes(Number(coversYear)) ? Number(coversYear) : fallback

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 print:hidden"
      onSubmit={(e) => {
        e.preventDefault()
        save(
          { op: 'add_filing', associationId, kind, filedOn, confirmation, coversYear: chosen },
          kind === 'registration' ? 'Registration recorded.' : 'Renewal recorded.',
          () => setConfirmation(''),
        )
      }}
    >
      <Field label="What was filed">
        <Select value={kind} onValueChange={(v) => setKind(v as 'registration' | 'renewal')} disabled={pending}>
          <option value="registration">Registration (the first filing)</option>
          <option value="renewal">Annual renewal</option>
        </Select>
      </Field>
      <Field label="Filed on" error={errorFor('filedOn')}>
        <Input type="date" value={filedOn} max={today} onChange={(e) => setFiledOn(e.target.value)} required disabled={pending} />
      </Field>
      <Field label="Confirmation number" hint="From the Secretary of State’s receipt. Optional." error={errorFor('confirmation')}>
        <Input value={confirmation} maxLength={MAX_CONFIRMATION} onChange={(e) => setConfirmation(e.target.value)} disabled={pending} />
      </Field>
      <Field label="Covers the year" hint="Each registration expires on December 31." error={errorFor('coversYear')}>
        <Select value={String(chosen)} onValueChange={setCoversYear} disabled={pending}>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : kind === 'registration' ? 'Record the registration' : 'Record the renewal'}
        </Button>
      </div>
    </form>
  )
}

/** One election's amended registration (BL-151): record the filing, or that the officers didn't change. */
export function AmendmentControls({
  associationId,
  meetingId,
  today,
  answered,
}: {
  associationId: string
  meetingId: string
  today: string
  answered: 'filed' | 'no_change' | null
}) {
  const { pending, save, errorFor } = useSave()
  const [open, setOpen] = useState(false)
  const [filedOn, setFiledOn] = useState(today)
  const [confirmation, setConfirmation] = useState('')

  if (answered === 'no_change') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="print:hidden"
        disabled={pending}
        onClick={() => save({ op: 'undo_no_change', associationId, meetingId }, 'Undone.')}
      >
        Undo “officers didn’t change”
      </Button>
    )
  }
  if (answered === 'filed') return null

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={pending}>
          Record the amended filing
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => save({ op: 'no_change', associationId, meetingId }, 'Marked: no amendment needed.')}
        >
          Officers didn’t change
        </Button>
      </div>
    )
  }
  return (
    <form
      className="grid gap-3 sm:grid-cols-3 print:hidden"
      onSubmit={(e) => {
        e.preventDefault()
        save(
          { op: 'add_filing', associationId, kind: 'amendment', filedOn, confirmation, reason: 'officers', meetingId },
          'Amended registration recorded.',
          () => setOpen(false),
        )
      }}
    >
      <Field label="Filed on" error={errorFor('filedOn')}>
        <Input type="date" value={filedOn} max={today} onChange={(e) => setFiledOn(e.target.value)} required disabled={pending} />
      </Field>
      <Field label="Confirmation number" hint="Optional." error={errorFor('confirmation')}>
        <Input value={confirmation} maxLength={MAX_CONFIRMATION} onChange={(e) => setConfirmation(e.target.value)} disabled={pending} />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** An amendment for any other change (name, address, officers outside an election). */
export function OtherAmendmentForm({ associationId, today }: { associationId: string; today: string }) {
  const { pending, save, errorFor } = useSave()
  const [reason, setReason] = useState<GaAmendmentReason>('officers')
  const [filedOn, setFiledOn] = useState(today)
  const [confirmation, setConfirmation] = useState('')
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 print:hidden"
      onSubmit={(e) => {
        e.preventDefault()
        save({ op: 'add_filing', associationId, kind: 'amendment', filedOn, confirmation, reason, meetingId: null }, 'Amended registration recorded.', () =>
          setConfirmation(''),
        )
      }}
    >
      <Field label="What changed" error={errorFor('reason')}>
        <Select value={reason} onValueChange={(v) => setReason(v as GaAmendmentReason)} disabled={pending}>
          {GA_AMENDMENT_REASONS.map((r) => (
            <option key={r} value={r}>
              {GA_AMENDMENT_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Filed on" error={errorFor('filedOn')}>
        <Input type="date" value={filedOn} max={today} onChange={(e) => setFiledOn(e.target.value)} required disabled={pending} />
      </Field>
      <Field label="Confirmation number" hint="Optional." error={errorFor('confirmation')}>
        <Input value={confirmation} maxLength={MAX_CONFIRMATION} onChange={(e) => setConfirmation(e.target.value)} disabled={pending} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Saving…' : 'Record the amendment'}
        </Button>
      </div>
    </form>
  )
}

export function DetailsForm({
  associationId,
  mailingAddress,
  registeredAgent,
}: {
  associationId: string
  mailingAddress: string | null
  registeredAgent: string | null
}) {
  const { pending, save, errorFor } = useSave()
  const [address, setAddress] = useState(mailingAddress ?? '')
  const [agent, setAgent] = useState(registeredAgent ?? '')
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 print:hidden"
      onSubmit={(e) => {
        e.preventDefault()
        save({ op: 'details', associationId, mailingAddress: address, registeredAgent: agent }, 'Saved for the fill-in sheet.')
      }}
    >
      <Field label="Association mailing address" hint="As it should appear on the filing." error={errorFor('mailingAddress')}>
        <Input value={address} maxLength={MAX_DETAIL} onChange={(e) => setAddress(e.target.value)} disabled={pending} />
      </Field>
      <Field label="Registered agent (if known)" hint="Name and address, from your corporation’s records." error={errorFor('registeredAgent')}>
        <Input value={agent} maxLength={MAX_DETAIL} onChange={(e) => setAgent(e.target.value)} disabled={pending} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Saving…' : 'Save to the sheet'}
        </Button>
      </div>
    </form>
  )
}

export function RemoveFilingButton({ associationId, filingId }: { associationId: string; filingId: string }) {
  const { pending, save } = useSave()
  return (
    <ConfirmDialog
      title="Remove this filing from the record?"
      description="Only HomeownerHub’s record changes. The filing stays with the Secretary of State."
      confirmLabel="Remove"
      destructive
      onConfirm={() => save({ op: 'remove_filing', associationId, filingId }, 'Filing removed from the record.')}
      trigger={
        <Button type="button" variant="ghost" size="sm" className="print:hidden" disabled={pending}>
          Remove
        </Button>
      }
    />
  )
}
