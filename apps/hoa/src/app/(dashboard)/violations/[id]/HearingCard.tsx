'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, Gavel, Mail, Plus, Trash2, TriangleAlert } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  StatusPill,
  useToast,
} from '@homeowner-portal/ui'
import { NOT_LEGAL_ADVICE } from '@/lib/compliance/statute-drift'
import { cancelHearingAfterCure, saveViolationHearing } from '@/lib/violation-hearings/actions'
import { CURE_CANCEL_REASON_LABEL, type CureBeforeHearingOffer, type CureCancelReason } from '@/lib/violation-hearings/cure'
import {
  HEARING_OUTCOMES,
  HEARING_OUTCOME_LABEL,
  HEARING_STATUSES,
  HEARING_STATUS_LABEL,
  MAX_LOCATION,
  MAX_PANEL,
  MAX_PANEL_NAME,
  buildHearingNoticeDraft,
  type HearingChecklist,
  type HearingOutcome,
  type HearingRecord,
  type HearingStatus,
  type PanelMember,
  type StepState,
} from '@/lib/violation-hearings/rules'
import { hearingNoticeComposerHref, writeHearingNoticeDraft } from '@/lib/violation-hearings/notice-handoff'
import { sessionStore } from '@/lib/budget-notice/draft-handoff'

/**
 * BL-133: the fine hearing on a violation (M4_APPLIED; the page renders
 * this only when the flag is on). The board records the date, place,
 * panel, notice day and outcome; the checklist (computed on the server
 * from the state's loaded statute text) says what's still needed. "Draft
 * hearing notice" opens the composer pre-filled for this home — nothing is
 * sent from here.
 */
export interface HearingCardProps {
  violation: {
    id: string
    propertyId: string | null
    closed: boolean
    violationType: string
    description: string
    ruleCited: string | null
  }
  state: string | null
  associationName: string
  hearing: HearingRecord | null
  loadFailed: boolean
  checklist: HearingChecklist | null
  /** BL-140: the violation was resolved before its hearing; null hides the offer. */
  cureOffer?: CureBeforeHearingOffer | null
}

const STEP_TONE: Record<StepState, 'success' | 'neutral' | 'danger' | 'warning'> = {
  done: 'success',
  todo: 'neutral',
  late: 'danger',
  problem: 'warning',
}
const STEP_LABEL: Record<StepState, string> = { done: 'Done', todo: 'To do', late: 'Late', problem: 'Check' }

