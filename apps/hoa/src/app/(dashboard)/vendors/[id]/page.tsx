import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileCheck2, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import {
  BackLink,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  PageHeader,
} from '@homeowner-portal/ui'
import { getVendor, type ComplianceStatus } from '@/lib/vendors'
import { isVendorIncomplete } from '@/lib/inbox/vendor/schema'
import { ApproveVendorButton } from './ApproveVendorButton'
import { VendorActions } from './VendorActions'

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
      <BackLink href="/vendors" label="All vendors" />

      {/* A vendor fast-created from an email has no EIN and often no trade,
          because a signature block never states them. Say so here rather
          than letting it look fully onboarded — it cannot legitimately be
          used for 1099 reporting, RFP invitations, or compliance until
          both are set. Completeness is derived, never stored, so this
          clears itself the moment the fields are filled in. */}
      {isVendorIncomplete({ ein: vendor.ein, trades: vendor.trades ?? null }) ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-semibold">Finish setting up this vendor</p>
          <p className="mt-1 text-xs">
            Still missing:{' '}
            {[
              !vendor.ein ? 'EIN' : null,
              !vendor.trades || vendor.trades.length === 0 ? 'trade' : null,
            ]
              .filter(Boolean)
              .join(' and ')}
            . This vendor cannot be used for 1099 reporting, RFP invitations,
            or compliance checks until both are set.
          </p>
        </div>
      ) : null}

      <PageHeader
        title={vendor.legal_name}
        description={
          <>
            {vendor.dba ? <>d/b/a {vendor.dba} · </> : null}
            {(vendor.trades ?? []).join(', ') || 'No trades on file'}
          </>
        }
        actions={
          <>
            <VendorActions vendorId={vendor.id} vendorName={vendor.legal_name} />
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
              <ApproveVendorButton vendorId={vendor.id} vendorName={vendor.legal_name} />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Email" value={vendor.primary_email} />
              <KeyValue label="Phone" value={vendor.primary_phone} />
              <KeyValue label="EIN" value={maskEin(vendor.ein)} />
              <KeyValue label="Address" value={formatAddress(vendor.address)} />
              <KeyValue
                label="Service area"
                value={
                  vendor.service_area_zips && vendor.service_area_zips.length > 0
                    ? vendor.service_area_zips.join(', ')
                    : null
                }
              />
              <KeyValue
                label="Added"
                value={format(new Date(vendor.created_at), 'PP')}
              />
            </KeyValueList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Compliance</CardTitle>
              {compliance?.last_reviewed_at ? (
                <span className="text-xs text-muted">
                  Reviewed {format(new Date(compliance.last_reviewed_at), 'PP')}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {compliance ? (
              <KeyValueList>
                <KeyValue label="COI carrier" value={compliance.coi_carrier} />
                <KeyValue label="Policy #" value={compliance.coi_policy_number} />
                <KeyValue
                  label="GL / occurrence"
                  value={fmtCurrency(compliance.coi_general_liability_per_occurrence)}
                />
                <KeyValue
                  label="GL aggregate"
                  value={fmtCurrency(compliance.coi_general_liability_aggregate)}
                />
                <KeyValue
                  label="COI expires"
                  value={
                    compliance.coi_expiration_date
                      ? format(new Date(compliance.coi_expiration_date), 'PP')
                      : null
                  }
                />
                <KeyValue
                  label="Workers' comp"
                  value={
                    compliance.coi_workers_comp == null
                      ? null
                      : compliance.coi_workers_comp
                        ? 'Yes'
                        : 'No'
                  }
                />
                <KeyValue
                  label="Additional insured"
                  value={
                    compliance.coi_additional_insured_present == null
                      ? null
                      : compliance.coi_additional_insured_present
                        ? 'Yes'
                        : 'No'
                  }
                />
                <KeyValue label="W-9 on file" value={compliance.w9_on_file ? 'Yes' : 'No'} />
                <KeyValue label="License #" value={compliance.license_number} />
                <KeyValue
                  label="License expires"
                  value={
                    compliance.license_expiration
                      ? format(new Date(compliance.license_expiration), 'PP')
                      : null
                  }
                />
              </KeyValueList>
            ) : (
              <p className="text-sm text-muted">
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
                className="flex items-start gap-3 rounded-md border border-border bg-foreground/10 p-3"
              >
                <Badge
                  variant={d.severity === 'red' ? 'destructive' : 'warning'}
                  size="sm"
                >
                  {d.severity}
                </Badge>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-mono text-xs text-muted">{d.code}</p>
                  <p className="text-foreground">{d.detail}</p>
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
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-foreground/10 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <Badge variant="outline" size="sm">
                      {d.doc_type}
                    </Badge>
                    <span className="ml-2 text-xs text-muted">
                      {d.storage_path.split('/').slice(-1)[0]}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {format(new Date(d.uploaded_at), 'PP')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
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
            <p className="whitespace-pre-wrap text-sm text-foreground">{vendor.notes}</p>
          </CardContent>
        </Card>
      ) : null}
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
