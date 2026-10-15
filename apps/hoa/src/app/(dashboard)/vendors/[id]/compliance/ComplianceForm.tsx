'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  StatusBadge,
  StatusPill,
} from '@homeowner-portal/ui'
import {
  COMPLIANCE_LABELS,
  COMPLIANCE_TONES,
  DEFICIENCY_LABELS,
  DEFICIENCY_TONES,
} from '@/lib/status/vendors'
import { runComplianceCheck } from '@/lib/vendors'

type ComplianceStatus = 'green' | 'yellow' | 'red' | 'missing'

interface Result {
  status: ComplianceStatus
  deficiencies: Array<{ code: string; severity: string; detail: string }>
  summary: string
  runId: string
}

export function ComplianceForm({ vendorId }: { vendorId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setResult(null)

    const num = (k: string): number | null => {
      const raw = String(formData.get(k) ?? '').trim()
      if (!raw) return null
      const n = Number(raw.replace(/[^0-9.]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    const str = (k: string): string | null => {
      const raw = String(formData.get(k) ?? '').trim()
      return raw || null
    }
    const bool = (k: string): boolean =>
      String(formData.get(k) ?? '') === 'on'

    const coiCarrier = str('coi_carrier')
    const w9Name = str('w9_legalName')
    const licenseNumber = str('license_number')

    const manualExtract = {
      coi: coiCarrier
        ? {
            carrier: coiCarrier,
            policyNumber: str('coi_policyNumber'),
            effectiveDate: str('coi_effectiveDate'),
            expirationDate: str('coi_expirationDate'),
            generalLiabilityPerOccurrence: num('coi_glPer'),
            generalLiabilityAggregate: num('coi_glAgg'),
            workersComp: bool('coi_workersComp'),
            autoLiability: num('coi_auto'),
            umbrella: num('coi_umbrella'),
            additionalInsuredPresent: bool('coi_additionalInsured'),
            extractionConfidence: 'HIGH' as const,
          }
        : null,
      w9: w9Name
        ? {
            legalName: w9Name,
            einMasked: str('w9_einMasked'),
            address: str('w9_address'),
            classification: str('w9_classification'),
            extractionConfidence: 'HIGH' as const,
          }
        : null,
      license: licenseNumber
        ? {
            number: licenseNumber,
            state: str('license_state'),
            trade: str('license_trade'),
            expiration: str('license_expiration'),
            status: str('license_status'),
            extractionConfidence: 'HIGH' as const,
          }
        : null,
    }

    startTransition(async () => {
      const res = await runComplianceCheck({ vendorId, manualExtract })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResult(res.data)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <form action={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle as="h2">Certificate of insurance</CardTitle>
            <CardDescription>Leave the carrier blank to skip the COI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Carrier">
                <Input name="coi_carrier" placeholder="Hartford" />
              </Field>
              <Field label="Policy #">
                <Input name="coi_policyNumber" placeholder="GL-12345" />
              </Field>
              <Field label="Effective date">
                <Input name="coi_effectiveDate" type="date" />
              </Field>
              <Field label="Expiration date">
                <Input name="coi_expirationDate" type="date" />
              </Field>
              <Field label="GL per-occurrence ($)">
                <Input name="coi_glPer" inputMode="numeric" placeholder="1000000" />
              </Field>
              <Field label="GL aggregate ($)">
                <Input name="coi_glAgg" inputMode="numeric" placeholder="2000000" />
              </Field>
              <Field label="Auto liability ($)">
                <Input name="coi_auto" inputMode="numeric" placeholder="1000000" />
              </Field>
              <Field label="Umbrella ($)">
                <Input name="coi_umbrella" inputMode="numeric" />
              </Field>
            </div>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:gap-6">
              <Checkbox name="coi_workersComp" label="Workers’ comp included" />
              <Checkbox name="coi_additionalInsured" label="Association listed as additional insured" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle as="h2">W-9</CardTitle>
            <CardDescription>Leave the legal name blank to skip the W-9.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal name">
              <Input name="w9_legalName" />
            </Field>
            <Field label="EIN (masked or last 4)">
              <Input name="w9_einMasked" placeholder="***-**-1234" />
            </Field>
            <Field label="Business classification">
              <Input name="w9_classification" placeholder="LLC" />
            </Field>
            <Field label="Address">
              <Input name="w9_address" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle as="h2">Contractor license</CardTitle>
            <CardDescription>Leave the license number blank to skip the license.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="License #">
              <Input name="license_number" />
            </Field>
            <Field label="State">
              <Input name="license_state" placeholder="GA" />
            </Field>
            <Field label="Trade">
              <Input name="license_trade" placeholder="plumbing" />
            </Field>
            <Field label="Status">
              <Input name="license_status" placeholder="active" />
            </Field>
            <Field label="Expiration">
              <Input name="license_expiration" type="date" />
            </Field>
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="error" title="The compliance check didn’t run">
            {error}
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="submit" loading={isPending} icon={<Sparkles aria-hidden />}>
            {isPending ? 'Checking…' : 'Run compliance check'}
          </Button>
        </div>
      </form>

      {result ? (
        <Card role="status">
          <CardHeader
            className="pb-3"
            actions={<StatusBadge status={result.status} tones={COMPLIANCE_TONES} labels={COMPLIANCE_LABELS} />}
          >
            <CardTitle as="h2">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground">{result.summary}</p>
            {result.deficiencies.length > 0 ? (
              <ul className="space-y-2">
                {result.deficiencies.map((d, i) => (
                  <li
                    key={`${d.code}-${i}`}
                    className="flex items-start gap-3 rounded-lg border border-border bg-subtle p-3 text-sm"
                  >
                    <StatusPill
                      tone={DEFICIENCY_TONES[d.severity] ?? 'warning'}
                      label={DEFICIENCY_LABELS[d.severity] ?? d.severity}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">{d.code}</p>
                      <p className="text-foreground">{d.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No deficiencies.</p>
            )}
            <p className="text-xs text-muted">Run reference {result.runId}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