function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function HearingCard({ violation, state, associationName, hearing, loadFailed, checklist, cureOffer = null }: HearingCardProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<HearingStatus>(hearing?.status ?? 'scheduled')
  const [hearingOn, setHearingOn] = useState(hearing?.hearingOn ?? '')
  const [hearingTime, setHearingTime] = useState(hearing?.hearingTime ?? '')
  const [location, setLocation] = useState(hearing?.location ?? '')
  const [panel, setPanel] = useState<PanelMember[]>(hearing?.panel ?? [])
  const [noticeSentOn, setNoticeSentOn] = useState(hearing?.noticeSentOn ?? '')
  const [outcome, setOutcome] = useState<HearingOutcome | ''>(hearing?.outcome ?? '')
  const [decidedOn, setDecidedOn] = useState(hearing?.decidedOn ?? '')
  const [findingsSentOn, setFindingsSentOn] = useState(hearing?.findingsSentOn ?? '')
  const [paymentDueOn, setPaymentDueOn] = useState(hearing?.paymentDueOn ?? '')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [handoffFailed, setHandoffFailed] = useState(false)
  const [cureReason, setCureReason] = useState<CureCancelReason | ''>(cureOffer?.reasons[0] ?? '')
  const [cureError, setCureError] = useState<string | null>(null)

  const isFl = state === 'FL'
  const panelLabel = isFl ? 'Hearing committee' : 'Hearing panel'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveViolationHearing({
        violationId: violation.id,
        status,
        hearingOn: hearingOn || null,
        hearingTime: hearingTime || null,
        location: location || null,
        panel: panel.filter((p) => p.name.trim()),
        noticeSentOn: noticeSentOn || null,
        outcome: status === 'held' && outcome ? outcome : null,
        decidedOn: status === 'held' && decidedOn ? decidedOn : null,
        findingsSentOn: findingsSentOn || null,
        paymentDueOn: paymentDueOn || null,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFieldErrors(result.fieldErrors)
        setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Hearing saved.' })
      router.refresh()
    })
  }

  function draftNotice() {
    const draft = buildHearingNoticeDraft({
      state,
      associationName,
      violationType: violation.violationType,
      description: violation.description,
      ruleCited: violation.ruleCited,
      hearingOn: hearingOn || null,
      hearingTime: hearingTime || null,
      location: location || null,
    })
    if (!writeHearingNoticeDraft(sessionStore(), { violationId: violation.id, ...draft })) {
      setHandoffFailed(true)
      return
    }
    router.push(hearingNoticeComposerHref(violation.propertyId))
  }

  function cancelForCure() {
    if (!cureReason) {
      setCureError('Pick why the hearing is cancelled.')
      return
    }
    setCureError(null)
    startTransition(async () => {
      const result = await cancelHearingAfterCure({ violationId: violation.id, reason: cureReason })
      if (!result.ok) {
        setCureError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Hearing cancelled. The reason is in the activity log.' })
      router.refresh()
    })
  }

  const setMember = (i: number, patch: Partial<PanelMember>) =>
    setPanel((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <Card>
      <CardHeader actions={hearing ? <StatusPill tone={hearing.status === 'held' ? 'success' : hearing.status === 'requested' ? 'warning' : 'neutral'} label={HEARING_STATUS_LABEL[hearing.status]} /> : null}>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Gavel className="size-4 shrink-0 text-muted" aria-hidden />
          Fine hearing
        </CardTitle>
        <CardDescription>
          {isFl
            ? 'Florida: a fine needs 14 days’ notice and a committee of at least three owners who are not on the board.'
            : state === 'CA'
              ? 'California: the board meets with 10 days’ written notice and sends its decision within 14 days.'
              : 'Record the hearing before the board levies a fine.'}{' '}
          Nothing is sent from here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadFailed ? (
          <Alert variant="error">We could not load the hearing record. Reload the page before fining.</Alert>
        ) : (
          <>
            {cureOffer ? (
              <section aria-label="Cured before the hearing" className="space-y-3 rounded-lg border border-border bg-subtle p-3 text-sm">
                <p className="font-medium text-foreground">Cured before the hearing</p>
                <p className="text-foreground-secondary">{cureOffer.message}</p>
                {cureOffer.note ? <p className="text-muted">{cureOffer.note}</p> : null}
                {cureOffer.citations.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-primary">{[...new Set(cureOffer.citations.map((c) => c.cite))].join('; ')}</summary>
                    {cureOffer.citations.map((c) => (
                      <blockquote key={c.quote} className="mt-1 border-l-2 border-border pl-2 text-xs text-muted">
                        “{c.quote}”
                      </blockquote>
                    ))}
                    <p className="mt-1 text-xs text-muted">{NOT_LEGAL_ADVICE}</p>
                  </details>
                ) : null}
                <Field label="Why the hearing is cancelled" error={cureError ?? undefined}>
                  <Select value={cureReason} onValueChange={(v) => setCureReason(v as CureCancelReason)} disabled={isPending}>
                    {cureOffer.reasons.map((r) => (
                      <option key={r} value={r}>
                        {CURE_CANCEL_REASON_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={cancelForCure} loading={isPending}>
                    Cancel the hearing
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  Board only. The reason is kept in the activity log. Nothing is sent to the owner; tell them from Messages if
                  you need to.
                </p>
              </section>
            ) : null}

            {hearing?.requestedAt ? (
              <div className="space-y-2 rounded-lg border border-border bg-subtle p-3 text-sm">
                <p className="font-medium text-foreground">
                  The owner asked for a hearing on <time dateTime={hearing.requestedAt}>{formatDay(hearing.requestedAt.slice(0, 10))}</time>.
                </p>
                {hearing.residentStatement ? (
                  <p className="whitespace-pre-wrap text-foreground-secondary [overflow-wrap:anywhere]">{hearing.residentStatement}</p>
                ) : null}
              </div>
            ) : null}

            {checklist ? (
              checklist.note ? (
                <p className="text-sm text-muted">{checklist.note}</p>
              ) : (
                <ol className="space-y-3" aria-label="Hearing steps">
                  {checklist.steps.map((s) => (
                    <li key={s.code} className="space-y-1 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                          {s.state === 'done' ? (
                            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                          ) : s.state === 'todo' ? (
                            <Circle className="size-4 shrink-0 text-muted" aria-hidden />
                          ) : (
                            <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                          )}
                          {s.title}
                        </span>
                        <StatusPill tone={STEP_TONE[s.state]} label={STEP_LABEL[s.state]} />
                      </div>
                      <p className="pl-6 text-foreground-secondary">{s.detail}</p>
                      <details className="pl-6">
                        <summary className="cursor-pointer text-xs text-primary">{s.citations.map((c) => c.cite).join('; ')}</summary>
                        {s.citations.map((c) => (
                          <blockquote key={c.quote} className="mt-1 border-l-2 border-border pl-2 text-xs text-muted">
                            “{c.quote}”
                          </blockquote>
                        ))}
                      </details>
                    </li>
                  ))}
                </ol>
              )
            ) : null}
            {checklist && !checklist.note ? <p className="text-xs text-muted">{NOT_LEGAL_ADVICE}</p> : null}

            {violation.closed && !hearing ? (
              <p className="text-sm text-muted">This violation is closed.</p>
            ) : (
              <form onSubmit={submit} className="space-y-4 border-t border-border pt-4">
                <Field label="Hearing status" error={fieldErrors.status}>
                  <Select value={status} onValueChange={(v) => setStatus(v as HearingStatus)} disabled={isPending}>
                    {HEARING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {HEARING_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date" error={fieldErrors.hearingOn}>
                    <Input type="date" value={hearingOn} onChange={(e) => setHearingOn(e.target.value)} disabled={isPending} />
                  </Field>
                  <Field label="Time" optional error={fieldErrors.hearingTime}>
                    <Input type="time" value={hearingTime} onChange={(e) => setHearingTime(e.target.value)} disabled={isPending} />
                  </Field>
                </div>
                <Field label="Place, or how to join" optional error={fieldErrors.location}>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={MAX_LOCATION} disabled={isPending} />
                </Field>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground">{panelLabel}</legend>
                  <p className="text-xs text-muted">
                    {isFl
                      ? 'Mark anyone who is an officer, director or employee (or their relative) as Board: they can’t sit on a Florida committee.'
                      : 'Who will hear the case. Mark each as a board member or an owner.'}
                  </p>
                  {panel.map((m, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          aria-label={`Panel member ${i + 1} name`}
                          value={m.name}
                          onChange={(e) => setMember(i, { name: e.target.value })}
                          maxLength={MAX_PANEL_NAME}
                          disabled={isPending}
                        />
                      </div>
                      <Select
                        aria-label={`Panel member ${i + 1} role`}
                        value={m.role}
                        onValueChange={(v) => setMember(i, { role: v === 'board' ? 'board' : 'member' })}
                        disabled={isPending}
                      >
                        <option value="member">Owner (not on the board)</option>
                        <option value="board">Board</option>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Remove panel member ${i + 1}`}
                        icon={<Trash2 aria-hidden />}
                        onClick={() => setPanel((rows) => rows.filter((_, j) => j !== i))}
                        disabled={isPending}
                      />
                    </div>
                  ))}
                  {fieldErrors.panel ? <p role="alert" className="text-sm text-danger">{fieldErrors.panel}</p> : null}
                  {panel.length < MAX_PANEL ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<Plus aria-hidden />}
                      onClick={() => setPanel((rows) => [...rows, { name: '', role: 'member' }])}
                      disabled={isPending}
                    >
                      Add a person
                    </Button>
                  ) : null}
                </fieldset>

                <Field label="Notice sent on" optional hint="The day you sent the hearing notice." error={fieldErrors.noticeSentOn}>
                  <Input type="date" value={noticeSentOn} onChange={(e) => setNoticeSentOn(e.target.value)} disabled={isPending} />
                </Field>

                {status === 'held' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Outcome" error={fieldErrors.outcome}>
                      <Select value={outcome} onValueChange={(v) => setOutcome(v as HearingOutcome)} disabled={isPending}>
                        <option value="">Pick one</option>
                        {HEARING_OUTCOMES.map((o) => (
                          <option key={o} value={o}>
                            {HEARING_OUTCOME_LABEL[o]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Decided on" optional error={fieldErrors.decidedOn}>
                      <Input type="date" value={decidedOn} onChange={(e) => setDecidedOn(e.target.value)} disabled={isPending} />
                    </Field>
                    <Field label={isFl ? 'Findings sent on' : 'Written decision sent on'} optional error={fieldErrors.findingsSentOn}>
                      <Input type="date" value={findingsSentOn} onChange={(e) => setFindingsSentOn(e.target.value)} disabled={isPending} />
                    </Field>
                    <Field label="Fine due on" optional error={fieldErrors.paymentDueOn}>
                      <Input type="date" value={paymentDueOn} onChange={(e) => setPaymentDueOn(e.target.value)} disabled={isPending} />
                    </Field>
                  </div>
                ) : null}

                {error ? <Alert variant="error">{error}</Alert> : null}
                {handoffFailed ? (
                  <Alert variant="warning">This browser blocked handing the notice to the composer. Allow site data for this tab and try again.</Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" loading={isPending} icon={<Gavel aria-hidden />}>
                    {isPending ? 'Saving…' : hearing ? 'Save hearing' : 'Record hearing'}
                  </Button>
                  {!violation.closed ? (
                    <Button type="button" variant="secondary" icon={<Mail aria-hidden />} onClick={draftNotice} disabled={isPending}>
                      Draft hearing notice
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted">
                  The notice opens in Messages for this home. Read it, fill in anything in brackets, and send it from there. Then
                  enter the day it went out above.
                </p>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
