'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Save, Sparkles, Trash2 } from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  ChoiceGroup,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Fieldset,
  Input,
  Radio,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'
import { rejectViolationDraft, saveViolationDraftEdits } from '@/lib/violations'
import {
  FOLLOW_UP_LETTER_DESCRIPTIONS,
  FOLLOW_UP_LETTER_KINDS,
  FOLLOW_UP_LETTER_LABELS,
  FOLLOW_UP_NOTICE_MAX,
  buildFollowUpDraftRequest,
  isPenaltyLetter,
  readFollowUpDraft,
  readStatuteRefusal,
  type DecisionOutcome,
  type FollowUpDraft,
  type FollowUpLetterKind,
  type FollowUpViolation,
  type StatuteRefusal,
} from '@/lib/violation-follow-up'

/**
 * "Draft follow-up letter" on the violation page. The board picks the
 * letter; POST /api/ai/violations/draft (with `violationId` and
 * `letterKind`) checks it against the state rules and drafts it. A refusal
 * is shown instead of a draft. The draft is the board's working copy until
 * "Save to approvals": only then does it join Approvals (the route marks it
 * followUp.awaitingSave; saving removes the mark). Closing the dialog
 * without saving leaves it out of Approvals for good. Nothing reaches the
 * owner until the board approves the letter, and even then HomeownerHub
 * sends nothing.
 */
export interface FollowUpLetterDialogProps {
  violation: FollowUpViolation
}

type Phase =
  | { kind: 'choose' }
  | { kind: 'refused'; refusal: StatuteRefusal }
  | { kind: 'review'; draft: FollowUpDraft }

const DISCARD_REASON = 'Discarded by the board while reviewing the follow-up letter.'

