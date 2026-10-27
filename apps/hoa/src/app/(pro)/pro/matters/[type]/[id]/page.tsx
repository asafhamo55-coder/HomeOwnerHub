import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Page } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { requireRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/orgs'
import { writeProAudit } from '@/lib/professionals/audit'
import { loadMatterParty } from '@/lib/professionals/load'
import { MATTER_LABEL, MatterRefSchema, PRO_AUDIT } from '@/lib/professionals/model'
import { LetterForm, NoteForm, UploadForm } from '@/components/pro/AttorneyForms'

export const metadata = { title: 'Matter' }
export const dynamic = 'force-dynamic'

type Q = { eq(c: string, v: string): Q; maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { code?: string } | null }> }
type Loose = { from(t: string): { select(c: string): Q } }

const SHOWN = ['status', 'opened_on', 'closed_on', 'violation_type', 'severity', 'category', 'attorney_firm', 'attorney_reference', 'created_at']

export default async function MatterPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { org } = await requireRole(['attorney'] as const)
  const ref = MatterRefSchema.safeParse(await params)
  if (!ref.success) notFound()
  const matter = ref.data
  const supabase = await getSupabaseServerClient()

  // The matter is read with the attorney's own session: unassigned = no row = 404.
  const table = matter.type === 'collections_case' ? 'collection_cases' : matter.type === 'violation' ? 'hoa_violations' : 'tickets'
  const { data: row, error: rowError } = await (supabase as unknown as Loose).from(table).select('*').eq('id', matter.id).eq(matter.type === 'violation' ? 'org_id' : 'organization_id', org.id).maybeSingle()
  if (rowError) throw new Error(`matter read failed (${rowError.code ?? 'error'})`)
  if (!row) notFound()

  const party = await loadMatterParty(supabase, org.id, matter.type, matter.id)
  const user = await getSignedInUser()
  await writeProAudit(createAdminClient(), {
    orgId: org.id,
    userId: user?.id ?? null,
    action: PRO_AUDIT.matterViewed,
    entityType: matter.type,
    entityId: matter.id,
  })

  const facts = Object.entries(row)
    .filter(([k, v]) => SHOWN.includes(k) && v != null)
    .map(([k, v]) => [k.replace(/_/g, ' '), String(v)] as const)

  return (
    <Page title={MATTER_LABEL[matter.type]} description="Read-only record. Your notes, uploads and drafts go to the board for approval.">
      <Card>
        <CardHeader>
          <CardTitle as="h2">The matter</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {party ? (
              <>
                <div>
                  <dt className="text-foreground-secondary">Owner</dt>
                  <dd>{party.ownerName ?? 'Not on file'}</dd>
                </div>
                <div>
                  <dt className="text-foreground-secondary">Home address</dt>
                  <dd>{party.address}</dd>
                </div>
              </>
            ) : null}
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-foreground-secondary capitalize">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle as="h2">Add a note</CardTitle>
        </CardHeader>
        <CardContent>
          <NoteForm matter={matter} />
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle as="h2">Draft a letter</CardTitle>
          <CardDescription>The board approves the draft. Nothing is sent from here.</CardDescription>
        </CardHeader>
        <CardContent>
          <LetterForm matter={matter} />
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle as="h2">Upload a document</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm matter={matter} />
        </CardContent>
      </Card>
    </Page>
  )
}
