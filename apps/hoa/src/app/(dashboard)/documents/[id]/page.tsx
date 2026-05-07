import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeownerhub/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ParsedTextEditor } from './ParsedTextEditor'

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

const TYPE_LABEL: Record<string, string> = {
  ccr: 'CC&R',
  bylaws: 'Bylaws',
  rules: 'Rules',
  other: 'Other',
}

interface ParsedSection {
  number: string
  title: string
  summary: string
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from('hoa_documents')
    .select('id, name, type, storage_path, file_size, parsed_text, parsed_at, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const doc = data as DocDetailRow

  // 60-minute signed URL so the user can preview/download.
  const { data: signed } = await supabase.storage
    .from('hoa-documents')
    .createSignedUrl(doc.storage_path, 3600)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to documents
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-muted">{doc.name}</h1>
          <p className="text-sm text-muted-fg">
            {TYPE_LABEL[doc.type] ?? doc.type}
            {doc.created_at ? ` · uploaded ${format(new Date(doc.created_at), 'PP')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {doc.parsed_at ? (
            <Badge variant="success">Parsed</Badge>
          ) : (
            <Badge variant="outline">Needs parsing</Badge>
          )}
          {signed?.signedUrl ? (
            <a
              href={signed.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted hover:bg-background"
            >
              <FileText className="h-4 w-4" />
              Open file
            </a>
          ) : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document text</CardTitle>
        </CardHeader>
        <CardContent>
          <ParsedTextEditor
            documentId={doc.id}
            initialText={doc.parsed_text}
            initialSections={null as ParsedSection[] | null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
