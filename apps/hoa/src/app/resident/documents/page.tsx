import Link from 'next/link'
import { ArrowUpRight, FileText, Search } from 'lucide-react'
import { Alert, Button, LoadFailed, NoOrgSelected, SearchForm } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay } from '@/lib/money/format'
import { fetchResidentDocuments } from '@/lib/resident-documents/query'
import {
  groupResidentDocuments,
  searchResidentDocuments,
  type ResidentDocument,
} from '@/lib/resident-documents/group'
import { residentDocumentHref } from '@/lib/resident-documents/visibility'
import { loadResidentRightsScope } from '@/lib/owner-rights/load'
import { IconTile, Panel, RowGroup, ScreenEmpty, ScreenHeader, Section } from '@/components/resident/screen'

export const metadata = { title: 'Documents' }
export const dynamic = 'force-dynamic'

const ASK_FOR_DOCUMENT = `/resident/tickets/new?${new URLSearchParams({
  subject: 'Request for an association document',
}).toString()}`

/**
 * The association's governing documents, for owners (BL-049; Fla. Stat.
 * § 720.303(4) wants official records in an owners-only area). Which
 * documents appear is decided by lib/resident-documents/visibility.ts —
 * an explicit type allowlist, default-deny. Read with the signed-in user's
 * own client so RLS applies; files open through the [source]/[id] route,
 * which re-checks and redirects to a one-minute signed URL.
 */
export default async function ResidentDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; open?: string }>
}) {
  const { q: rawQ, open } = await searchParams
  const q = rawQ?.trim() ?? ''
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected href="/resident" />

  const supabase = await getSupabaseServerClient()
  // BL-164: a Georgia association's owners also get the rights page link.
  // A failed state read only hides the link.
  const [res, rights] = await Promise.all([
    tryLoad('association documents', () => fetchResidentDocuments(supabase, org.id)),
    loadResidentRightsScope(org.id).catch(() => ({ ok: false }) as const),
  ])
  const rightsLink =
    rights.ok && rights.georgia ? (
      <Button asChild variant="ghost" size="sm">
        <Link href="/resident/rights">Your rights as an owner</Link>
      </Button>
    ) : null

  const header = (
    <ScreenHeader title="Documents" subtitle="Your association’s governing documents, always the current version." />
  )

  const openNotice =
    open === 'unavailable' ? (
      <Alert variant="warning" title="That document isn’t available">
        It may have been replaced or removed. Pick it from the list below, or ask the board for a copy.
      </Alert>
    ) : open === 'failed' ? (
      <Alert variant="error" title="Couldn’t open that document">
        Something went wrong fetching the file. Try again in a moment.
      </Alert>
    ) : null

  if (!res.ok) {
    return (
      <div className="space-y-6">
        {header}
        {openNotice}
        <LoadFailed what="your association’s documents" retryHref="/resident/documents" />
      </div>
    )
  }

  const all = res.data
  const groups = groupResidentDocuments(searchResidentDocuments(all, q))

  return (
    <div className="space-y-6">
      {header}
      {openNotice}

      {all.length === 0 ? (
        <ScreenEmpty
          icon={<FileText />}
          title="No documents posted yet"
          description="Your board hasn’t shared the association’s documents here yet. Ask them for the one you need."
          action={
            <Button asChild>
              <Link href={ASK_FOR_DOCUMENT}>Ask the board</Link>
            </Button>
          }
        />
      ) : (
        <>
          <SearchForm
            action="/resident/documents"
            defaultValue={q || undefined}
            label="Search documents"
            placeholder="Search documents"
            linkAs={Link}
            className="sm:w-full"
          />

          {groups.length === 0 ? (
            <ScreenEmpty
              icon={<Search />}
              tone="slate"
              title="No documents match your search"
              description="Try a different word, or clear the search to see everything."
              action={
                <Button asChild variant="secondary">
                  <Link href="/resident/documents">Clear search</Link>
                </Button>
              }
            />
          ) : (
            groups.map((g) => (
              <Section
                key={g.id}
                label={g.label}
                aside={<span className="num text-xs text-muted">{g.docs.length}</span>}
              >
                <RowGroup>
                  {g.docs.map((d) => (
                    <DocumentRow key={`${d.source}:${d.id}`} doc={d} />
                  ))}
                </RowGroup>
              </Section>
            ))
          )}
        </>
      )}

      <Panel className="space-y-3">
        <p className="text-sm text-foreground-secondary">
          Looking for minutes, the budget or another record? Ask the board — or ask a question about your rules and
          get an answer that cites the section.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={ASK_FOR_DOCUMENT}>Ask the board</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/resident/ask">Ask the Docs</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/resident/insurance">Association insurance</Link>
          </Button>
          {rightsLink}
        </div>
      </Panel>
    </div>
  )
}

function dateLine(d: ResidentDocument): string | null {
  if (d.effectiveDate) return `Effective ${formatDay(d.effectiveDate)}`
  if (d.updatedAt) return `Updated ${formatDay(d.updatedAt)}`
  if (d.addedAt) return `Added ${formatDay(d.addedAt)}`
  return null
}

function DocumentRow({ doc }: { doc: ResidentDocument }) {
  const when = dateLine(doc)
  const body = (
    <>
      <IconTile icon={<FileText />} tone={doc.hasFile ? 'primary' : 'slate'} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{doc.title}</span>
        <span className="mt-0.5 block text-xs text-muted">
          {when ? <span className="num">{when}</span> : null}
          {!doc.hasFile ? <>{when ? ' · ' : null}No file posted yet — ask the board</> : null}
        </span>
      </span>
    </>
  )
  const base = 'flex min-h-16 items-center gap-3 bg-surface px-4 py-3'
  if (!doc.hasFile) return <div className={base}>{body}</div>
  // A plain <a>, not next/link: the target is a route handler that
  // redirects to a signed storage URL, which client-side routing can't follow.
  return (
    <a
      href={residentDocumentHref(doc)}
      className={`${base} no-underline transition-colors duration-fast hover:bg-subtle active:bg-subtle focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      {body}
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
        Open
        <ArrowUpRight className="size-4" aria-hidden />
      </span>
    </a>
  )
}
