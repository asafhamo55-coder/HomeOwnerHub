'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Plus, RefreshCw, Save, X } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  Fieldset,
  Input,
  KeyValue,
  KeyValueList,
  Select,
  StatusPill,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { formatDay, formatStamp, plural } from '@/lib/money/format'
import { renderAutoReminder, sampleReminderInput } from '@/lib/dues-reminders/auto-render'
import {
  previewReminderRun,
  saveReminderSettings,
  type DryRunResult,
  type DryRunSend,
  type ReminderLimits,
} from '@/lib/reminder-settings'

type When = 'before' | 'on' | 'after'

interface StepRow {
  key: number
  days: string
  when: When
}

function toRow(offset: number, key: number): StepRow {
  if (offset === 0) return { key, days: '0', when: 'on' }
  return { key, days: String(Math.abs(offset)), when: offset < 0 ? 'before' : 'after' }
}

/** NaN for an unparseable row, so the server's validation reports it. */
function toOffset(row: StepRow): number {
  if (row.when === 'on') return 0
  const n = Number(row.days)
  if (!Number.isInteger(n) || row.days.trim() === '') return Number.NaN
  return row.when === 'before' ? -n : n
}

export function stepLabel(step: number): string {
  if (step === 0) return 'On the due date'
  const days = plural(Math.abs(step), 'day')
  return step < 0 ? `${days} before due` : `${days} after due`
}

