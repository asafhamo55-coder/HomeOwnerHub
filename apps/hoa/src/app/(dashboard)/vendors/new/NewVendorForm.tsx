'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Textarea,
} from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createVendor } from '@/lib/vendors'

type Errors = Record<string, string>

export function NewVendorForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [tradesText, setTradesText] = useState('')
  const [zipsText, setZipsText] = useState('')
  const notesRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})
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
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setFieldErrors(result.fieldErrors)
          setError('Fix the highlighted fields and try again.')
        } else {
          setError(result.error)
        }
        return
      }
      router.push(`/vendors/${result.data.vendorId}/compliance`)
    })
  }

  const fe = (k: string) => fieldErrors[k]

  return (
    <form action={handleSubmit} className="space-y-6" noValidate>
      <Section title="Identity" description="Who the vendor is, as on their W-9.">
        <Field label="Legal name" required error={fe('legal_name')}>
          <Input name="legalName" required placeholder="ACME Landscaping LLC" />
        </Field>
        <Field label="DBA (doing business as)" optional error={fe('dba')}>
          <Input name="dba" placeholder="ACME Lawn Care" />
        </Field>
        <Field
          label="EIN"
          required
          error={fe('ein')}
          hint="9 digits, e.g. 12-3456789. Required for 1099 reporting on vendors paid over $600 a year."
        >
          <Input name="ein" required placeholder="12-3456789" inputMode="numeric" />
        </Field>
      </Section>

      <Section title="Contact" description="At least one of email or phone is required.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary email" error={fe('primary_email')}>
            <Input name="primaryEmail" type="email" placeholder="ops@acme.com" />
          </Field>
          <Field label="Primary phone" error={fe('primary_phone')}>
            <Input name="primaryPhone" type="tel" placeholder="(555) 123-4567" />
          </Field>
        </div>
      </Section>

      <Section title="Business address" description="Used for 1099 mailing and to cross-check the COI.">
        <Field label="Street" optional error={fe('address')}>
          <Input name="addr_line1" placeholder="123 Main St" />
        </Field>
        <Field label="Suite / unit" optional>
          <Input name="addr_line2" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" optional>
            <Input name="addr_city" />
          </Field>
          <Field label="State" optional>
            <Input name="addr_state" placeholder="FL" maxLength={2} />
          </Field>
          <Field label="ZIP" optional>
            <Input name="addr_postal_code" placeholder="30303" inputMode="numeric" />
          </Field>
        </div>
      </Section>

      <Section title="Trades and service area">
        <Field
          label="Trades"
          required
          error={fe('trades')}
          hint="Comma-separated. Plumbing, electrical, HVAC and roofing require a license on the compliance check."
        >
          <Input
            name="trades"
            placeholder="landscaping, irrigation"
            value={tradesText}
            onChange={(e) => setTradesText(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Service area ZIPs"
          optional
          error={fe('service_area_zips')}
          hint="Comma- or space-separated 5-digit ZIPs."
        >
          <Input
            name="service_area_zips"
            placeholder="30303, 30305, 30309"
            value={zipsText}
            onChange={(e) => setZipsText(e.target.value)}
            inputMode="numeric"
          />
        </Field>
      </Section>

      <Section title="Notes">
        <Field
          label="Internal notes"
          optional
          error={fe('notes')}
          labelAside={
            <AiRewriteButton
              textareaRef={notesRef}
              context="Internal board notes about a vendor"
              disabled={isPending}
            />
          }
        >
          <Textarea ref={notesRef} name="notes" rows={3} placeholder="Visible to your board only." />
        </Field>
      </Section>

      {error ? (
        <Alert variant="error" title="Couldn’t add the vendor">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Next you’ll upload the COI, W-9 and license and run the compliance check.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending} iconRight={<ArrowRight aria-hidden />}>
            Create and continue
          </Button>
        </div>
      </div>
    </form>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle as="h2">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
