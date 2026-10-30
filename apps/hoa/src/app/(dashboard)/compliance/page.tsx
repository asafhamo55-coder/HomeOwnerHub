import Link from 'next/link'
import { ExternalLink, FileCheck2, Scale } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
  type StatusTone,
} from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { requireBoardOrAdmin } from '@/lib/auth'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { readAllResult } from '@/lib/supabase/read-all'
import { recordsChecklistFor, type LibraryDoc } from '@/lib/compliance/records-checklist'
import { NOT_LEGAL_ADVICE } from '@/lib/compliance/law'
import { stateName, type ComplianceObligation, type ObligationTone } from '@/lib/compliance/obligations'
import { loadComplianceOverview } from '@/lib/compliance/overview-load'
import { caBudgetLoader } from '@/lib/compliance/ca-budget-load'
import type { LooseDb } from '@/lib/compliance/evidence'
import { EvidenceControls, type EvidenceOption } from './EvidenceControls'
import { ProposedRulesCard } from './ProposedRulesCard'
import { RecordsChecklistCard } from './RecordsChecklistCard'

export const metadata = { title: 'Compliance' }
export const dynamic = 'force-dynamic'

const DESCRIPTION =
  'Every state-law obligation HomeownerHub tracks for your association, where each one stands, and the evidence the board kept. Georgia first.'

const PILL: Record<ObligationTone, StatusTone> = {
  overdue: 'danger',
  soon: 'warning',
  upcoming: 'info',
  done: 'success',
  standing: 'neutral',
  unknown: 'warning',
  failed: 'danger',
  not_loaded: 'neutral',
}

/** A DOM id for an obligation (keys hold ':' and uuids). */
function anchor(o: ComplianceObligation): string {
  return `ob-${o.key.replace(/[^a-z0-9-]/gi, '-')}`
}

/**
 * /compliance — BL-145. Board/admin only (requireBoardOrAdmin redirects
 * residents before any read). Lists every statutory obligation for each of
 * the org's associations (lib/compliance/obligations.ts), Georgia first,
 * with an overdue banner. Statute text is quoted only from lib/compliance/
 * law.ts (checked word for word against scripts/fixtures/state-law).
 *
 * M5_APPLIED off: read-only and no evidence — the dashboard's State law
 * deadlines card stays the place to mark a deadline done. On: "Mark as
 * done" with an evidence document, and attach or change evidence later.
 * Nothing on this page sends anything.
 */