export function DuesRemindersForm({
  associationName,
  portalUrl,
  initial,
  configured,
  approvedAt,
  limits,
  initialPreview,
}: {
  associationName: string
  portalUrl: string
  initial: { enabled: boolean; offsets: number[]; note: string | null }
  configured: boolean
  approvedAt: string | null
  limits: ReminderLimits
  initialPreview: DryRunResult
}) {
  const router = useRouter()
  const toast = useToast()
  const [saving, startSave] = useTransition()
  const [previewing, startPreview] = useTransition()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [rows, setRows] = useState<StepRow[]>(() => initial.offsets.map((o, i) => toRow(o, i)))
  const [nextKey, setNextKey] = useState(initial.offsets.length)
  const [note, setNote] = useState(initial.note ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<DryRunResult>(initialPreview)
  const [previewStale, setPreviewStale] = useState(false)

  const offsets = rows.map(toOffset)
  const live = configured && initial.enabled

  const emailHtml = useMemo(
    () => renderAutoReminder(sampleReminderInput({ associationName, note: note.trim() || null, portalUrl })).html,
    [associationName, note, portalUrl],
  )

  function editRow(key: number, patch: Partial<StepRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setPreviewStale(true)
    if (fieldErrors.offsets) setFieldErrors(({ offsets: _gone, ...rest }) => rest)
  }

  function addRow() {
    setRows((prev) => [...prev, { key: nextKey, days: '30', when: 'after' }])
    setNextKey((k) => k + 1)
    setPreviewStale(true)
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key))
    setPreviewStale(true)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startSave(async () => {
      const res = await saveReminderSettings({ enabled, offsets, note })
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {})
        if (!res.fieldErrors) toast({ tone: 'error', message: res.error })
        return
      }
      setFieldErrors({})
      toast({
        tone: 'success',
        message: enabled ? 'Saved. Reminders will send on the schedule you approved.' : 'Saved. Automatic reminders are off.',
      })
      router.refresh()
    })
  }

  function runPreview() {
    startPreview(async () => {
      const res = await previewReminderRun({ offsets })
      if (!res.ok && res.fieldErrors) setFieldErrors(res.fieldErrors)
      setPreview(res)
      setPreviewStale(false)
    })
  }

  const columns = [
    {
      key: 'unit',
      header: 'Unit id',
      mobilePrimary: true,
      cell: (r: DryRunSend) => <span className="break-all text-xs text-foreground-secondary">{r.unitId}</span>,
    },
    { key: 'step', header: 'Reminder', cell: (r: DryRunSend) => stepLabel(r.step) },
    { key: 'count', header: 'Recipients', numeric: true, cell: (r: DryRunSend) => r.recipientCount },
  ]

  return (
    <>
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardHeader className="pb-4">
            <CardTitle as="h2">Schedule and message</CardTitle>
            <CardDescription>
              Saving approves this schedule and message. Owners on an active payment plan, and accounts with the
              association’s attorney, never get an automatic reminder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {live ? (
                <StatusPill tone="success" label="On — sending daily at 9am Eastern" />
              ) : (
                <StatusPill tone="neutral" label="Off — nothing sends" />
              )}
              {configured && approvedAt ? <span>Approved {formatStamp(approvedAt)}</span> : null}
            </div>

            <Checkbox
              label="Send automatic dues reminders"
              description="Each owner with a balance gets an email on the days below."
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
            />

            <Fieldset
              legend="When to send"
              hint={`Up to ${limits.maxSteps}, from ${-limits.offsetMin} days before to ${limits.offsetMax} days after the due date.`}
              error={fieldErrors.offsets}
            >
              <ul className="space-y-2">
                {rows.map((row, i) => (
                  <li key={row.key} className="flex flex-wrap items-center gap-2">
                    {row.when === 'on' ? null : (
                      <Input
                        aria-label={`Reminder ${i + 1}: days`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={row.when === 'before' ? -limits.offsetMin : limits.offsetMax}
                        value={row.days}
                        onChange={(e) => editRow(row.key, { days: e.currentTarget.value })}
                        suffix="days"
                        className="w-28"
                      />
                    )}
                    <div className="min-w-0 flex-1 sm:max-w-[11rem]">
                      <label htmlFor={`reminder-${row.key}-when`} className="sr-only">
                        {`Reminder ${i + 1}: timing`}
                      </label>
                      <Select
                        id={`reminder-${row.key}-when`}
                        value={row.when}
                        onValueChange={(v) => editRow(row.key, { when: v as When })}
                        options={[
                          { value: 'before', label: 'before due' },
                          { value: 'on', label: 'on the due date' },
                          { value: 'after', label: 'after due' },
                        ]}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove reminder ${i + 1}`}
                      icon={<X aria-hidden />}
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length <= 1}
                    />
                  </li>
                ))}
              </ul>
              {rows.length < limits.maxSteps ? (
                <div className="mt-3">
                  <Button type="button" variant="secondary" size="sm" icon={<Plus aria-hidden />} onClick={addRow}>
                    Add a reminder
                  </Button>
                </div>
              ) : null}
            </Fieldset>

            <Field
              label="Message to owners"
              optional
              error={fieldErrors.note}
              hint="Shown above the balance in every reminder. For example, how to pay or who to call."
            >
              <Textarea
                value={note}
                onChange={(e) => {
                  setNote(e.currentTarget.value)
                  if (fieldErrors.note) setFieldErrors(({ note: _gone, ...rest }) => rest)
                }}
                maxLength={limits.noteMax}
                rows={3}
              />
            </Field>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Button type="submit" loading={saving} icon={<Save aria-hidden />}>
              {enabled ? 'Approve and save' : 'Save'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Next run</CardTitle>
          <CardDescription>
            A dry run with the days above: who would get a reminder at the next 9am run. Nothing is sent. Units are
            shown by id only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<RefreshCw aria-hidden />}
              loading={previewing}
              onClick={runPreview}
            >
              Preview next run
            </Button>
            {previewStale ? (
              <span className="text-sm text-muted">You changed the days. Preview again to see their effect.</span>
            ) : null}
          </div>
          {preview.ok ? (
            <>
              <KeyValueList className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KeyValue label="Run date" value={formatDay(preview.runDate)} />
                <KeyValue label="Emails" value={<span className="num">{plural(preview.recipientTotal, 'recipient')}</span>} />
                <KeyValue label="Units" value={<span className="num">{preview.sends.length}</span>} />
                <KeyValue label="Skipped" value={<span className="num">{preview.skipped.paymentPlan + preview.skipped.attorney + preview.skipped.noRecipient}</span>} />
              </KeyValueList>
              <DataTable
                columns={columns}
                rows={preview.sends}
                rowKey={(r) => `${r.unitId}:${r.step}`}
                caption="Units that would get a reminder at the next run"
                density="compact"
                mobile="cards"
                empty={
                  <EmptyState
                    variant="compact"
                    icon={<CalendarClock aria-hidden />}
                    title="No reminders due"
                    description={`Nobody is due a reminder on ${formatDay(preview.runDate)}.`}
                  />
                }
              />
              <KeyValueList className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KeyValue label="On a payment plan" value={<span className="num">{preview.skipped.paymentPlan}</span>} />
                <KeyValue label="With the attorney" value={<span className="num">{preview.skipped.attorney}</span>} />
                <KeyValue label="No owner email" value={<span className="num">{preview.skipped.noRecipient}</span>} />
                <KeyValue label="Already sent" value={<span className="num">{preview.skipped.alreadySent}</span>} />
              </KeyValueList>
            </>
          ) : (
            <Alert variant="error" title="Couldn’t build the preview">
              Check the reminder days above, then preview again.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">What owners receive</CardTitle>
          <CardDescription>
            A sample with invented details. Each real email shows that owner’s own charges and balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* srcdoc isolates the email's inline styles from the app's CSS.
              The email is designed on white, so the frame keeps a light
              colour scheme even in dark mode. */}
          <iframe
            title="Reminder email preview"
            srcDoc={emailHtml}
            className="h-[34rem] w-full rounded-lg border border-border [color-scheme:light]"
          />
        </CardContent>
      </Card>
    </>
  )
}
