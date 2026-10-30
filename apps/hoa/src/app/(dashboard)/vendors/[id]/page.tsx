import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileCheck2, FileText, Pencil } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
  KeyValueList,
  Page,
  StatusBadge,
  StatusPill,
} from '@homeowner-portal/ui'
import { getVendor } from '@/lib/vendors'
import { isVendorIncomplete } from '@/lib/inbox/vendor/schema'
import {
  COMPLIANCE_LABELS,
  COMPLIANCE_TONES,
  DEFICIENCY_LABELS,
  DEFICIENCY_TONES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONES,
  complianceKey,
} from '@/lib/status/vendors'
import { dateOnly, daysUntil, shortDate, tradesLabel, usd } from '@/components/vendors/format'
import { coiExpiryLabel } from '@homeowner-portal/workflows/vendor-coi'
import { loadCoiRequestDraft } from '@/lib/vendor-coi-request/actions'
import { loadVendorBids } from '@/lib/vendor-glance'
import { buildGlance } from '@/components/vendors/glance'
import { VendorGlance } from '@/components/vendors/VendorGlance'
import { ApproveVendorButton } from './ApproveVendorButton'
import { ConflictDisclosurePanel } from '@/components/conflict-disclosure/ConflictDisclosurePanel'
import { RequestCertificateButton } from './RequestCertificateButton'
import { VendorActions } from './VendorActions'

