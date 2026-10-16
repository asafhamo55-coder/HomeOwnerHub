import Link from 'next/link'
import { FileText, Upload } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  LoadFailed,
  NoOrgSelected,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import {
  DOCUMENT_PARSE_LABELS,
  DOCUMENT_PARSE_TONES,
  DOCUMENT_TYPE_LABELS,
  documentParseStatus,
} from '@/lib/status/knowledge'
import { DocumentTabs, formatBytes } from '@/components/knowledge/DocumentTabs'

export const metadata = { title: 'Documents' }
export const dynamic = 'force-dynamic'

interface DocRow {
  id: string
  name: string
  type: string
  file_size: number | null
  parsed_at: string | null
  created_at: string | null
}

const columns: DataTableColumn<DocRow>[] = [
  {
    key: 'name',
    header: 'Document',
    mobilePrimary: true,
    cell: (d) => (
      <Link
        href={`/documents/${d.id}`}
        className="group inline-flex min-w-0 items-center gap-2.5 font-medium text-foreground hover:text-primary"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted" aria-hidden>
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 truncate group-hover:underline">{d.name}</span>
      </Link>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    cell: (d) => <Badge variant="neutral">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</Badge>,
  },
  {
    key: 'size',
    header: 'Size',
    numeric: true,
    hideBelowLg: true,
    cell: (d) => formatBytes(d.file_size),
  },
  {
    key: 'uploaded',
    header: 'Uploaded',
    hideOnMobile: true,
    cell: (d) => (
      <span className="num whitespace-nowrap text-muted">{d.created_at ? format(new Date(d.created_at), 'PP') : '—'}</span>
    ),
  },
  {
    key: 'text',
    header: 'Searchable text',
    cell: (d) => (
      <StatusBadge
        status={documentParseStatus(d.parsed_at)}
        tones={DOCUMENT_PARSE_TONES}
        labels={DOCUMENT_PARSE_LABELS}
      />
    ),
  },
]

export default async function DocumentsPage() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const supabase = await getSupabaseServerClient()
  const result = await loadOrFail(
    'documents',
    supabase
      .from('hoa_documents')
      .select('id, name, type, file_size, parsed_at, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false }),
  )

  const docs = result.ok ? ((result.data ?? []) as DocRow[]) : []
  const needsText = docs.filter((d) => !d.parsed_at).length

  return (
    <Page
      linkAs={Link}
      title="Documents"
      description="CC&Rs, bylaws, rules and minutes. A document’s text powers covenant matching in the violation wizard."
      meta={
        result.ok && docs.length > 0 ? (
          <Badge variant="neutral" className="num">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'}
          </Badge>
        ) : null
      }
      tabs={<DocumentTabs current="/documents" />}
      actions={
        <Button asChild>
          <Link href="/documents/upload">
            <Upload aria-hidden />
            Upload document
          </Link>
        </Button>
      }
    >
      {/* Never the raw error.message, which this used to print. */}
      {!result.ok ? (
        <LoadFailed what="documents" retryHref="/documents" />
      ) : (
        <>
          {needsText > 0 ? (
            <p className="text-sm text-muted">
              {needsText} {needsText === 1 ? 'document has' : 'documents have'} no searchable text yet — open{' '}
              {needsText === 1 ? 'it' : 'one'} and paste its text so violations can cite it.
            </p>
          ) : null}
          <DataTable
            caption="Documents"
            columns={columns}
            rows={docs}
            rowKey={(d) => d.id}
            mobile="cards"
            linkAs={Link}
            empty={
              <EmptyState
                variant="compact"
                icon={<FileText aria-hidden />}
                title="No documents yet"
                description="Upload your CC&Rs first — they’re the foundation of every violation letter."
                action={
                  <Button asChild size="sm">
                    <Link href="/documents/governing">Upload governing documents</Link>
                  </Button>
                }
                secondaryAction={
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/documents/upload">Upload another file</Link>
                  </Button>
                }
              />
            }
          />
        </>
      )}
    </Page>
  )
}
