import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { format } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadFailed,
  Page,
  StatusBadge,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listDocumentVersions, signedDownloadUrl } from '@/lib/documents'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import {
  DOCUMENT_PARSE_LABELS,
  DOCUMENT_PARSE_TONES,
  DOCUMENT_TYPE_LABELS,
  documentParseStatus,
} from '@/lib/status/knowledge'
import { ParsedTextEditor } from './ParsedTextEditor'
import { DocumentActions } from './DocumentActions'

interface DocDetailRow {
  id: string
  name: string
  type: string
  storage_path: string
  file_size: number | null
  parsed_text: string | null
  parsed_at: string | null
  created_at: string | null
}

interface ParsedSection {
  number: string
  title: string
  summary: string
}

export const metadata = { title: 'Document' }

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const docResult = await loadOrFail(
    'document',
    supabase
      .from('hoa_documents')
      .select('id, name, type, storage_path, file_size, parsed_text, parsed_at, created_at')
      .eq('id', id)
      .maybeSingle(),
  )

  const crumbsBase = [{ label: 'Documents', href: '/documents' }]

  if (!docResult.ok) {
    return (
      <Page title="Document" breadcrumbs={[...crumbsBase, { label: 'Document' }]} linkAs={Link}>
        <LoadFailed what="this document" retryHref={`/documents/${id}`} />
      </Page>
    )
  }
  if (!docResult.data) notFound()
  const doc = docResult.data as DocDetailRow

  // 60-minute signed URL so the user can preview/download. A failure here
  // only hides the "Open file" button; the text below still works.
  const signedRes = await supabase.storage.from('hoa-documents').createSignedUrl(doc.storage_path, 3600)
  const signed = signedRes.error ? null : signedRes.data

  // Version history. A failed read is reported, not shown as "no history".
  const versionsResult = await tryLoad('document versions', () => listDocumentVersions(doc.id))
  const versionItems = versionsResult.ok
    ? await Promise.all(
        versionsResult.data.map(async (v) => ({
          id: v.id,
          versionNumber: v.version_number,
          name: v.name,
          fileSize: v.file_size,
          reason: v.reason,
          createdAt: v.created_at,
          downloadUrl: await signedDownloadUrl(v.storage_path),
        })),
      )
    : []

  const parse = documentParseStatus(doc.parsed_at)

  return (
    <Page
      title={doc.name}
      meta={<StatusBadge status={parse} tones={DOCUMENT_PARSE_TONES} labels={DOCUMENT_PARSE_LABELS} />}
      description={
        <>
          {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
          {doc.created_at ? ` · uploaded ${format(new Date(doc.created_at), 'PP')}` : ''}
        </>
      }
      breadcrumbs={[...crumbsBase, { label: doc.name }]}
      linkAs={Link}
      actions={
        signed?.signedUrl ? (
          <Button asChild variant="secondary" icon={<FileText aria-hidden />}>
            <a href={signed.signedUrl} target="_blank" rel="noreferrer">
              Open file
            </a>
          </Button>
        ) : null
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle as="h2">Searchable text</CardTitle>
          <CardDescription>
            Violations and Ask the Docs cite this text. Paste or correct it here if the file couldn’t be read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParsedTextEditor
            documentId={doc.id}
            initialText={doc.parsed_text}
            initialSections={null as ParsedSection[] | null}
          />
        </CardContent>
      </Card>

      {versionsResult.ok ? (
        <DocumentActions documentId={doc.id} versions={versionItems} />
      ) : (
        <>
          <LoadFailed what="the version history" hint="Replacing or deleting the document is still available below." />
          <DocumentActions documentId={doc.id} versions={[]} />
        </>
      )}
    </Page>
  )
}
