import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileCheck2, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getVendor, type ComplianceStatus } from '@/lib/vendors'
import { ApproveVendorButton } from './ApproveVendorButton'

const COMPLIANCE_VARIANT: Record<ComplianceStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  green: 'success',
  yellow: 'warning',
  red: 'destructive',
  missing: 'outline',
}

const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  green: 'Compliant',
  yellow: 'Action soon',
  red: 'Non-compliant',
  missing: 'Docs missing',
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const vendor = await getVendor(id)
  if (!vendor) notFound()

  const compliance = vendor.compliance
  const status = compliance?.coi_status ?? null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/vendors"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to vendors
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">{vendor.legal_name}</h1>
          {vendor.dba ? (
            <p className="text-sm text-muted-fg">d/b/a {vendor.dba}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-fg">
            {(vendor.trades ?? []).join(', ') || 'No trades on file'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <Badge variant={COMPLIANCE_VARIANT[status]}>
              {COMPLIANCE_LABEL[status]}
            </Badge>
          ) : (
            <Badge variant="outline">No review yet</Badge>
          )}
          <Badge variant="outline">{vendor.status}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/vendors/${vendor.id}/compliance`}>
              <FileCheck2 className="h-4 w-4" />
              Run compliance check
            </Link>
          </Button>
          {status === 'green' && vendor.status === 'prospect' ? (
            <ApproveVendorButton vendorId={vendor.id} />
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <KV label="Email" value={vendor.primary_email} />
            <KV label="Phone" value={vendor.primary_phone} />
            <KV label="EIN" value={maskEin(vendor.ein)} />
            <KV label="Address" value={formatAddress(vendor.address)} />
            <KV
              label="Service area"
              value={
                vendor.service_area_zips && vendor.service_area_zips.length > 0
                  ? vendor.service_area_zips.join(', ')
                  : null
              }
            />
            <KV
              label="Added"
              value={format(new Date(vendor.created_at), 'PP')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Compliance</CardTitle>
              {compliance?.last_reviewed_at ? (
                <span className="text-xs text-muted-fg">
                  Reviewed {format(new Date(compliance.last_reviewed_at), 'PP')}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {compliance ? (
              <>
                <KV label="COI carrier" value={compliance.coi_carrier} />
                <KV label="Policy #" value={compliance.coi_policy_number} />
                <KV
                  label="GL / occurrence"
                  value={fmtCurrency(compliance.coi_general_liability_per_occurrence)}
                />
                <KV
                  label="GL aggregate"
                  value={fmtCurrency(compliance.coi_general_liability_aggregate)}
                />
                <KV
                  label="COI expires"
                  value={
                    compliance.coi_expiration_date
                      ? format(new Date(compliance.coi_expiration_date), 'PP')
                      : null
                  }
                />
                <KV
                  label="Workers' comp"
                  value={
                    compliance.coi_workers_comp == null
                      ? null
                      : compliance.coi_workers_comp
                        ? 'Yes'
                        : 'No'
                  }
                />
                <KV
                  label="Additional insured"
                  value={
                    compliance.coi_additional_insured_present == null
                      ? null
                      : compliance.coi_additional_insured_present
                        ? 'Yes'
                        : 'No'
                  }
                />
                <KV label="W-9 on file" value={compliance.w9_on_file ? 'Yes' : 'No'} />
                <KV label="License #" value={compliance.license_number} />
                <KV
                  label="License expires"
                  value={
                    compliance.license_expiration
                      ? format(new Date(compliance.license_expiration), 'PP')
                      : null
                  }
                />
              </>
            ) : (
              <p className="text-muted-fg">
                No compliance review on file yet.{' '}
                <Link
                  href={`/vendors/${vendor.id}/compliance`}
                  className="font-medium text-primary hover:underline"
                >
                  Run one now →
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {compliance?.deficiencies && compliance.deficiencies.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">
                Deficiencies ({compliance.deficiencies.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {compliance.deficiencies.map((d, i) => (
              <div
                key={`${d.code}-${i}`}
                className="flex items-start gap-3 rounded-md border border-border bg-muted/10 p-3"
              >
                <Badge
                  variant={d.severity === 'red' ? 'destructive' : 'warning'}
                  size="sm"
                >
                  {d.severity}
                </Badge>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-mono text-xs text-muted-fg">{d.code}</p>
                  <p className="text-muted">{d.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {vendor.documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Documents ({vendor.documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {vendor.documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/10 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <Badge variant="outline" size="sm">
                      {d.doc_type}
                    </Badge>
                    <span className="ml-2 text-xs text-muted-fg">
                      {d.storage_path.split('/').slice(-1)[0]}
                    </span>
                  </div>
                  <span className="text-xs text-muted-fg">
                    {format(new Date(d.uploaded_at), 'PP')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-fg">
              <Link
                href={`/vendors/${vendor.id}/compliance`}
                className="font-medium text-primary hover:underline"
              >
                Manage documents →
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : null}

      {vendor.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted">{vendor.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-fg">{label}</span>
      <span className="truncate text-right">
        {value == null || value === '' ? (
          <span className="text-muted-fg">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  )
}

function maskEin(ein: string | null): string | null {
  if (!ein) return null
  const trimmed = ein.replace(/\s+/g, '')
  if (trimmed.length < 4) return '***'
  return `***-**-${trimmed.slice(-4)}`
}

function formatAddress(
  address: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null } | null,
): string | null {
  if (!address) return null
  const line1 = [address.line1, address.line2].filter(Boolean).join(', ')
  const line2 = [address.city, address.state, address.postal_code].filter(Boolean).join(' ')
  const joined = [line1, line2].filter(Boolean).join(' · ')
  return joined || null
}

function fmtCurrency(v: number | null): string | null {
  if (v == null) return null
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