export default async function CompliancePage() {
  const { org } = await requireBoardOrAdmin()
  const [supabase, timeZone] = await Promise.all([getSupabaseServerClient(), currentTimeZone()])
  const db = supabase as unknown as LooseDb
  const today = todayIn(timeZone)
  const loaded = await loadComplianceOverview({
    db,
    admin: createAdminClient() as unknown as LooseDb,
    orgId: org.id,
    today,
    caBudgets: caBudgetLoader(db, org.id, today, timeZone),
    withDocuments: M5_APPLIED,
  })

  if (!loaded.ok) {
    return (
      <Page title="Compliance" description={DESCRIPTION} linkAs={Link}>
        <LoadFailed what="your associations" retryHref="/compliance" />
      </Page>
    )
  }

  const { overview, documents } = loaded
  if (overview.groups.length === 0) {
    return (
      <Page title="Compliance" description={DESCRIPTION} linkAs={Link}>
        <EmptyState
          icon={<Scale aria-hidden />}
          title="Set up your association first"
          description="Obligations depend on your association’s state. Add the association and its state in Settings."
          action={
            <Button asChild variant="secondary">
              <Link href="/settings">Open Settings</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  // Library documents for the records checklist: org-scoped, only when some
  // association is in a state that has a list. null = the read failed.
  let libraryDocs: LibraryDoc[] | null = []
  if (overview.groups.some((g) => recordsChecklistFor(g.state))) {
    const res = await loadOrFail(
      'records checklist documents',
      readAllResult<LibraryDoc>((from, to) =>
        supabase
          .from('hoa_documents')
          .select('id, name, type')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to) as never,
      ),
    )
    libraryDocs = res.ok ? res.data : null
  }

  const evidenceOn = M5_APPLIED && M3_APPLIED
  const options: EvidenceOption[] = documents ?? []
  const multiple = overview.groups.length > 1

  return (
    <Page title="Compliance" description={DESCRIPTION} linkAs={Link}>
      {overview.overdue.length > 0 ? (
        <Alert variant="error" title={overview.overdue.length === 1 ? '1 obligation is overdue' : `${overview.overdue.length} obligations are overdue`}>
          <ul className="mt-1 space-y-1">
            {overview.overdue.map((o) => (
              <li key={o.key}>
                <a href={`#${anchor(o)}`} className="font-medium underline">
                  {o.title}
                </a>
                {multiple ? ` · ${o.associationName}` : ''} — {o.label}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {!evidenceOn ? (
        <Alert variant="info" title="Evidence is almost ready">
          This page is read-only until a database update. Until then, mark a deadline done from the State law deadlines card on the
          Dashboard, and keep the filing in Documents.
        </Alert>
      ) : documents === null ? (
        <Alert variant="warning" title="Couldn’t load your documents">
          You can still mark deadlines done. The evidence list is empty until you reload.
        </Alert>
      ) : null}

      {overview.groups.map((g) => (
        <Card key={g.associationId}>
          <CardHeader>
            <CardTitle as="h2">{multiple ? g.associationName : 'Obligations'}</CardTitle>
            <CardDescription>
              {g.state ? `${stateName(g.state)} law, as loaded in HomeownerHub.` : 'Your association’s state isn’t one HomeownerHub has law for yet.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {g.obligations.map((o) => (
              <ObligationRow key={o.key} o={o} evidenceOn={evidenceOn} options={options} />
            ))}
          </CardContent>
        </Card>
      ))}

      {overview.groups.map((g) => (
        <RecordsChecklistCard
          key={`records-${g.associationId}`}
          state={g.state}
          docs={libraryDocs}
          heading={multiple ? `Records your owners can see: ${g.associationName}` : undefined}
        />
      ))}

      {overview.groups.some((g) => g.state === 'GA') ? <ProposedRulesCard today={today} /> : null}

      <p className="text-xs text-muted">{NOT_LEGAL_ADVICE} Check your governing documents and ask your association’s attorney.</p>
    </Page>
  )
}

function ObligationRow({ o, evidenceOn, options }: { o: ComplianceObligation; evidenceOn: boolean; options: EvidenceOption[] }) {
  return (
    <section id={anchor(o)} aria-label={o.title} className="space-y-3 py-5 text-sm first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium text-foreground">{o.title}</h3>
        <StatusPill tone={PILL[o.tone]} label={o.label} />
      </div>

      {o.steps.length > 0 ? (
        <ol className="list-decimal space-y-1 pl-5 text-foreground-secondary">
          {o.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}

      {o.appliesTo ? <p className="text-xs text-muted">Applies to: {o.appliesTo}</p> : null}

      {o.quotes.length > 0 ? (
        <details className="rounded-md border border-border bg-subtle px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground-secondary">
            What the statute says ({o.quotes.length})
          </summary>
          <div className="mt-2 space-y-3">
            {o.quotes.map((q) => (
              <figure key={q.quote} className="space-y-1">
                <blockquote className="border-l-2 border-border pl-3 text-foreground-secondary">“{q.quote}”</blockquote>
                <figcaption className="text-xs text-muted">{q.cite}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      ) : null}

      {o.done && evidenceOn ? (
        <p className="flex flex-wrap items-center gap-1 text-foreground-secondary">
          <FileCheck2 className="size-4 text-muted" aria-hidden />
          {o.done.evidence ? (
            <>
              Evidence:{' '}
              <Link href={`/documents/${o.done.evidence.documentId}`} className="font-medium text-primary hover:underline">
                {o.done.evidence.name}
              </Link>
            </>
          ) : (
            'No evidence attached yet.'
          )}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {o.link ? (
          <Link href={o.link.href} className="font-medium text-primary hover:underline">
            {o.link.label}
          </Link>
        ) : null}
        {o.official ? (
          <a href={o.official.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            {o.official.label} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      {evidenceOn && o.deadlineCode ? (
        <EvidenceControls
          associationId={o.associationId}
          code={o.deadlineCode}
          mode={o.done ? 'attach' : 'mark'}
          documents={options}
          currentDocumentId={o.done?.evidence?.documentId ?? null}
        />
      ) : null}
    </section>
  )
}

