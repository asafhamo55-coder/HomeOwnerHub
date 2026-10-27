import Link from 'next/link'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { loadOrFail } from '@/lib/load-or-fail'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { readBoardContacts, type BoardContact } from '@/lib/association-contacts'
import { AssociationSettingsForm, type AssociationRow } from './AssociationSettingsForm'
import { BoardContactsForm } from './BoardContactsForm'

export const metadata = { title: 'Association' }
export const dynamic = 'force-dynamic'

// Settings → Association (BL-176): the association's name, state, type and
// governing-law state. Board can read; only an admin can change them (the
// save action enforces it; RLS alone would let a board member through).
// The board-contacts card below it is editable by board and admin alike.

export default async function AssociationSettingsPage() {
  const { role, org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const load = await loadOrFail(
    'association settings',
    supabase
      .from('associations')
      .select('id, name, state, governing_law_state, type, compliance_settings')
      .eq('organization_id', org.id)
      .order('name', { ascending: true }),
  )

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Association"
      description="Which state’s law your community follows, and whether it is an HOA, condominium or co-op."
      tabs={<SettingsTabs current="/settings/association" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (!load.ok) return page(<LoadFailed what="your association" />)
  const raw = (load.data ?? []) as Array<{
    id: string
    name: string
    state: string | null
    governing_law_state: string | null
    type: string
    compliance_settings: unknown
  }>
  const contactsById = new Map<string, BoardContact[]>(raw.map((r) => [r.id, readBoardContacts(r.compliance_settings)]))
  const rows = raw.map(
    (r): AssociationRow => ({
      id: r.id,
      name: r.name,
      state: r.state,
      governingLawState: r.governing_law_state,
      type: r.type,
    }),
  )

  if (rows.length === 0) {
    return page(
      <AssociationNotSetUp
        needFor="The state your community is in decides which law applies, and this HOA doesn’t have an association yet."
        returnTo="/settings/association"
      />,
    )
  }

  return page(
    <div className="space-y-6">
      {rows.map((a) => (
        <div key={a.id} className="space-y-6">
          <AssociationSettingsForm association={a} canEdit={role === 'admin'} />
          <BoardContactsForm associationId={a.id} associationName={a.name} initial={contactsById.get(a.id) ?? []} />
        </div>
      ))}
    </div>,
  )
}
