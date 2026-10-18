'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { MoreHorizontal, Pause, Pencil, Play, Square } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Sheet,
  SheetContent,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { changeRecurringEntryState, updateRecurringEntry } from '@/lib/recurring-entries'
import { allowedActions } from '@/lib/accounting/recurring-edit'
import { RecurringEntryForm, type RecurringFormValue } from './RecurringEntryForm'
import type { RecurringOptions, RecurringRuleView } from './model'

/**
 * What a board member can do with one recurring entry (BL-081): Edit
 * (a sheet), and Pause / Resume / Stop in the ⋯ menu. Stop asks first and
 * is final; Resume asks when it should run next. A stopped entry offers
 * nothing — it is made recurring again from the ledger.
 */
export function RecurringEntryActions({ rule, options }: { rule: RecurringRuleView; options: RecurringOptions }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [resuming, setResuming] = useState(false)
  const [resumeDate, setResumeDate] = useState(rule.nextRunDate < options.today ? options.today : rule.nextRunDate)
  const [resumeError, setResumeError] = useState<string | undefined>()

  const actions = allowedActions(rule.state)
  if (actions.length === 0) return null
  const name = rule.template?.memo ?? 'this entry'

  function lifecycle(action: 'pause' | 'stop' | 'resume', success: string, nextRunDate?: string) {
    startTransition(async () => {
      const r = await changeRecurringEntryState({ ruleId: rule.id, action, nextRunDate })
      if (!r.ok) {
        if (action === 'resume' && r.fieldErrors?.nextRunDate) setResumeError(r.fieldErrors.nextRunDate)
        else toast({ tone: 'error', title: 'Nothing changed', message: r.error })
        return
      }
      setResuming(false)
      toast({ tone: 'success', message: success })
      router.refresh()
    })
  }

  async function stop() {
    const ok = await confirm({
      title: 'Stop this recurring entry?',
      description: `No more copies of “${name}” will post. Entries already in the ledger stay. You can’t restart it here — to repeat it again, open the entry in the ledger and select Make recurring.`,
      confirmLabel: 'Stop entry',
      destructive: true,
    })
    if (ok) lifecycle('stop', 'Stopped. No more copies will post.')
  }

  function save(value: RecurringFormValue) {
    setEditErrors({})
    startTransition(async () => {
      const r = await updateRecurringEntry({ ruleId: rule.id, ...value })
      if (!r.ok) {
        if (r.fieldErrors && Object.keys(r.fieldErrors).length > 0) setEditErrors(r.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t save the changes', message: r.error })
        return
      }
      setEditing(false)
      toast({ tone: 'success', message: 'Saved. The next copy uses the new details.' })
      router.refresh()
    })
  }

  const formId = `recurring-edit-${rule.id}`

  return (
    <div className="flex items-center justify-end gap-2">
      {rule.template && options.editable ? (
        <Button size="sm" variant="secondary" icon={<Pencil aria-hidden />} onClick={() => setEditing(true)} disabled={pending}>
          Edit
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${name}`} disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.includes('pause') ? (
            <DropdownMenuItem icon={<Pause aria-hidden />} onSelect={() => lifecycle('pause', 'Paused. Nothing posts until you resume it.')}>
              Pause
            </DropdownMenuItem>
          ) : null}
          {actions.includes('resume') ? (
            <DropdownMenuItem icon={<Play aria-hidden />} onSelect={() => setResuming(true)}>
              Resume
            </DropdownMenuItem>
          ) : null}
          {actions.includes('stop') ? (
            <DropdownMenuItem icon={<Square aria-hidden />} destructive onSelect={() => void stop()}>
              Stop
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resuming} onOpenChange={(next) => !pending && setResuming(next)}>
        <DialogContent
          title="Resume this recurring entry"
          description="Copies start posting again from the date you pick."
          footer={
            <>
              <Button variant="ghost" onClick={() => setResuming(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={`resume-${rule.id}`} loading={pending} icon={<Play aria-hidden />}>
                Resume
              </Button>
            </>
          }
        >
          <form
            id={`resume-${rule.id}`}
            onSubmit={(e) => {
              e.preventDefault()
              setResumeError(undefined)
              lifecycle('resume', 'Resumed.', resumeDate)
            }}
          >
            <Field label="Next run" required error={resumeError} hint="Today or later.">
              <Input type="date" value={resumeDate} min={options.today} onChange={(e) => setResumeDate(e.target.value)} disabled={pending} required />
            </Field>
          </form>
        </DialogContent>
      </Dialog>

      {rule.template && options.editable ? (
        <Sheet open={editing} onOpenChange={(next) => !pending && setEditing(next)}>
          <SheetContent
            title="Edit recurring entry"
            description="Change the amounts, accounts, description or schedule of future copies."
            width="lg"
            footer={
              <>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} loading={pending}>
                  Save changes
                </Button>
              </>
            }
          >
            <RecurringEntryForm
              formId={formId}
              initial={{ memo: rule.template.memo, cadence: rule.cadence, nextRunDate: rule.nextRunDate, lines: rule.template.lines }}
              accounts={options.accounts}
              funds={options.funds}
              today={options.today}
              errors={editErrors}
              pending={pending}
              onSubmit={save}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
