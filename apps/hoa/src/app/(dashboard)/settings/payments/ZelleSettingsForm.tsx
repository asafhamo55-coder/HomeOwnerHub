'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Save } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  StatusPill,
  Textarea,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { clearZelleSettings, saveZelleSettings } from '@/lib/pay-settings'
import { ZellePayInstructions } from '@/components/resident/ZellePayInstructions'
import { CheckPayCard } from '@/components/resident/CheckPayCard'
import { formatShortDate } from '@/lib/format-datetime'

interface Values {
  recipient: string
  recipientName: string
  instructions: string
  checkPayableTo: string
  checkMailTo: string
  checkDropOff: string
}

// Older boards, phones: 16px text and 48px targets on everything here.
const BIG_INPUT = 'h-12 text-base'

export function ZelleSettingsForm({
  initial,
  configured,
  updatedAt,
  sampleMemoCode,
}: {
  initial: Values
  configured: boolean
  updatedAt: string | null
  sampleMemoCode: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Values>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.currentTarget.value
    setValues((prev) => ({ ...prev, [key]: v }))
    if (fieldErrors[key]) setFieldErrors(({ [key]: _gone, ...rest }) => rest)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveZelleSettings(values)
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {})
        if (!res.fieldErrors) toast({ tone: 'error', message: res.error })
        return
      }
      setFieldErrors({})
      toast({ tone: 'success', message: 'Saved. Residents can now see how to pay.' })
      router.refresh()
    })
  }

  async function onTurnOff() {
    const ok = await confirm({
      title: 'Turn off how residents pay?',
      description: 'Residents will be told to contact the board to pay. Payments already sent still arrive and match.',
      confirmLabel: 'Turn off',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await clearZelleSettings()
      if (!res.ok) {
        toast({ tone: 'error', message: res.error })
        return
      }
      setValues({
        recipient: '',
        recipientName: initial.recipientName,
        instructions: '',
        checkPayableTo: '',
        checkMailTo: '',
        checkDropOff: '',
      })
      toast({ tone: 'success', message: 'Payment details are off.' })
      router.refresh()
    })
  }

  const previewRecipient = values.recipient.trim()
  const payableTo = values.checkPayableTo.trim()
  const mailTo = values.checkMailTo.trim()
  const previewChecks =
    payableTo && mailTo ? { payableTo, mailTo, dropOff: values.checkDropOff.trim() || null } : null

  return (
    <>
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardHeader className="pb-4">
            <CardTitle as="h2">How residents pay</CardTitle>
            <CardDescription className="text-base">
              Fill in Zelle, checks, or both. Use your association’s own bank account, never a board member’s
              personal account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-base">
            <div className="flex flex-wrap items-center gap-2 text-base text-muted">
              {configured ? (
                <StatusPill tone="success" label="On: residents can see how to pay" />
              ) : (
                <StatusPill tone="neutral" label="Off: residents are told to contact the board" />
              )}
              {configured && updatedAt ? <span>Last saved {formatShortDate(updatedAt)}</span> : null}
            </div>

            <fieldset className="space-y-4">
              <legend className="text-lg font-semibold text-foreground">Pay by Zelle (optional)</legend>
              <Field
                label="Zelle email or mobile number"
                optional
                error={fieldErrors.recipient}
                hint="What residents type into “Send to” in their bank app. Leave empty if you do not use Zelle."
              >
                <Input
                  className={BIG_INPUT}
                  value={values.recipient}
                  onChange={set('recipient')}
                  placeholder="treasurer@yourhoa.org"
                  autoComplete="off"
                  inputMode="email"
                  maxLength={254}
                />
              </Field>
              <Field
                label="Name Zelle shows"
                optional
                error={fieldErrors.recipientName}
                hint="The account name residents should see before they confirm, so they know it’s really you."
              >
                <Input className={BIG_INPUT} value={values.recipientName} onChange={set('recipientName')} maxLength={80} />
              </Field>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="text-lg font-semibold text-foreground">Pay by check (optional)</legend>
              <Field label="Make checks payable to" optional error={fieldErrors.checkPayableTo} hint="For example: Maple Court HOA">
                <Input className={BIG_INPUT} value={values.checkPayableTo} onChange={set('checkPayableTo')} maxLength={160} />
              </Field>
              <Field
                label="Mail to"
                optional
                error={fieldErrors.checkMailTo}
                hint="The full mailing address, such as a P.O. box or the treasurer’s mailing address."
              >
                <Textarea
                  className="text-base"
                  value={values.checkMailTo}
                  onChange={set('checkMailTo')}
                  maxLength={300}
                  rows={3}
                />
              </Field>
              <Field
                label="Or drop off at"
                optional
                error={fieldErrors.checkDropOff}
                hint="A place residents can hand in a check, if you have one. Leave empty if not."
              >
                <Input className={BIG_INPUT} value={values.checkDropOff} onChange={set('checkDropOff')} maxLength={300} />
              </Field>
            </fieldset>

            <Field
              label="Note to residents"
              optional
              error={fieldErrors.instructions}
              hint="Shown with the payment steps. For example, who to call with a question."
            >
              <Textarea className="text-base" value={values.instructions} onChange={set('instructions')} maxLength={500} rows={3} />
            </Field>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2">
            {configured ? (
              <Button type="button" size="lg" className="min-h-12 text-base" variant="destructive-ghost" onClick={onTurnOff} disabled={pending}>
                Turn off
              </Button>
            ) : null}
            <Button type="submit" size="lg" className="min-h-12 text-base" loading={pending} icon={<Save aria-hidden />}>
              {configured ? 'Save changes' : 'Save how residents pay'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">This is what residents will see</CardTitle>
          <CardDescription className="text-base">
            A live preview of the Pay screen for a sample $325.00 dues charge. It updates as you type.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-base">
          {previewRecipient ? (
            <div className="rounded-xl bg-background p-3 sm:p-4">
              <ZellePayInstructions
                recipient={previewRecipient}
                recipientName={values.recipientName.trim() || null}
                instructions={previewChecks ? null : values.instructions.trim() || null}
                lines={[
                  {
                    assessmentId: 'preview',
                    label: 'Regular dues',
                    dueDate: format(new Date(), 'yyyy-MM-01'),
                    amount: 325,
                    memoCode: sampleMemoCode,
                    autoMatch: sampleMemoCode != null,
                  },
                ]}
              />
            </div>
          ) : null}
          {previewChecks ? (
            <div className="rounded-xl bg-background p-3 sm:p-4">
              <CheckPayCard
                checks={previewChecks}
                amountDue={325}
                instructions={previewRecipient ? null : values.instructions.trim() || null}
              />
            </div>
          ) : null}
          {!previewRecipient && !previewChecks ? (
            <p className="rounded-xl bg-subtle p-4 text-base text-foreground-secondary">
              Residents see: <span className="font-medium text-foreground">“Your board hasn’t shared how to pay yet”</span>{' '}
              with a note to contact the board. Add Zelle or check details above to preview the Pay screen.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}
