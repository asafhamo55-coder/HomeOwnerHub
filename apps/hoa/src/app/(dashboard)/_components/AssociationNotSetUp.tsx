import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Button, EmptyState } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { SetUpAssociationForm } from './SetUpAssociationForm'

/**
 * The org has no association yet, so nothing that hangs off one — dues,
 * the books — can exist (BL-046). Only an org admin can create one (RLS,
 * 0063), so:
 *   - an admin gets the inline create form, which also opens the books;
 *   - a board member is sent to Members, where the admins are listed.
 *
 * Use only after the association read SUCCEEDED and found none; a failed
 * read is `LoadFailed`.
 */
export async function AssociationNotSetUp({ needFor, returnTo }: { needFor: string; returnTo: string }) {
  const ctx = await getCurrentUserRole()
  const isAdmin = ctx?.role === 'admin'

  return isAdmin ? (
    <EmptyState
      icon={<Building2 aria-hidden />}
      title="Set up your association"
      description={`${needFor} Create the association and we’ll open its books — Operating and Reserve funds, a standard chart of accounts and this year’s fiscal period. You can rename or adjust any of it later.`}
      action={<SetUpAssociationForm defaultName={ctx.org.name} returnTo={returnTo} />}
    />
  ) : (
    <EmptyState
      icon={<Building2 aria-hidden />}
      title="No association set up yet"
      description={`${needFor} Only an admin of your HOA can create the association — ask one to open this page.`}
      action={
        <Button asChild variant="secondary">
          <Link href="/settings/members">See your HOA’s admins</Link>
        </Button>
      }
    />
  )
}
