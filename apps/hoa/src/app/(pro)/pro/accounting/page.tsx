import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadFailed, Page, StatusPill } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { requireRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/orgs'
import { writeProAudit } from '@/lib/professionals/audit'
import { loadCpaOverview } from '@/lib/professionals/load'
import { PRO_AUDIT } from '@/lib/professionals/model'
import { usd } from '@/lib/money/format'
import { EntryForm, ReviewForm } from '@/components/pro/CpaForms'

export const metadata = { title: 'Accounting & Reports' }
export const dynamic = 'force-dynamic'

export default async function CpaAccountingPage() {
  const { org } = await requireRole(['cpa'] as const)
  const supabase = await getSupabaseServerClient()
  const result = await loadCpaOverview(supabase, org.id)
  const user = await getSignedInUser()
  // The view is audited: ids only.
  await writeProAudit(createAdminClient(), {
    orgId: org.id,
    userId: user?.id ?? null,
    action: PRO_AUDIT.accountingViewed,
    entityType: 'org',
    entityId: org.id,
  })

  if (!result.ok) {
    return (
      <Page title="Accounting & Reports">
        <LoadFailed what="the accounting records" retryHref="/pro/accounting" />
      </Page>
    )
  }
  const { periods, receivables, entries, accounts, funds } = result.data
  const open = periods.find((p) => p.status === 'open')

  return (
    <Page title="Accounting & Reports" description="Read-only. Notes and proposed entries go to the board’s Approvals; nothing posts until they approve.">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Fiscal periods</CardTitle>
          <CardDescription>Mark a period as reviewed with a note for the board.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {periods.length === 0 ? <p className="text-sm text-foreground-secondary">No fiscal periods yet.</p> : null}
          {periods.map((p) => (
            <div key={p.id} className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {p.start} to {p.end}
                </p>
                <StatusPill tone={p.status === 'open' ? 'info' : 'neutral'} size="sm" label={p.status} />
                {p.reviewed ? <StatusPill tone="success" size="sm" label="Reviewed by CPA" /> : null}
              </div>
              {!p.reviewed ? <ReviewForm fiscalPeriodId={p.id} /> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle as="h2">Receivables</CardTitle>
          <CardDescription>Open charges by home, with the owner’s name. No contact details.</CardDescription>
        </CardHeader>
        <CardContent>
          {receivables.length === 0 ? (
            <p className="text-sm text-foreground-secondary">Nothing is open.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {receivables.slice(0, 100).map((r) => (
                <li key={r.unitId} className="flex justify-between py-2">
                  <span>{r.owner ?? 'Owner not on file'}</span>
                  <span className="num">{usd(r.openCents / 100)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle as="h2">Recent journal entries</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex justify-between gap-4 py-2">
                <span className="min-w-0 truncate">
                  {e.number} · {e.date} · {e.memo}
                </span>
                <span className="text-foreground-secondary">{e.status}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {open ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle as="h2">Propose an adjusting entry</CardTitle>
            <CardDescription>It lands in the board’s Approvals and posts only when they approve. A large amount needs two board members.</CardDescription>
          </CardHeader>
          <CardContent>
            <EntryForm associationId={open.associationId} fiscalPeriodId={open.id} accounts={accounts} funds={funds} />
          </CardContent>
        </Card>
      ) : null}
    </Page>
  )
}
