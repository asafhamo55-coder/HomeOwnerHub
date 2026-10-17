'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Repeat } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { promoteJeToRecurring } from '@/lib/journal-entries'

const CADENCES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
] as const
type Cadence = (typeof CADENCES)[number]['value']

export function PromoteRecurringButton({
  journalEntryId,
  today,
}: {
  journalEntryId: string
  /** The association's today, 'YYYY-MM-DD', from the server (BL-065). */
  today: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [nextRunDate, setNextRunDate] = useState(today)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    startTransition(async () => {
      const r = await promoteJeToRecurring({ journalEntryId, cadence, nextRunDate })
      if (!r.ok) {
        if (r.fieldErrors && (r.fieldErrors.cadence || r.fieldErrors.nextRunDate)) setErrors(r.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t save the template', message: r.error })
        return
      }
      setOpen(false)
      toast({
        tone: 'success',
        message: 'Saved as a recurring entry.',
        action: { label: 'View recurring', onClick: () => router.push('/accounting/recurring') },
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary" icon={<Repeat aria-hidden />}>
          Make recurring
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Repeat this entry"
        description="On each run date a fresh copy of these lines posts to the ledger, marked Recurring."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="promote-je" loading={pending} icon={<Repeat aria-hidden />}>
              Save recurring entry
            </Button>
          </>
        }
      >
        <form id="promote-je" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Repeats" required error={errors.cadence}>
            <Select value={cadence} onValueChange={(v) => setCadence(v as Cadence)} disabled={pending}>
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="First run" required error={errors.nextRunDate}>
            <Input type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} disabled={pending} required />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
