'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { US_STATES } from '@/lib/us-states'
import { updateAssociationSettings } from '@/lib/association-settings-actions'
import { ASSOCIATION_TYPES, ASSOCIATION_TYPE_LABEL, describeStateChange, type AssociationKind } from '@/lib/association-settings'
import { WhatChangesBox } from './WhatChangesBox'

export interface AssociationRow {
  id: string
  name: string
  state: string | null
  governingLawState: string | null
  type: string
}

/**
 * One association's settings (BL-176). Admins edit; board members see the
 * same values read-only. A change of state, governing law or type first
 * shows "What changes" and needs a second click to confirm.
 */
export function AssociationSettingsForm({ association, canEdit }: { association: AssociationRow; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const type0 = (ASSOCIATION_TYPES as readonly string[]).includes(association.type) ? association.type : 'hoa'
  const state0 = association.state ?? ''
  const differs0 = Boolean(association.governingLawState && association.governingLawState !== association.state)

  const [name, setName] = useState(association.name)
  const [state, setState] = useState(state0)
  const [type, setType] = useState(type0)
  const [advanced, setAdvanced] = useState(differs0)
  const [governing, setGoverning] = useState(association.governingLawState ?? '')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({})

  const effectiveGoverning = advanced && governing ? governing : state
  const summary = describeStateChange(
    { state: association.state, governingLawState: association.governingLawState, type: association.type },
    { state, governingLawState: effectiveGoverning, type },
  )
  const nameChanged = name.trim() !== association.name
  const dirty = summary.changed || nameChanged || effectiveGoverning !== (association.governingLawState ?? association.state ?? '')

  function save() {
    setError(null)
    setFieldErrors({})
    start(async () => {
      const res = await updateAssociationSettings({
        associationId: association.id,
        name,
        state,
        type,
        governingLawState: advanced ? governing : '',
      })
      if (res.ok) {
        setConfirming(false)
        toast({ tone: 'success', message: 'Association saved.' })
        router.refresh()
        return
      }
      setError(res.error)
      setFieldErrors(res.fieldErrors ?? {})
      setConfirming(false)
    })
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit || !dirty) return
    if (summary.changed && !confirming) {
      setConfirming(true)
      return
    }
    save()
  }

  const locked = !canEdit || pending

  return (
    <Card>
      <CardHeader>
        <CardTitle>{association.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Association name" error={fieldErrors.name}>
            <Input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={200}
              disabled={locked || confirming}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="State" error={fieldErrors.state} hint="Sets which state’s law applies.">
              <Select
                name="state"
                value={state}
                onValueChange={(v) => {
                  setState(v)
                  setConfirming(false)
                }}
                disabled={locked || confirming}
              >
                {state === '' ? (
                  <option value="" disabled>
                    Pick a state
                  </option>
                ) : null}
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" error={fieldErrors.type}>
              <Select
                name="type"
                value={type}
                onValueChange={(v) => {
                  setType(v)
                  setConfirming(false)
                }}
                disabled={locked || confirming}
              >
                {ASSOCIATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSOCIATION_TYPE_LABEL[t as AssociationKind]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox
            label="Advanced: the governing law is a different state"
            description="Only if your declaration chooses another state’s law than the state the community is in."
            checked={advanced}
            onChange={(e) => {
              setAdvanced(e.target.checked)
              if (!e.target.checked) setGoverning('')
              setConfirming(false)
            }}
            disabled={locked || confirming}
          />
          {advanced ? (
            <Field label="Governing-law state" error={fieldErrors.governingLawState} hint="Leave on “Same as the state” to follow the state above.">
              <Select
                name="governingLawState"
                value={governing}
                onValueChange={(v) => {
                  setGoverning(v)
                  setConfirming(false)
                }}
                disabled={locked || confirming}
              >
                <option value="">Same as the state</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {confirming ? <WhatChangesBox summary={summary} /> : null}
          {error ? (
            <Alert variant="error" title="Couldn’t save">
              {error}
            </Alert>
          ) : null}

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {confirming ? (
                <>
                  <Button type="submit" loading={pending}>
                    Confirm and save
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                    Back
                  </Button>
                </>
              ) : (
                <Button type="submit" disabled={!dirty} loading={pending}>
                  {summary.changed ? 'Review changes' : 'Save'}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Only an admin can change these. Ask one of your HOA’s admins.</p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