export function FollowUpLetterDialog({ violation }: FollowUpLetterDialogProps) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' })
  const [letterKind, setLetterKind] = useState<FollowUpLetterKind>('second_notice')
  const [outcome, setOutcome] = useState<DecisionOutcome>('fine')
  const [hearingHeld, setHearingHeld] = useState(false)
  const [fine, setFine] = useState('')
  const [hearingDays, setHearingDays] = useState('')
  const [notes, setNotes] = useState('')
  const [letter, setLetter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setPhase({ kind: 'choose' })
    setLetter('')
    setError(null)
  }

  function onOpenChange(next: boolean) {
    // An unsaved draft never reaches Approvals, so closing needs no refresh.
    setOpen(next)
    if (!next) reset()
  }

  function draft(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fineDollars = fine.trim() === '' ? null : Number(fine)
    const days = hearingDays.trim() === '' ? null : Number(hearingDays)
    const body = buildFollowUpDraftRequest(violation, {
      kind: letterKind,
      outcome,
      hearingHeld,
      fineDollars: fineDollars !== null && Number.isFinite(fineDollars) ? fineDollars : null,
      hearingNoticeDays: days !== null && Number.isInteger(days) ? days : null,
      notes,
    })
    startTransition(async () => {
      let res: Response
      try {
        res = await fetch('/api/ai/violations/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch {
        setError('We could not reach HomeownerHub. Check your connection and try again.')
        return
      }
      if (!res.ok) {
        const json: unknown = await res
          .clone()
          .json()
          .catch(() => null)
        const refusal = readStatuteRefusal(json)
        if (refusal) {
          setPhase({ kind: 'refused', refusal })
          return
        }
        setError(await responseErrorMessage(res, 'The letter could not be drafted. Try again.'))
        return
      }
      const drafted = readFollowUpDraft(await res.json().catch(() => null))
      if (!drafted) {
        setError('No letter text came back. Try again, or write the letter yourself.')
        return
      }
      setLetter(drafted.notice)
      setPhase({ kind: 'review', draft: drafted })
    })
  }

  function save() {
    if (phase.kind !== 'review') return
    setError(null)
    startTransition(async () => {
      const result = await saveViolationDraftEdits(phase.draft.runId, letter)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Letter saved to Approvals. Nothing was sent to the homeowner.' })
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  function discard() {
    if (phase.kind !== 'review') return
    setError(null)
    startTransition(async () => {
      const result = await rejectViolationDraft(phase.draft.runId, DISCARD_REASON)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Draft discarded. Nothing was sent.' })
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  const penalty = isPenaltyLetter(letterKind)
  const showFine = letterKind === 'fine_notice' || (letterKind === 'decision_letter' && outcome === 'fine')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" icon={<FileText aria-hidden />}>
          Draft follow-up letter
        </Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="Draft follow-up letter"
        description="Covenant Brain drafts the letter under your state’s rules. Save it to Approvals to keep it; the board approves it there. Nothing is sent to the homeowner."
      >
        {phase.kind === 'choose' ? (
          <form onSubmit={draft} className="space-y-5">
            <Fieldset legend="Letter">
              <ChoiceGroup>
                {FOLLOW_UP_LETTER_KINDS.map((k) => (
                  <Radio
                    key={k}
                    name="letterKind"
                    value={k}
                    checked={letterKind === k}
                    onChange={() => setLetterKind(k)}
                    label={FOLLOW_UP_LETTER_LABELS[k]}
                    description={FOLLOW_UP_LETTER_DESCRIPTIONS[k]}
                    disabled={isPending}
                  />
                ))}
              </ChoiceGroup>
            </Fieldset>

            {letterKind === 'decision_letter' ? (
              <Fieldset legend="Decision">
                <ChoiceGroup orientation="horizontal">
                  <Radio
                    name="outcome"
                    value="fine"
                    checked={outcome === 'fine'}
                    onChange={() => setOutcome('fine')}
                    label="Fine"
                    disabled={isPending}
                  />
                  <Radio
                    name="outcome"
                    value="suspension"
                    checked={outcome === 'suspension'}
                    onChange={() => setOutcome('suspension')}
                    label="Suspension of common-area use"
                    disabled={isPending}
                  />
                </ChoiceGroup>
              </Fieldset>
            ) : null}

            {penalty ? (
              <Checkbox
                checked={hearingHeld}
                onChange={(e) => setHearingHeld(e.target.checked)}
                label="The hearing was held and the board approved the penalty"
                description="State law requires a hearing before a fine or suspension. Leave this unticked if it has not happened."
                disabled={isPending}
              />
            ) : null}

            {showFine ? (
              <Field label="Fine amount ($)" optional hint="Per violation, as on your fine schedule.">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={fine}
                  onChange={(e) => setFine(e.target.value)}
                  disabled={isPending}
                />
              </Field>
            ) : null}

            {letterKind === 'hearing_notice' ? (
              <Field label="Days until the hearing" optional hint="Days between this notice and the hearing.">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  step={1}
                  value={hearingDays}
                  onChange={(e) => setHearingDays(e.target.value)}
                  disabled={isPending}
                />
              </Field>
            ) : null}

            <Field label="Notes for the letter" optional hint="For example, what the owner has done since the first notice.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1500} disabled={isPending} />
            </Field>

            {error ? <Alert variant="error">{error}</Alert> : null}

            <div className="flex justify-end">
              <Button type="submit" loading={isPending} icon={<Sparkles aria-hidden />}>
                {isPending ? 'Drafting…' : 'Draft letter'}
              </Button>
            </div>
          </form>
        ) : null}

        {phase.kind === 'refused' ? (
          <div className="space-y-4">
            <Alert variant="warning" title="State law does not allow this letter yet">
              <ul className="list-disc space-y-1 pl-5">
                {phase.refusal.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Alert>
            <p className="text-sm text-muted">No letter was drafted.</p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={reset}>
                Choose another letter
              </Button>
            </div>
          </div>
        ) : null}

        {phase.kind === 'review' ? (
          <div className="space-y-4">
            {phase.draft.warnings.length > 0 ? (
              <Alert variant="info" title="State law notes">
                <ul className="list-disc space-y-1 pl-5">
                  {phase.draft.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            <Field label={FOLLOW_UP_LETTER_LABELS[letterKind]} hint="Read it to the bottom and fix anything that is wrong. Fill in every [BRACKETED] blank.">
              <Textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                rows={16}
                maxLength={FOLLOW_UP_NOTICE_MAX}
                disabled={isPending}
              />
            </Field>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <p className="text-sm text-muted">The letter goes to Approvals only when you save it. If you close without saving, it is not kept.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="destructive-ghost" onClick={discard} disabled={isPending} icon={<Trash2 aria-hidden />}>
                Discard draft
              </Button>
              <Button onClick={save} loading={isPending} icon={<Save aria-hidden />}>
                Save to approvals
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
