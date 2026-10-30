'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, ShieldCheck, Trash2 } from 'lucide-react'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, EmptyState, StatusPill, useToast } from '@homeowner-portal/ui'
import { deleteInsurancePolicy } from '@/lib/insurance/actions'
import {
  POLICY_KIND_LABELS,
  daysFrom,
  formatCents,
  reminderLabel,
  type InsurancePolicy,
  type PolicyReminder,
} from '@/lib/insurance/model'
import { STATUS_EMPTY, type InsuranceStatus } from '@/lib/insurance/status-filter'
import { PolicyDialog, type Option } from './PolicyDialog'

function expiryTone(r: PolicyReminder | undefined): 'danger' | 'warning' | 'info' | null {
  if (!r) return null
  return r.tone === 'expired' || r.tone === '30' ? 'danger' : r.tone === '60' ? 'warning' : 'info'
}

export function PolicyList({
  policies,
  reminders,
  today,
  associations,
  documents,
  documentsFailed,
  status = null,
  missingMessages = [],
}: {
  policies: InsurancePolicy[]
  reminders: PolicyReminder[]
  today: string
  associations: Option[]
  documents: Option[]
  documentsFailed: boolean
  status?: InsuranceStatus | null
  missingMessages?: string[]
}) {
  const router = useRouter()
  const toast = useToast()
  const byId = new Map(reminders.map((r) => [r.policyId, r]))
  const docName = new Map(documents.map((d) => [d.id, d.name]))
  const assocName = new Map(associations.map((a) => [a.id, a.name]))

  return (
    <Card>
      <CardHeader actions={<PolicyDialog policy={null} associations={associations} documents={documents} />}>
        <CardTitle as="h2">Policies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {documentsFailed ? (
          <Alert variant="warning" title="Documents didn’t load">
            You can still add or edit policies; the document picker is empty until you reload.
          </Alert>
        ) : null}
        {status === 'missing' && missingMessages.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {missingMessages.map((m) => (
              <li key={m} className="rounded-md border border-border p-3">
                {m}
              </li>
            ))}
          </ul>
        ) : policies.length === 0 && status ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden />}
            title={STATUS_EMPTY[status].title}
            description={STATUS_EMPTY[status].description}
            action={
              <Button asChild variant="secondary">
                <Link href="/insurance">Show all policies</Link>
              </Button>
            }
          />
        ) : policies.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden />}
            title="No policies yet"
            description="Add the master or property policy, general liability, D&O and the fidelity bond from their declarations pages."
            action={<PolicyDialog policy={null} associations={associations} documents={documents} />}
          />
        ) : (
          <ul className="divide-y divide-border">
            {policies.map((p) => {
              const r = byId.get(p.id)
              const tone = expiryTone(r)
              const left = daysFrom(today, p.expiresOn)
              return (
                <li key={p.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                      <p className="font-medium text-foreground">
                        {POLICY_KIND_LABELS[p.kind]}
                        <span className="font-normal text-muted"> · {p.carrier}</span>
                        {associations.length > 1 && p.associationId ? (
                          <span className="font-normal text-muted"> · {assocName.get(p.associationId) ?? 'Association'}</span>
                        ) : null}
                      </p>
                      {p.policyNumber ? <p className="text-xs text-muted">Policy {p.policyNumber}</p> : null}
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                      {tone && r ? (
                        <StatusPill tone={tone} label={reminderLabel(r)} />
                      ) : left !== null && left < 0 ? (
                        <StatusPill tone="neutral" label="Renewed" />
                      ) : null}
                      <PolicyDialog policy={p} associations={associations} documents={documents} />
                      <ConfirmDialog
                        title="Delete this policy?"
                        description="It is removed from the list and from the reminders. The policy document stays in Documents."
                        confirmLabel="Delete"
                        destructive
                        trigger={
                          <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden />} aria-label="Delete policy">
                            Delete
                          </Button>
                        }
                        onConfirm={async () => {
                          const res = await deleteInsurancePolicy(p.id)
                          if (!res.ok) {
                            toast({ tone: 'error', message: res.error })
                            throw new Error('delete failed')
                          }
                          toast({ tone: 'success', message: 'Policy deleted.' })
                          router.refresh()
                        }}
                      />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted">Limit</dt>
                      <dd className="num">{formatCents(p.coverageLimitCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Deductible</dt>
                      <dd className="num">{formatCents(p.deductibleCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Premium</dt>
                      <dd className="num">{formatCents(p.premiumCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Term</dt>
                      <dd>
                        {p.effectiveOn ? `${p.effectiveOn} to ` : 'Until '}
                        {p.expiresOn}
                      </dd>
                    </div>
                  </dl>
                  {p.documentId ? (
                    <Link href={`/documents/${p.documentId}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                      <FileText className="size-3.5" aria-hidden />
                      {docName.get(p.documentId) ?? 'Policy document'}
                    </Link>
                  ) : null}
                  {p.notes ? <p className="whitespace-pre-wrap text-sm text-foreground-secondary [overflow-wrap:anywhere]">{p.notes}</p> : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
