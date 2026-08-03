'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
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
    <section className="space-y-3 rounded-md border border-border p-3">
      {accounts.length > 1 ? (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Send from
          </label>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email_address}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-muted">Sending from {accounts[0].email_address}</p>
      )}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Button size="sm" loading={pending} onClick={start}>
        Start writing
      </Button>
    </section>
  )
}
