'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PenSquare } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardFooter,
  Field,
  Select,
} from '@homeowner-portal/ui'
import { createComposeDraft } from '@/lib/inbox/draft/actions'

export function ComposeStarter({
  accounts,
}: {
  accounts: Array<{ id: string; email_address: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [accountId, setAccountId] = useState(accounts[0].id)

  function start() {
    setError(null)
    startTransition(async () => {
      const result = await createComposeDraft(accountId)
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.replace(`/inbox/compose?draft=${result.draftId}`)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {accounts.length > 1 ? (
          <Field label="Send from">
            <Select value={accountId} onValueChange={setAccountId}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email_address}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-foreground-secondary">
            Sending from <span className="font-medium text-foreground">{accounts[0].email_address}</span>
          </p>
        )}
        <p className="text-xs text-muted">
          You&apos;ll add recipients, a subject and attachments next. Nothing sends until you approve it.
        </p>
        {error ? <Alert variant="error">{error}</Alert> : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button loading={pending} onClick={start} icon={<PenSquare aria-hidden />}>
          Start writing
        </Button>
      </CardFooter>
    </Card>
  )
}
