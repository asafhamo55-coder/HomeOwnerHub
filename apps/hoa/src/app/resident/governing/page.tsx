import Link from 'next/link'
import { FileText } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Governing Documents' }

interface DocRow {
  id: string
  name: string
  type: string | null
  created_at: string | null
  parsed_at: string | null
}

const DOC_TYPE_LABEL: Record<string, string> = {
  ccr: 'CC&Rs / Declaration',
  bylaws: 'Bylaws',
  rules: 'Rules & Responsibilities',
  policy: 'Policy',
  amendment: 'Amendment',
  other: 'Other',
}

export default async function ResidentGoverningPage() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_documents')
    .select('id, name, type, created_at, parsed_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = (data ?? []) as unknown as DocRow[]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Governing Documents</h1>
        <p className="text-sm text-muted">
          Your association's Declaration, Bylaws, Rules, and amendments.
          Tap a document to view it.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden />}
          title="No documents on file yet"
          description="Once your HOA uploads its governing documents you'll see them listed here. In the meantime, you can ask questions on the Ask the Docs page."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/resident/governing/${d.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/5"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-muted">
                      {d.created_at ? format(new Date(d.created_at), 'PP') : ''}
                      {d.parsed_at ? ' · Indexed' : ' · Not yet indexed'}
                    </p>
                  </div>
                  {d.type ? (
                    <Badge variant="outline" size="sm">
                      {DOC_TYPE_LABEL[d.type] ?? d.type}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
