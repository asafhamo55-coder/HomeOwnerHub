import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill, type StatusTone } from '@homeowner-portal/ui'
import {
  RECORDS_CHECK_BYLAWS,
  recordRows,
  recordsChecklistFor,
  recordsProgress,
  type LibraryDoc,
  type RecordStatus,
} from '@/lib/compliance/records-checklist'
import { stateName } from '@/lib/compliance/obligations'
import type { ComplianceState } from '@/lib/compliance/state'

const PILL: Record<RecordStatus, { tone: StatusTone; label: string }> = {
  posted: { tone: 'success', label: 'Posted' },
  missing: { tone: 'warning', label: 'Missing' },
  untracked: { tone: 'neutral', label: 'Kept off-app' },
}

/**
 * "Records your owners can see". Statute text only from
 * lib/compliance/records-checklist.ts (checked against scripts/fixtures).
 * "Posted" means a library document of the matching category exists; the
 * app cannot see a website. `docs` is null when the library read failed.
 */
export function RecordsChecklistCard({
  state,
  docs,
  heading,
}: {
  state: ComplianceState | null
  docs: LibraryDoc[] | null
  heading?: string
}) {
  const checklist = recordsChecklistFor(state)
  if (!checklist) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">{heading ?? 'Records your owners can see'}</CardTitle>
          <CardDescription>{RECORDS_CHECK_BYLAWS}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const rows = docs ? recordRows(checklist, docs) : null
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{heading ?? 'Records your owners can see'}</CardTitle>
        <CardDescription>
          {stateName(checklist.state) ?? checklist.state}:{checklist.intro}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {rows ? (
          <p className="font-medium text-foreground" role="status">
            {recordsProgress(rows).line}
          </p>
        ) : (
          <p className="text-foreground-secondary" role="status">
            We couldn’t load your documents, so nothing is marked posted or missing. Reload to try again.
          </p>
        )}
        <ul className="divide-y divide-border">
          {checklist.categories.map((c, i) => {
            const row = rows?.[i]
            return (
              <li key={c.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 font-medium text-foreground">{c.label}</span>
                  {row ? <StatusPill tone={PILL[row.status].tone} label={PILL[row.status].label} /> : null}
                </div>
                <p className="text-xs text-muted">{c.cite}</p>
                {row?.status === 'posted' && row.document ? (
                  <Link href={`/documents/${row.document.id}`} className="font-medium text-primary hover:underline">
                    {row.document.name}
                  </Link>
                ) : null}
                {row?.status === 'missing' ? (
                  <Link href="/documents/upload" className="font-medium text-primary hover:underline">
                    Upload to Documents
                  </Link>
                ) : null}
                {row?.status === 'untracked' ? (
                  <p className="text-foreground-secondary">Not tracked in the app: keep on file.</p>
                ) : null}
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted">
          Posted means a document of that category is in your library. It does not show whether it is also on your website or app.
        </p>
      </CardContent>
    </Card>
  )
}
