'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HandCoins, Undo2 } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
  StatusPill,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { recordCureCommitment, withdrawCureCommitment } from '@/lib/violations'

/**
 * CA Civ. Code § 5855(c)(2): the owner's financial commitment to cure.
 * Rendered by the violation page for California associations only; the
 * server actions refuse every other state too. `blockReason` is the
 * refusal text from W3's state rules, computed on the server.
 */
export interface CureCommitmentCardProps {
  violationId: string
  commitment: { committedOn: string; note: string | null } | null
  blockReason: string | null
  /** The recorded commitment could not be read. */
  loadFailed?: boolean
}

const NOTE_MAX = 1000

function formatDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function CureCommitmentCard({ violationId, commitment, blockReason, loadFailed }: CureCommitmentCardProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [committedOn, setCommittedOn] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await recordCureCommitment({ violationId, committedOn, note: note.trim() || null })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFieldErrors(result.fieldErrors)
        else setError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Commitment recorded. Fines and suspensions are blocked.' })
      setCommittedOn('')
      setNote('')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader actions={commitment ? <StatusPill tone="warning" label="Fines blocked" /> : null}>
        <CardTitle as="h2" className="flex items-center gap-2">
          <HandCoins className="size-4 shrink-0 text-muted" aria-hidden />
          Financial commitment to cure
        </CardTitle>
        <CardDescription>
          California only (Civ. Code § 5855(c)(2)). If the fix takes longer than the notice period and the owner
          commits to paying for it, the board may not fine or suspend them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadFailed ? (
          <Alert variant="error">We could not load whether a commitment is recorded. Reload the page before fining.</Alert>
        ) : commitment ? (
          <div className="space-y-3 text-sm">
            <p className="text-foreground">
              Owner gave a financial commitment to cure on{' '}
              <time dateTime={commitment.committedOn} className="font-medium">
                {formatDay(commitment.committedOn)}
              </time>
              .
            </p>
            {commitment.note ? (
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-subtle p-3 text-foreground-secondary">
                {commitment.note}
              </p>
            ) : null}
            {blockReason ? <Alert variant="warning">{blockReason}</Alert> : null}
            <p className="text-xs text-muted">Letters drafted for this violation carry the commitment into the state-law check.</p>
            <ConfirmDialog
              title="Withdraw the commitment?"
              description="Do this only if the commitment was recorded by mistake or the owner did not keep it. Fines and suspensions are no longer blocked by it."
              confirmLabel="Withdraw commitment"
              onConfirm={async () => {
                const result = await withdrawCureCommitment(violationId)
                if (!result.ok) {
                  toast({ tone: 'error', message: result.error })
                  throw new Error(result.error)
                }
                toast({ tone: 'success', message: 'Commitment withdrawn.' })
                router.refresh()
              }}
              trigger={
                <Button variant="secondary" className="w-full" icon={<Undo2 aria-hidden />}>
                  Withdraw commitment
                </Button>
              }
            />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Date the owner committed" error={fieldErrors.committedOn}>
              <Input
                type="date"
                value={committedOn}
                onChange={(e) => setCommittedOn(e.target.value)}
                required
                disabled={isPending}
              />
            </Field>
            <Field label="Note" optional hint="For example, the contractor and the date the work is booked." error={fieldErrors.note}>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={NOTE_MAX}
                disabled={isPending}
              />
            </Field>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <Button type="submit" className="w-full" loading={isPending} disabled={!committedOn} icon={<HandCoins aria-hidden />}>
              {isPending ? 'Saving…' : 'Record commitment'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
