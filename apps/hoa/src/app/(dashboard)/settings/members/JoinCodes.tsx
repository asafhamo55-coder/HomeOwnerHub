'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, X } from 'lucide-react'
import { Alert, Button, Field, Select } from '@homeowner-portal/ui'
import { issueJoinCode, revokeJoinCode } from '@/lib/owner-join/actions'
import type { JoinHome, LiveJoinCode } from '@/lib/owner-join/board'

// BL-143: a one-time code for one home, for an owner who already has an
// account (or whose address the board would rather confirm by hand). The
// code shows once; only its fingerprint is kept. The owner enters it on
// "Ask to join", and the request still comes to Approvals.

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function JoinCodes({ homes, codes }: { homes: JoinHome[] | null; codes: LiveJoinCode[] | null }) {
  const router = useRouter()
  const [unitId, setUnitId] = useState('')
  const [issued, setIssued] = useState<{ code: string; home: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function issue() {
    setError(null)
    if (!unitId) {
      setError('Choose a home.')
      return
    }
    startTransition(async () => {
      const r = await issueJoinCode(unitId)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setIssued({ code: r.code, home: homes?.find((h) => h.id === unitId)?.label ?? 'the home', expiresAt: r.expiresAt })
      router.refresh()
    })
  }

  function revoke(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await revokeJoinCode(id)
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }

  if (homes === null) return <Alert variant="warning" title="Couldn’t load your homes">Reload the page to try again.</Alert>

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Home" className="min-w-0 flex-1">
          <Select
            value={unitId}
            onValueChange={setUnitId}
            disabled={pending}
            placeholder="Choose a home…"
            options={homes.map((h) => ({ value: h.id, label: h.label }))}
          />
        </Field>
        <Button type="button" variant="secondary" icon={<KeyRound aria-hidden />} loading={pending} onClick={issue}>
          Make a code
        </Button>
      </div>

      {issued ? (
        <Alert variant="success" title={`Code for ${issued.home}`}>
          <p>
            <span className="num select-all text-base font-semibold tracking-wider">{issued.code}</span>
          </p>
          <p>
            Give it to the owner yourself. It works once, until {day(issued.expiresAt)}. We don’t keep the code, so copy it now — you can make
            another any time.
          </p>
        </Alert>
      ) : null}

      {error ? <Alert variant="error" title="Couldn’t do that">{error}</Alert> : null}

      {codes === null ? (
        <p className="text-xs text-muted">Couldn’t load the codes still waiting to be used.</p>
      ) : codes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">Codes not used yet</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {codes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{c.home ?? 'Home not found'}</span>
                  <span className="text-xs text-muted">Works until {day(c.expiresAt)}</span>
                </span>
                <Button type="button" size="sm" variant="ghost" icon={<X aria-hidden />} disabled={pending} onClick={() => revoke(c.id)}>
                  Cancel code
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