const DOC_TYPE_LABEL: Record<string, string> = {
  coi: 'Certificate of insurance',
  w9: 'W-9',
  license: 'Contractor license',
  contract: 'Contract',
  other: 'Other',
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
  const canApprove = status === 'green' && vendor.status === 'prospect'
  const coiDays = daysUntil(compliance?.coi_expiration_date)
  // BL-083: expiring (≤30 days) / expired, on the association's own day.
  // Board/admin only — anyone else gets no draft and no button.
  const coiDraft = await loadCoiRequestDraft(vendor.id)
  const draft = coiDraft.ok ? coiDraft.data : null
  const coiAlert = draft && (draft.state === 'expired' || draft.state === 'expiring') && draft.expiresOn ? draft : null
  const coiAlertLabel = coiAlert?.daysLeft != null ? coiExpiryLabel(coiAlert.daysLeft) : null
  const bids = await loadVendorBids(vendor.id)
  const glance = buildGlance({
    legalName: vendor.legal_name,
    createdAt: vendor.created_at,
    coi: compliance
      ? { status: compliance.coi_status, coi_expiration_date: compliance.coi_expiration_date }
      : null,
    lastReviewedAt: compliance?.last_reviewed_at ?? null,
    documentDates: vendor.documents.map((d) => d.uploaded_at),
    bids: bids ?? [],
  })
  const missing = [
    !vendor.ein ? 'EIN' : null,
    !vendor.trades || vendor.trades.length === 0 ? 'trade' : null,
  ].filter(Boolean)

  return (
    <Page
      breadcrumbs={[{ label: 'Vendors', href: '/vendors' }, { label: vendor.legal_name }]}
      linkAs={Link}
      title={vendor.legal_name}
      meta={
        <>
          <StatusBadge status={vendor.status} tones={VENDOR_STATUS_TONES} labels={VENDOR_STATUS_LABELS} />
          <StatusBadge status={complianceKey(status)} tones={COMPLIANCE_TONES} labels={COMPLIANCE_LABELS} />
          {coiAlert ? (
            <StatusPill
              tone={coiAlert.state === 'expired' ? 'danger' : 'warning'}
              label={coiAlert.state === 'expired' ? 'Insurance expired' : 'Insurance expiring'}
            />
          ) : null}
        </>
      }
      description={
        [vendor.dba ? `d/b/a ${vendor.dba}` : null, tradesLabel(vendor.trades) ?? 'No trade on file']
          .filter(Boolean)
          .join(' · ')
      }
      actions={
        <>
          <VendorActions vendorId={vendor.id} vendorName={vendor.legal_name} />
          <Button
            asChild
            variant={canApprove ? 'secondary' : 'default'}
            icon={<FileCheck2 aria-hidden />}
          >
            <Link href={`/vendors/${vendor.id}/compliance`}>
              {compliance ? 'Re-run compliance' : 'Run compliance check'}
            </Link>
          </Button>
          {canApprove ? <ApproveVendorButton vendorId={vendor.id} vendorName={vendor.legal_name} /> : null}
        </>
      }
    >
      <VendorGlance glance={glance} bidsAvailable={bids !== null} />
      {canApprove ? <ConflictDisclosurePanel decisionKind="contract_approval" decisionId={vendor.id} /> : null}
      {/* A vendor fast-created from an email has no EIN and often no trade,
          because a signature block never states them. Say so here rather
          than letting it look fully onboarded — it cannot legitimately be
          used for 1099 reporting, RFP invitations, or compliance until
          both are set. Completeness is derived, never stored, so this
          clears itself the moment the fields are filled in. */}
      {coiAlert && coiAlertLabel ? (
        <Alert
          variant={coiAlert.state === 'expired' ? 'error' : 'warning'}
          title={`Certificate of insurance: ${coiAlertLabel.toLowerCase()}`}
          actions={
            <RequestCertificateButton
              vendorId={vendor.id}
              to={coiAlert.to}
              initialSubject={coiAlert.subject}
              initialBody={coiAlert.body}
              size="sm"
            />
          }
        >
          Nothing is sent to the vendor automatically. Request an updated certificate to review the email and send it
          yourself, then enter the new certificate under Run compliance check.
        </Alert>
      ) : null}

      {isVendorIncomplete({ ein: vendor.ein, trades: vendor.trades ?? null }) ? (
        <Alert
          variant="warning"
          title="Finish setting up this vendor"
          actions={
            <Button asChild size="sm" variant="secondary" icon={<Pencil aria-hidden />}>
              <Link href={`/vendors/${vendor.id}/edit`}>Edit details</Link>
            </Button>
          }
        >
          Still missing: {missing.join(' and ')}. This vendor can’t be used for 1099 reporting, RFP
          invitations or compliance checks until both are set.
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue
                label="Email"
                value={
                  vendor.primary_email ? (
                    <a href={`mailto:${vendor.primary_email}`} className="break-all text-primary hover:underline">
                      {vendor.primary_email}
                    </a>
                  ) : null
                }
              />
              <KeyValue label="Phone" value={vendor.primary_phone} />
              <KeyValue label="EIN" value={maskEin(vendor.ein)} />
              <KeyValue label="Added" value={shortDate(vendor.created_at)} />
              <KeyValue label="Address" value={formatAddress(vendor.address)} className="sm:col-span-2" />
              <KeyValue
                label="Service area"
                className="sm:col-span-2"
                value={
                  vendor.service_area_zips && vendor.service_area_zips.length > 0
                    ? vendor.service_area_zips.join(', ')
                    : null
                }
              />
            </KeyValueList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            actions={
              <span className="flex flex-wrap items-center gap-2">
                {compliance?.last_reviewed_at ? (
                  <span className="text-xs text-muted">Reviewed {shortDate(compliance.last_reviewed_at)}</span>
                ) : null}
                {draft && !coiAlert ? (
                  <RequestCertificateButton
                    vendorId={vendor.id}
                    to={draft.to}
                    initialSubject={draft.subject}
                    initialBody={draft.body}
                    size="sm"
                  />
                ) : null}
              </span>
            }
          >
            <CardTitle as="h2">Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            {compliance ? (
              <KeyValueList>
                <KeyValue label="COI carrier" value={compliance.coi_carrier} />
                <KeyValue label="Policy #" value={compliance.coi_policy_number} />
                <KeyValue
                  label="COI expires"
                  value={
                    compliance.coi_expiration_date ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="num">{dateOnly(compliance.coi_expiration_date)}</span>
                        {coiDays != null && coiDays < 0 ? (
                          <StatusPill tone="danger" label="Expired" size="sm" />
                        ) : coiDays != null && coiDays <= 30 ? (
                          <StatusPill tone="warning" label={`${coiDays}d left`} size="sm" />
                        ) : null}
                      </span>
                    ) : null
                  }
                />
                <KeyValue label="W-9 on file" value={compliance.w9_on_file ? 'Yes' : 'No'} />
                <KeyValue
                  label="GL per occurrence"
                  value={<span className="num">{usd(compliance.coi_general_liability_per_occurrence)}</span>}
                />
                <KeyValue
                  label="GL aggregate"
                  value={<span className="num">{usd(compliance.coi_general_liability_aggregate)}</span>}
                />
                <KeyValue label="Workers’ comp" value={yesNo(compliance.coi_workers_comp)} />
                <KeyValue label="Additional insured" value={yesNo(compliance.coi_additional_insured_present)} />
                <KeyValue label="License #" value={compliance.license_number} />
                <KeyValue label="License expires" value={dateOnly(compliance.license_expiration)} />
              </KeyValueList>
            ) : (
              <EmptyState
                variant="plain"
                icon={<FileCheck2 aria-hidden />}
                title="Not reviewed yet"
                description="Enter what’s on their COI, W-9 and license to grade them against your standards."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/vendors/${vendor.id}/compliance`}>Run compliance check</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {compliance?.deficiencies && compliance.deficiencies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Deficiencies</CardTitle>
            <p className="text-sm text-muted">
              {compliance.deficiencies.length} found by the last compliance check.
            </p>
          </CardHeader>
          <ul className="divide-y divide-border border-t border-border">
            {compliance.deficiencies.map((d, i) => (
              <li key={`${d.code}-${i}`} className="flex items-start gap-3 px-5 py-3">
                <StatusBadge status={d.severity} tones={DEFICIENCY_TONES} labels={DEFICIENCY_LABELS} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-foreground">{d.detail}</p>
                  <p className="text-xs text-muted">{humanizeCode(d.code)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/vendors/${vendor.id}/compliance`}>Manage</Link>
            </Button>
          }
        >
          <CardTitle as="h2">Documents</CardTitle>
        </CardHeader>
        {vendor.documents.length > 0 ? (
          <ul className="divide-y divide-border border-t border-border">
            {vendor.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</p>
                  <p className="truncate text-xs text-muted">{d.storage_path.split('/').slice(-1)[0]}</p>
                </div>
                <span className="num shrink-0 text-xs text-muted">{shortDate(d.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <CardContent>
            <p className="text-sm text-muted">No COI, W-9 or license uploaded yet.</p>
          </CardContent>
        )}
      </Card>

      {vendor.notes ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">{vendor.notes}</p>
          </CardContent>
        </Card>
      ) : null}

    </Page>
  )
}

function yesNo(v: boolean | null): string | null {
  return v == null ? null : v ? 'Yes' : 'No'
}

function humanizeCode(code: string): string {
  const s = code.replace(/[_-]+/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
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
