'use client'

import { useEffect, useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import {
  quickCreateVendor,
  assignThreadToVendor,
  extractVendorFromThread,
} from '@/lib/inbox/vendor/actions'

interface Props {
  threadId: string
  senderEmail: string | null
  senderName: string | null
  initialName: string
  onClose: () => void
}

/**
 * Opens instantly with what the headers already give us — sender address and
 * display name, free and deterministic — then fills the rest from the
 * signature block.
 *
 * Every model-filled field carries a "from signature" chip that clears once
 * edited. That chip is what makes "you confirm" real rather than decorative:
 * the reviewer can see at a glance what was guessed versus what came from
 * the header. Extraction failure leaves the form fully usable.
 */
export function QuickCreateVendorModal({
  threadId,
  senderEmail,
  senderName,
  initialName,
  onClose,
}: Props) {
  // Whether the name arrived from the search box or the display name.
  // Computed from props, NOT read out of state inside the effect — mutating
  // a Set inside a setState updater would double-fire under React
  // StrictMode and mislabel which fields the model actually supplied.
  const seededName = (initialName || senderName || '').trim()

  const [legalName, setLegalName] = useState(seededName)
  const [primaryEmail, setPrimaryEmail] = useState(senderEmail ?? '')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [trade, setTrade] = useState('')
  const [aiFields, setAiFields] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await extractVendorFromThread(threadId)
      if (cancelled) return
      setExtracting(false)
      if ('error' in result) return // stay usable; extraction is not a gate

      const extracted = result.extracted
      const filled = new Set<string>()

      // Only fill the name when nothing was seeded — never overwrite what
      // the user already typed into the search box.
      if (extracted.legalName && !seededName) {
        setLegalName(extracted.legalName)
        filled.add('legalName')
      }
      if (extracted.primaryPhone) {
        setPrimaryPhone(extracted.primaryPhone)
        filled.add('primaryPhone')
      }
      if (extracted.trade) {
        setTrade(extracted.trade)
        filled.add('trade')
      }
      setAiFields(filled)
    })()
    return () => {
      cancelled = true
    }
  }, [threadId, seededName])

  function clearChip(field: string) {
    setAiFields((current) => {
      if (!current.has(field)) return current
      const next = new Set(current)
      next.delete(field)
      return next
    })
  }

  function submit() {
    setError(null)
    setDuplicateId(null)
    start(async () => {
      const result = await quickCreateVendor(threadId, {
        legalName,
        primaryEmail,
        primaryPhone: primaryPhone || null,
        trade: trade || null,
        aiGenerated: aiFields.size > 0,
      })
      if ('ok' in result) {
        onClose()
        return
      }
      setError(result.error)
      if (result.duplicateVendorId) setDuplicateId(result.duplicateVendorId)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-md border border-border bg-background p-4">
        <p className="text-sm font-semibold text-foreground">Create vendor from this email</p>
        {extracting ? <p className="text-xs text-muted">Reading the signature…</p> : null}

        <VendorField
          label="Company name"
          value={legalName}
          ai={aiFields.has('legalName')}
          onChange={(value) => {
            setLegalName(value)
            clearChip('legalName')
          }}
        />
        <VendorField label="Email" value={primaryEmail} ai={false} onChange={setPrimaryEmail} />
        <VendorField
          label="Phone"
          value={primaryPhone}
          ai={aiFields.has('primaryPhone')}
          onChange={(value) => {
            setPrimaryPhone(value)
            clearChip('primaryPhone')
          }}
        />
        <VendorField
          label="Trade"
          value={trade}
          ai={aiFields.has('trade')}
          onChange={(value) => {
            setTrade(value)
            clearChip('trade')
          }}
        />

        <p className="text-xs text-muted">
          Created as a prospect. Add an EIN and trade on the vendor page before
          using it for 1099s, RFPs, or compliance checks.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {duplicateId ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() =>
              start(async () => {
                await assignThreadToVendor(threadId, duplicateId)
                onClose()
              })
            }
          >
            File this thread under the existing vendor instead
          </Button>
        ) : null}

        <div className="flex gap-2">
          <Button
            size="sm"
            loading={pending}
            onClick={submit}
            disabled={!legalName.trim() || !primaryEmail.trim()}
          >
            Create &amp; file
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function VendorField({
  label,
  value,
  ai,
  onChange,
}: {
  label: string
  value: string
  ai: boolean
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {ai ? (
          <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-normal normal-case text-primary">
            from signature
          </span>
        ) : null}
      </label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        autoComplete="off"
      />
    </div>
  )
}
