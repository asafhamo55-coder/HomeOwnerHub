import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { GoverningDocsUploader } from './GoverningDocsUploader'

export const metadata = { title: 'Governing Documents' }

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
  chunk_count: number
}

export default async function GoverningDocumentsPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const supabase = await getSupabaseServerClient()

  const { data: assocs } = await supabase
    .from('associations' as never)
    .select('id, name')
    .eq('organization_id' as never, org.id)
    .order('created_at' as never, { ascending: true })

  const associations = (assocs ?? []) as AssociationRow[]

  const { data: docs } = await supabase
    .from('governing_documents' as never)
    .select('id, title, type, effective_date, parsed_at')
    .eq('organization_id' as never, org.id)
    .is('superseded_at' as never, null)
    .order('created_at' as never, { ascending: false })
    .limit(50)

  // Fetch chunk counts per document. One round-trip is fine for v1.
  const docList = (docs ?? []) as Omit<GoverningDocRow, 'chunk_count'>[]
  const enriched: GoverningDocRow[] = []
  for (const d of docList) {
    const { count } = (await supabase
      .from('governing_document_chunks' as never)
      .select('id', { count: 'exact', head: true } as never)
      .eq('document_id' as never, d.id)) as unknown as { count: number | null }
    enriched.push({ ...d, chunk_count: count ?? 0 })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-muted">Governing Documents</h1>
        <p className="text-sm text-muted-fg">
          Upload your Declaration, Bylaws, Rules, amendments, and policies.
          We extract the text, split it into chunks, and feed it to the
          Governing Docs Brain so questions on the <a className="underline" href="/ai/ask">Ask the Docs</a> page get cited answers.
        </p>
      </header>

      {associations.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-fg">
              No association on file yet. Open the Settings page first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <GoverningDocsUploader associations={associations} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Loaded documents</CardTitle>
        </CardHeader>
        <CardContent>
          {enriched.length === 0 ? (
            <p className="text-sm text-muted-fg">
              Nothing yet. Upload your first document above.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {enriched.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-fg">
                      {capitalize(d.type)}
                      {d.effective_date ? ` · effective ${d.effective_date}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">{d.chunk_count} chunks</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}
