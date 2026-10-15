import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  Pager,
  StatusBadge,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { DocumentTabs } from '@/components/knowledge/DocumentTabs'
import { GOVERNING_TYPE_LABELS, INDEX_LABELS, INDEX_TONES } from '@/lib/status/knowledge'
import { GoverningDocsUploader } from './GoverningDocsUploader'

export const metadata = { title: 'Governing documents' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

interface AssociationRow {
  id: string
  name: string
}

interface GoverningDocRow {
  id: string
  title: string
  type: string
  effective_date: string | null
  parsed_at: string | null
  /** null when the section count couldn't be read. */
  chunk_count: number | null
}

const DAY_UTC = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const columns: DataTableColumn<GoverningDocRow>[] = [
  {
    key: 'title',
    header: 'Document',
    mobilePrimary: true,
    cell: (d) => (
      <div className="min-w-0">
        <p className="font-medium text-foreground">{d.title}</p>
        <p className="text-xs text-muted">{GOVERNING_TYPE_LABELS[d.type] ?? d.type}</p>
      </div>
    ),
  },
  {
    key: 'effective',
    header: 'Effective',
    cell: (d) => (
      <span className="num">
        {d.effective_date ? DAY_UTC.format(new Date(`${d.effective_date.slice(0, 10)}T00:00:00Z`)) : '—'}
      </span>
    ),
  },
  {
    key: 'sections',
    header: 'Sections',
    numeric: true,
    cell: (d) => (d.chunk_count == null ? '—' : d.chunk_count.toLocaleString()),
  },
  {
    key: 'status',
    header: 'Ask the Docs',
    cell: (d) => {
      const s = d.chunk_count && d.chunk_count > 0 ? 'indexed' : 'not_indexed'
      return <StatusBadge status={s} tones={INDEX_TONES} labels={INDEX_LABELS} />
    },
  },
]

export default async function GoverningDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const { page: pageParam } = await searchParams
  const page = parsePageParam(pageParam)
  const { from, to } = pageRange(page, PAGE_SIZE)

  const supabase = await getSupabaseServerClient()

  const [assocResult, docsResult] = await Promise.all([
    loadOrFail(
      'associations',
      supabase
        .from('associations' as never)
        .select('id, name')
        .eq('organization_id' as never, org.id)
        .order('created_at' as never, { ascending: true }),
    ),
    loadOrFail(
      'governing documents',
      supabase
        .from('governing_documents' as never)
        .select('id, title, type, effective_date, parsed_at', { count: 'exact' })
        .eq('organization_id' as never, org.id)
        .is('superseded_at' as never, null)
        .order('created_at' as never, { ascending: false })
        .range(from, to),
    ),
  ])

  const associations = assocResult.ok ? ((assocResult.data ?? []) as AssociationRow[]) : []

  // Section counts per document. One round-trip each is fine at this size;
  // a failed count shows "—", never a confident 0.
  const docList = docsResult.ok
    ? ((docsResult.data ?? []) as Omit<GoverningDocRow, 'chunk_count'>[])
    : []
  const enriched: GoverningDocRow[] = await Promise.all(
    docList.map(async (d) => {
      const { count, error } = (await supabase
        .from('governing_document_chunks' as never)
        .select('id', { count: 'exact', head: true } as never)
        .eq('document_id' as never, d.id)) as unknown as { count: number | null; error: unknown }
      return { ...d, chunk_count: error ? null : (count ?? 0) }
    }),
  )
  const total = docsResult.ok ? (docsResult.count ?? enriched.length) : 0

  return (
    <Page
      title="Documents"
      description="Your Declaration, Bylaws, Rules, amendments and policies. Their text is split into sections that Ask the Docs cites."
      tabs={<DocumentTabs current="/documents/governing" />}
      actions={
        <Button asChild variant="secondary">
          <Link href="/ai/ask">Ask the Docs</Link>
        </Button>
      }
      linkAs={Link}
    >
      {!assocResult.ok ? (
        <LoadFailed what="your association" hint="Uploading needs it; the list below may still load." />
      ) : associations.length === 0 ? (
        <Alert variant="warning" title="No association on file yet">
          Add your association in{' '}
          <Link href="/settings" className="font-medium underline">
            Settings
          </Link>{' '}
          before uploading governing documents.
        </Alert>
      ) : (
        <GoverningDocsUploader associations={associations} />
      )}

      <section className="space-y-3" aria-labelledby="loaded-docs">
        <h2 id="loaded-docs" className="text-lg font-semibold text-foreground">
          Loaded documents
        </h2>
        {!docsResult.ok ? (
          <LoadFailed what="governing documents" retryHref="/documents/governing" />
        ) : (
          <DataTable
            columns={columns}
            rows={enriched}
            rowKey={(d) => d.id}
            mobile="cards"
            linkAs={Link}
            caption="Governing documents"
            empty={
              <EmptyState
                variant="compact"
                icon={<BookOpen aria-hidden />}
                title="No governing documents yet"
                description="Upload your Declaration and Bylaws above to start answering questions from them."
              />
            }
            footer={
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                rowCount={enriched.length}
                hrefFor={(p) => (p === 1 ? '/documents/governing' : `/documents/governing?page=${p}`)}
                linkAs={Link}
              />
            }
          />
        )}
      </section>
    </Page>
  )
}
