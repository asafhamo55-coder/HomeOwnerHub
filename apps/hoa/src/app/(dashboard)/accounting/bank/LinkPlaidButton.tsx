'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccessMetadata, type PlaidLinkOptions } from 'react-plaid-link'
import { Link2 } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, DialogTrigger, Field, Select, useToast } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'

interface FundOption {
  id: string
  label: string
}

/**
 * Link a bank account through Plaid, in two steps:
 *   1. a dialog asks which fund the new accounts belong to;
 *   2. "Continue to Plaid" fetches a link token, CLOSES the dialog, then
 *      opens Plaid's own popup.
 *
 * The dialog must be closed before Plaid opens: a Radix modal makes the
 * rest of the page inert (pointer-events: none on body), which would
 * swallow every click inside Plaid's iframe.
 *
 * A failure from /api/plaid/link-token (e.g. 503 not_configured) is surfaced as
 * the envelope's message via responseErrorMessage.
 */
export function LinkPlaidButton({
  funds,
  variant = 'default',
  label = 'Link bank account',
}: {
  funds: FundOption[]
  variant?: 'default' | 'secondary'
  /** Trigger text; the empty state says "Connect bank". */
  label?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [fundId, setFundId] = useState(funds[0]?.id ?? '')
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSuccess = useCallback(
    async (publicToken: string, _meta: PlaidLinkOnSuccessMetadata) => {
      setBusy(true)
      try {
        const res = await fetch('/api/plaid/exchange', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ publicToken, fundId }),
        })
        if (!res.ok) {
          toast({
            tone: 'error',
            title: 'Couldn’t link the account',
            message: await responseErrorMessage(res, `Exchange failed (${res.status}).`),
          })
          return
        }
        toast({ tone: 'success', message: 'Bank account linked. Transactions will appear after the first sync.' })
        router.refresh()
      } finally {
        setBusy(false)
        setLinkToken(null)
      }
    },
    [fundId, router, toast],
  )

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) toast({ tone: 'error', title: 'Plaid closed', message: err.display_message ?? err.error_message ?? 'The bank link was not completed.' })
      setLinkToken(null)
    },
  }
  const { open: openPlaid, ready } = usePlaidLink(config)

  useEffect(() => {
    if (linkToken && ready && !open) openPlaid()
  }, [linkToken, ready, open, openPlaid])

  async function handleContinue() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' })
      if (!res.ok) {
        setError(await responseErrorMessage(res, `Couldn’t start Plaid (${res.status}).`))
        return
      }
      const body = (await res.json().catch(() => null)) as { linkToken?: unknown } | null
      if (typeof body?.linkToken !== 'string' || !body.linkToken) {
        setError('Couldn’t start Plaid. Try again in a moment.')
        return
      }
      setOpen(false)
      setLinkToken(body.linkToken)
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={variant} icon={<Link2 aria-hidden />} loading={busy && !open}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Link a bank account"
        description="Plaid opens in a secure window to sign in to your bank — we never see your bank credentials. New accounts attach to the fund you pick here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleContinue} loading={busy} disabled={!fundId}>
              Continue to Plaid
            </Button>
          </>
        }
      >
        {funds.length === 0 ? (
          <Alert variant="warning">This association has no funds yet, so there is nothing to attach an account to. Contact support.</Alert>
        ) : (
          <div className="space-y-4">
            <Field label="Fund" required hint="Operating for day-to-day checking; Reserve for savings set aside for repairs.">
              <Select value={fundId} onValueChange={setFundId} disabled={busy}>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            {error ? <Alert variant="error">{error}</Alert> : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
