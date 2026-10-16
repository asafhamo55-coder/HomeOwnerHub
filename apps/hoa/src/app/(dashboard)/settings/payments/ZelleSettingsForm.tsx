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

interface Values {
  recipient: string
  recipientName: string
  instructions: string
}

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
      toast({ tone: 'success', message: 'Saved. Residents now see Pay by Zelle.' })
      router.refresh()
    })
  }

  async function onTurnOff() {
    const ok = await confirm({
      title: 'Turn off Pay by Zelle?',
      description: 'Residents will see that online payment isn’t set up. Payments already sent still arrive and match.',
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
      setValues({ recipient: '', recipientName: initial.recipientName, instructions: '' })
      toast({ tone: 'success', message: 'Pay by Zelle is off.' })
      router.refresh()
    })
  }

  const previewRecipient = values.recipient.trim()

  return (
    <>
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardHeader className="pb-4">
            <CardTitle as="h2">Zelle details</CardTitle>
            <CardDescription>
              Use the email or phone number your association’s bank account receives Zelle on — never a board
              member’s personal account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {configured ? (
                <StatusPill tone="success" label="On — residents can pay" />
              ) : (
                <StatusPill tone="neutral" label="Off — residents see “not set up yet”" />
              )}
              {configured && updatedAt ? <span>Last saved {format(new Date(updatedAt), 'PP')}</span> : null}
            </div>
            <Field
              label="Zelle email or mobile number"
              required
              error={fieldErrors.recipient}
              hint="What residents type into “Send to” in their bank app."
            >
              <Input
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
              <Input value={values.recipientName} onChange={set('recipientName')} maxLength={80} />
            </Field>
            <Field
              label="Note to residents"
              optional
              error={fieldErrors.instructions}
              hint="Shown under the payment steps. For example, other ways to pay or who to call."
            >
              <Textarea value={values.instructions} onChange={set('instructions')} maxLength={500} rows={3} />
            </Field>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2">
            {configured ? (
              <Button type="button" variant="destructive-ghost" onClick={onTurnOff} disabled={pending}>
                Turn off
              </Button>
            ) : null}
            <Button type="submit" loading={pending} icon={<Save aria-hidden />}>
              {configured ? 'Save changes' : 'Turn on Pay by Zelle'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">What residents see</CardTitle>
          <CardDescription>
            A live preview of the Pay screen for a sample $325.00 dues charge. Each real charge carries its own
            memo code; your bank feed matches on it, and a board member approves every match before it posts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewRecipient ? (
            <div className="rounded-xl bg-background p-3 sm:p-4">
              <ZellePayInstructions
                recipient={previewRecipient}
                recipientName={values.recipientName.trim() || null}
                instructions={values.instructions.trim() || null}
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
          ) : (
            <p className="rounded-xl bg-subtle p-4 text-sm text-foreground-secondary">
              Residents see: <span className="font-medium text-foreground">“Online payments aren’t set up yet”</span>{' '}
              with a prompt to contact the board. Enter a Zelle email or number to preview the Pay screen.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
