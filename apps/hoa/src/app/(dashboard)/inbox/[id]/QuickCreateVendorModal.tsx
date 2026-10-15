'use client'

import { useEffect, useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { Alert, Badge, Button, Dialog, DialogContent, Field, Input } from '@homeowner-portal/ui'
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
 * Every model-filled field carries a provenance chip that clears once
 * edited — "from signature" for the body, "from W-9" for anything an
 * attached document supplied. That chip is what makes "you confirm" real rather than decorative:
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
  const [ein, setEin] = useState('')
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
      // Only ever set when a W-9 (or similar) supplied it — W33 drops an EIN
      // that had no document behind it. Chipped separately from the
      // signature fields so the reviewer knows to check it against the doc.
      if (extracted.ein) {
        setEin(extracted.ein)
        filled.add('ein')
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
        ein: ein.trim() || null,
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
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        title="Create vendor from this email"
        description={extracting ? 'Reading the signature…' : 'Check what was read from the email before saving.'}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button loading={pending} onClick={submit} disabled={!legalName.trim() || !primaryEmail.trim()}>
              Create &amp; file
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <VendorField
            label="Company name"
            required
            value={legalName}
            ai={aiFields.has('legalName')}
            onChange={(value) => {
              setLegalName(value)
              clearChip('legalName')
            }}
          />
          <VendorField label="Email" required type="email" value={primaryEmail} ai={false} onChange={setPrimaryEmail} />
          <div className="grid gap-4 sm:grid-cols-2">
            <VendorField
              label="Phone"
              type="tel"
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
          </div>
          <VendorField
            label="EIN"
            value={ein}
            ai={aiFields.has('ein')}
            aiLabel="from W-9"
            hint={
              aiFields.has('ein')
                ? 'Read from an attached document. Check it against the W-9 before saving — this feeds 1099 reporting.'
                : undefined
            }
            onChange={(value) => {
              setEin(value)
              clearChip('ein')
            }}
          />

          <p className="text-xs text-muted">
            Created as a prospect. Anything left blank here — an EIN especially — must be filled in
            on the vendor page before this vendor can be used for 1099s, RFPs, or compliance checks.
          </p>

          {error ? <Alert variant="error">{error}</Alert> : null}
          {duplicateId ? (
            <Button
              size="sm"
              variant="secondary"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VendorField({
  label,
  value,
  ai,
  onChange,
  aiLabel = 'from signature',
  required,
  type = 'text',
  hint,
}: {
  label: string
  value: string
  ai: boolean
  onChange: (value: string) => void
  aiLabel?: string
  required?: boolean
  type?: string
  hint?: string
}) {
  return (
    <Field
      label={label}
      required={required}
      hint={hint}
      labelAside={
        ai ? (
          <Badge variant="ai" size="sm" icon={<Sparkles aria-hidden />}>
            {aiLabel}
          </Badge>
        ) : null
      }
    >
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" />
    </Field>
  )
}
