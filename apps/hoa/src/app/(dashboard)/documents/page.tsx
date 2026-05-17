import Link from 'next/link'
import { FileText, Plus, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState, Tabs } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Documents' }

const DOC_TABS = [
  { label: 'All documents', href: '/documents' },
  { label: 'Governing docs', href: '/documents/governing' },
]

interface DocRow {
  id: string
  name: string
  type: string
  file_size: number | null
  parsed_at: string | null
  created_at: string | null
}

const TYPE_LABEL: Record<string, string> = {
  ccr: 'CC&R',
  bylaws: 'Bylaws',
  rules: 'Rules',
  other: 'Other',
}

function bytes(n: number | null): string {
  if (!n) return '—'
  const mb = n / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

export default async function DocumentsPage() {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('hoa_documents')
    .select('id, name, type, file_size, parsed_at, created_at')
    .order('created_at', { ascending: false })

  const docs = (data ?? []) as DocRow[]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Documents</h1>
          <p className="text-sm text-muted">
            CC&amp;Rs, bylaws, and rules. Parsed text powers Covenant Brain matching in the
            violation wizard.
          </p>
        </div>
        <Button asChild>
          <Link href="/documents/upload">
            <Plus className="h-4 w-4" />
            Upload
          </Link>
        </Button>
      </header>

      <Tabs items={DOC_TABS} currentPath="/documents" aria-label="Document sections" />

      {error ? (
        <Card>
          <div className="p-6 text-sm text-destructive">{error.message}</div>
        </Card>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden />}
          title="No documents yet"
          description="Upload your CC&Rs first — they're the foundation of every violation letter."
          action={
            <Button asChild>
              <Link href="/documents/upload">
                <Plus className="h-4 w-4" />
                Upload first document
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/documents/${d.id}`} className="block">
                    <p className="truncate font-medium text-foreground hover:text-primary">{d.name}</p>
                  </Link>
                  <p className="text-xs text-muted">
                    {TYPE_LABEL[d.type] ?? d.type} · {bytes(d.file_size)}
                    {d.created_at ? ` · uploaded ${format(new Date(d.created_at), 'PP')}` : ''}
                  </p>
                </div>
                {d.parsed_at ? (
                  <Badge variant="success" size="sm">
                    <Sparkles className="mr-1 h-3 w-3" />
                    Parsed
                  </Badge>
                ) : (
                  <Badge variant="outline" size="sm">
                    Needs parsing
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
