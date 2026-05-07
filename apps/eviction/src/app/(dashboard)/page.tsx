import Link from 'next/link'
import { ScrollText, Plus } from 'lucide-react'
import { Button, EmptyState } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Cases' }

interface CaseRow {
  id: string
  property_address: string
  tenant_name: string | null
  status: string | null
  created_at: string | null
  filing_eligible_date: string | null
}

export default async function CasesHomePage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('eviction_cases')
    .select('id, property_address, tenant_name, status, created_at, filing_eligible_date')
    .order('created_at', { ascending: false })

  const cases = (data ?? []) as CaseRow[]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">Cases</h1>
          <p className="text-sm text-muted-fg">
            {cases.length} {cases.length === 1 ? 'case' : 'cases'} in {org.name}
          </p>
        </div>
        <Button asChild>
          <Link href="/cases/new">
            <Plus className="h-4 w-4" />
            New case
          </Link>
        </Button>
      </header>

      {cases.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-10 w-10" aria-hidden />}
          title="No cases yet"
          description="Start a new case to run a compliance check, generate a legal notice, and track filing dates."
          action={
            <Button asChild>
              <Link href="/cases/new">
                <Plus className="h-4 w-4" />
                Start first case
              </Link>
            </Button>
          }
        />
      ) : (
        // Kanban board comes in the next checkpoint along with case detail.
        <p className="text-sm text-muted-fg">
          {cases.length} case(s) on file. Kanban view and case detail land next checkpoint.
        </p>
      )}
    </div>
  )
}
