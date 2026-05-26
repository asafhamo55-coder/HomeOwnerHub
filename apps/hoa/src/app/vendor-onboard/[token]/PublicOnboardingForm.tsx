'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp } from 'lucide-react'
import { Button, Input, Textarea } from '@homeowner-portal/ui'

interface Props {
  token: string
  inviteeEmail: string
  inviteeName: string | null
}

export function PublicOnboardingForm({ token, inviteeEmail, inviteeName }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [tradesText, setTradesText] = useState('')
  const [zipsText, setZipsText] = useState('')

  const coiRef = useRef<HTMLInputElement>(null)
  const w9Ref = useRef<HTMLInputElement>(null)
  const licenseRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})

    const trades = tradesText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const serviceAreaZips = zipsText
      .split(/[\s,]+/)
      .map((z) => z.trim())
      .filter(Boolean)

    const addr = {
      line1: String(formData.get('addr_line1') ?? '').trim() || null,
      line2: String(formData.get('addr_line2') ?? '').trim() || null,
      city: String(formData.get('addr_city') ?? '').trim() || null,
      state: String(formData.get('addr_state') ?? '').trim() || null,
      postal_code: String(formData.get('addr_postal_code') ?? '').trim() || null,
    }
    const hasAddress = Object.values(addr).some((v) => v != null && v !== '')

    const einRaw = String(formData.get('ein') ?? '').trim()
    const payload = {
      legal_name: String(formData.get('legalName') ?? '').trim(),
      dba: String(formData.get('dba') ?? '').trim() || null,
      ein: einRaw,
      primary_email: String(formData.get('primaryEmail') ?? '').trim() || null,
      primary_phone: String(formData.get('primaryPhone') ?? '').trim() || null,
      trades,
      address: hasAddress ? addr : null,
      service_area_zips: serviceAreaZips,
    }

    // ─── Client-side validation ────────────────────────────────────
    // Catch the most common formatting issues here so the user sees
    // the error inline (under the field) instead of after a server
    // round-trip. Server still re-validates — this is UX, not a
    // security boundary.
    const newFieldErrors: Record<string, string> = {}
    if (payload.legal_name.length < 2) {
      newFieldErrors.legal_name = 'Legal name is required.'
    }
    const einDigits = einRaw.replace(/\D/g, '')
    if (einDigits.length !== 9) {
      newFieldErrors.ein =
        'EIN must contain exactly 9 digits (formatting like hyphens or spaces is fine).'
    }
    if (!payload.primary_email && !payload.primary_phone) {
      newFieldErrors.primary_email = 'Email or phone is required.'
    }
    if (trades.length === 0) {
      newFieldErrors.trades = 'List at least one trade (comma-separated).'
    }
    const badZipIdx = serviceAreaZips.findIndex((z) => !/^\d{5}(-\d{4})?$/.test(z))
    if (badZipIdx >= 0) {
      newFieldErrors.service_area_zips = `ZIP code "${serviceAreaZips[badZipIdx]}" isn't valid — use 5 digits or ZIP+4 (e.g. 30022 or 30022-1234).`
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors)
      setError('Please fix the highlighted fields above and try again.')
      return
    }

    const body = new FormData()
    body.append('payload', JSON.stringify(payload))
    const coiFile = coiRef.current?.files?.[0]
    const w9File = w9Ref.current?.files?.[0]
    const licenseFile = licenseRef.current?.files?.[0]
    if (coiFile) body.append('file_coi', coiFile)
    if (w9File) body.append('file_w9', w9File)
    if (licenseFile) body.append('file_license', licenseFile)

    startTransition(async () => {
      const res = await fetch(`/api/vendor-onboard/${token}/submit`, {
        method: 'POST',
        body,
      })
      if (!res.ok) {
        type ZodIssue = { path?: (string | number)[]; message?: string }
        type WrappedBody = {
          message?: string
          error?: string
          issues?: ZodIssue[]
        }
        const raw = (await res.json().catch(() => null)) as
          | WrappedBody
          | ZodIssue[]
          | null

        // Normalize: the route returns { error, issues }, but be
        // defensive — some error paths return the issues array bare,
        // and we never want raw JSON visible to the user.
        let issues: ZodIssue[] | undefined
        let topLevelMessage: string | undefined
        if (Array.isArray(raw)) {
          issues = raw
        } else if (raw && typeof raw === 'object') {
          issues = raw.issues
          topLevelMessage = raw.message ?? raw.error ?? undefined
        }

        if (issues && issues.length > 0) {
          const mapped: Record<string, string> = {}
          for (const iss of issues) {
            const key = String(iss.path?.[0] ?? '_')
            if (!mapped[key] && iss.message) mapped[key] = iss.message
          }
          setFieldErrors(mapped)
          setError(
            'Please fix the highlighted fields above and try again.',
          )
        } else {
          setError(topLevelMessage ?? 'Submission failed. Please try again.')
        }
        return
      }
      router.push(`/vendor-onboard/${token}/submitted`)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <section className="space-y-3">
        <SectionTitle>Identity</SectionTitle>
        <Field label="Legal business name" required error={fieldErrors.legal_name}>
          <Input
            name="legalName"
            required
            defaultValue={inviteeName ?? ''}
            placeholder="ACME Landscaping LLC"
          />
        </Field>
        <Field label="DBA (doing business as)">
          <Input name="dba" placeholder="ACME Lawn Care" />
        </Field>
        <Field label="EIN" required error={fieldErrors.ein}>
          <Input name="ein" required placeholder="12-3456789" inputMode="numeric" />
          <Helper>9 digits — formatting like hyphens, spaces, or periods is fine. Required so the HOA can issue a 1099.</Helper>
        </Field>
      </section>

      <section className="space-y-3">
        <SectionTitle>Contact</SectionTitle>
        <Helper>At least one of email or phone is required.</Helper>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary email" error={fieldErrors.primary_email}>
            <Input
              name="primaryEmail"
              type="email"
              defaultValue={inviteeEmail}
              placeholder="ops@acme.com"
            />
          </Field>
          <Field label="Primary phone" error={fieldErrors.primary_phone}>
            <Input name="primaryPhone" placeholder="(555) 123-4567" />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Business address</SectionTitle>
        <Field label="Street">
          <Input name="addr_line1" placeholder="123 Main St" />
        </Field>
        <Field label="Suite / Unit">
          <Input name="addr_line2" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City">
            <Input name="addr_city" />
          </Field>
          <Field label="State">
            <Input name="addr_state" placeholder="GA" maxLength={2} />
          </Field>
          <Field label="ZIP">
            <Input name="addr_postal_code" placeholder="30303" inputMode="numeric" />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Trades & service area</SectionTitle>
        <Field label="Trades" required error={fieldErrors.trades}>
          <Input
            name="trades"
            value={tradesText}
            onChange={(e) => setTradesText(e.target.value)}
            placeholder="landscaping, irrigation"
            required
          />
          <Helper>Comma-separated. List every trade you offer.</Helper>
        </Field>
        <Field label="Service area ZIPs" error={fieldErrors.service_area_zips}>
          <Input
            name="service_area_zips"
            value={zipsText}
            onChange={(e) => setZipsText(e.target.value)}
            placeholder="30303, 30305, 30309"
            inputMode="numeric"
          />
          <Helper>Comma- or space-separated. 5-digit ZIPs or ZIP+4 both work.</Helper>
        </Field>
      </section>

      <section className="space-y-3">
        <SectionTitle>Compliance documents (optional)</SectionTitle>
        <Helper>
          PDFs or images, under 25 MB each. You can also upload these later
          if you don't have them on hand.
        </Helper>
        <div className="grid gap-3 sm:grid-cols-3">
          <FileSlot label="Certificate of Insurance" inputRef={coiRef} />
          <FileSlot label="W-9" inputRef={w9Ref} />
          <FileSlot label="Contractor license" inputRef={licenseRef} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Anything else?</SectionTitle>
        <Textarea name="notes" rows={3} placeholder="Optional notes for the HOA." />
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Submitting…' : 'Submit'}
        </Button>
      </div>
    </form>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  )
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  /** Per-field validation message. Rendered red under the input. */
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="block text-xs font-medium text-destructive">{error}</span>
      ) : null}
    </label>
  )
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}

function FileSlot({
  label,
  inputRef,
}: {
  label: string
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-4 text-center">
      <FileUp className="h-5 w-5 text-muted" />
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        {fileName ? 'Replace' : 'Choose file'}
      </Button>
      {fileName ? (
        <span className="line-clamp-1 max-w-full text-xs text-muted">{fileName}</span>
      ) : null}
    </div>
  )
}
