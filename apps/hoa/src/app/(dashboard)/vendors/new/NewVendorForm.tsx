'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import { Alert, Button, Input, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createVendor } from '@/lib/vendors'

export function NewVendorForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tradesText, setTradesText] = useState('')
  const [zipsText, setZipsText] = useState('')
  const notesRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
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

      const result = await createVendor({
        legalName: String(formData.get('legalName') ?? ''),
        dba: String(formData.get('dba') ?? '').trim() || null,
        ein: String(formData.get('ein') ?? '').trim(),
        primaryEmail: String(formData.get('primaryEmail') ?? '').trim() || null,
        primaryPhone: String(formData.get('primaryPhone') ?? '').trim() || null,
        trades,
        address: hasAddress ? addr : null,
        serviceAreaZips,
        notes: String(formData.get('notes') ?? '').trim() || null,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/vendors/${result.data.vendorId}/compliance`)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Alert variant="info" title="Vendor records are private to your organization">
        <span className="block text-sm">
          Vendors you add here are visible only to your HOA. You can run a
          compliance check per association within your organization, but the
          vendor profile and ratings are never shared across other customers
          on the platform (antitrust posture per spec §14.6).
        </span>
      </Alert>

      <section className="space-y-3">
        <SectionTitle>Identity</SectionTitle>
        <Field label="Legal name" required>
          <Input name="legalName" required placeholder="ACME Landscaping LLC" />
        </Field>
        <Field label="DBA (doing business as)">
          <Input name="dba" placeholder="ACME Lawn Care" />
        </Field>
        <Field label="EIN" required>
          <Input name="ein" required placeholder="12-3456789" inputMode="numeric" />
          <Helper>9 digits, format `12-3456789`. Required for 1099 reporting on vendors paid &gt; $600/yr.</Helper>
        </Field>
      </section>

      <section className="space-y-3">
        <SectionTitle>Contact</SectionTitle>
        <Helper>At least one of email or phone is required.</Helper>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary email">
            <Input name="primaryEmail" type="email" placeholder="ops@acme.com" />
          </Field>
          <Field label="Primary phone">
            <Input name="primaryPhone" placeholder="(555) 123-4567" />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Business address</SectionTitle>
        <Helper>Used for 1099 mailing and to cross-check the COI.</Helper>
        <div className="grid gap-3">
          <Field label="Street">
            <Input name="addr_line1" placeholder="123 Main St" />
          </Field>
          <Field label="Suite / Unit (optional)">
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
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Trades & service area</SectionTitle>
        <Field label="Trades" required>
          <Input
            name="trades"
            placeholder="landscaping, irrigation"
            value={tradesText}
            onChange={(e) => setTradesText(e.target.value)}
            required
          />
          <Helper>
            Comma-separated. Trades like plumbing, electrical, HVAC, roofing
            trigger a license requirement on the compliance check.
          </Helper>
        </Field>
        <Field label="Service area ZIPs">
          <Input
            name="service_area_zips"
            placeholder="30303, 30305, 30309"
            value={zipsText}
            onChange={(e) => setZipsText(e.target.value)}
            inputMode="numeric"
          />
          <Helper>Comma- or space-separated 5-digit ZIPs.</Helper>
        </Field>
      </section>

      <section className="space-y-3">
        <SectionTitle>Notes</SectionTitle>
        <Field label="Internal notes">
          <div className="space-y-1.5">
            <div className="flex justify-end">
              <AiRewriteButton
                textareaRef={notesRef}
                context="Internal board notes about a vendor"
                disabled={isPending}
              />
            </div>
            <Textarea
              ref={notesRef}
              name="notes"
              rows={3}
              placeholder="Internal notes for the board."
            />
          </div>
        </Field>
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Create & start compliance'}
        </Button>
      </div>

      <p className="text-xs text-muted">
        <Info className="mr-1 inline h-3 w-3" />
        After saving, you'll land on the compliance page to upload the COI,
        W-9, and license and run the Vendor Onboarder workflow.
      </p>
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
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}
