import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
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
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { getCurrentOrg } from '@/lib/orgs'
import { documentEmailSource } from '@/lib/inbox/provenance'
import { docDetailColumns, ownerVisibilityControl } from '@/lib/resident-documents/owner-control'
import { OwnerVisibilitySwitch } from '@/components/documents/OwnerVisibilitySwitch'
import { formatShortDate } from '@/lib/format-datetime'

interface DocDetailRow {
  id: string
  name: string
  type: string
  storage_path: string
  file_size: number | null
  parsed_text: string | null
  parsed_at: string | null
  created_at: string | null
  /** BL-052 (0064): selected only once M1_APPLIED. */
  visible_to_owners?: boolean
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
  // BL-175a L9: filter the by-id load to the current org (memoized read).
  const currentOrg = await getCurrentOrg()
  if (!currentOrg) notFound()

  const docResult = await loadOrFail(
    'document',
    supabase
      .from('hoa_documents')
      .select(docDetailColumns(M1_APPLIED))
      .eq('id', id)
      .eq('org_id', currentOrg.id)
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
  const doc = docResult.data as unknown as DocDetailRow
  const ownerControl = ownerVisibilityControl('hoa', doc.type, M1_APPLIED)

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

  // BL-134 B5 (0067): the email this document was filed from. Skipped
  // entirely (no org read, no query) until M3_APPLIED; a failure just
  // hides the link.
  const emailSource = M3_APPLIED
    ? await getCurrentOrg()
        .then((org) => (org ? documentEmailSource(supabase, org.id, doc.id) : null))
        .catch(() => null)
    : null

  return (
    <Page
      title={doc.name}
      meta={<StatusBadge status={parse} tones={DOCUMENT_PARSE_TONES} labels={DOCUMENT_PARSE_LABELS} />}
      description={
        <>
          {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
          {doc.created_at ? ` · uploaded ${formatShortDate(doc.created_at)}` : ''}
          {emailSource ? (
            <>
              {' · '}
              <Link href={`/inbox/${emailSource.threadId}`}>filed from an email</Link>
            </>
          ) : null}
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

      {/* BL-052 (M1): post this document to owners. Nothing renders until M1_APPLIED. */}
      {ownerControl !== 'none' ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Owners</CardTitle>
            <CardDescription>What owners see on the Documents page of their portal.</CardDescription>
          </CardHeader>
          <CardContent>
            {ownerControl === 'always' ? (
              <p className="text-sm text-foreground-secondary">
                Always visible to owners — governing documents and rules are posted to everyone.
              </p>
            ) : (
              <OwnerVisibilitySwitch
                documentId={doc.id}
                source="hoa"
                initial={doc.visible_to_owners === true}
                description="Owners can open and download this file in the portal. Turn off to take it down."
              />
            )}
          </CardContent>
        </Card>
      ) : null}

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
