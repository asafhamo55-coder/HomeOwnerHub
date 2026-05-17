'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
  type PlaidLinkOptions,
} from 'react-plaid-link'
import { Link2, Loader2 } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'

interface FundOption {
  id: string
  label: string
}

/**
 * Client-side Plaid Link launcher. Two-step UX:
 *   1. User picks which fund the new accounts attach to.
 *   2. Click "Link" → we fetch a link_token from the backend, open the
 *      Plaid Link popup, and on success POST the public_token to
 *      /api/plaid/exchange (which stores access_token + creates
 *      bank_accounts rows).
 *
 * Renders a clear 503 fallback if PLAID_CLIENT_ID/SECRET aren't set
 * server-side — the link-token route returns 503 with a plaid_not_configured
 * code, which we surface verbatim.
 */
export function LinkPlaidButton({ funds }: { funds: FundOption[] }) {
  const router = useRouter()
  const [fundId, setFundId] = useState(funds[0]?.id ?? '')
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSuccess = useCallback(
    async (publicToken: string, _meta: PlaidLinkOnSuccessMetadata) => {
      setError(null)
      setBusy(true)
      try {
        const res = await fetch('/api/plaid/exchange', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken, fundId }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.ok) {
          setError(body?.message ?? body?.error ?? `exchange failed (${res.status})`)
          return
        }
        router.refresh()
      } finally {
        setBusy(false)
        setLinkToken(null)
      }
    },
    [fundId, router],
  )

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) setError(err.display_message ?? err.error_message ?? 'link exited')
      setLinkToken(null)
    },
  }
  const { open, ready } = usePlaidLink(config)

  // Open Link automatically once we have a token. Keeping it as an
  // effect rather than chaining off the fetch lets us let the hook's
  // ready signal gate the open() call.
  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  async function handleLink() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.link_token) {
        setError(body?.message ?? body?.error ?? `link_token failed (${res.status})`)
        return
      }
      setLinkToken(body.link_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'link_token request failed')
    } finally {
      setBusy(false)
    }
  }

  if (funds.length === 0) {
    return (
      <Alert variant="warning">
        Seed a fund first (Operating / Reserve) before linking a bank account.
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Attach to fund
        <select
          value={fundId}
          onChange={(e) => setFundId(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          disabled={busy}
        >
          {funds.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>
      <Button onClick={handleLink} disabled={busy} size="sm">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        Link bank account
      </Button>
      {error ? <Alert variant="error" className="text-xs">{error}</Alert> : null}
    </div>
  )
}
