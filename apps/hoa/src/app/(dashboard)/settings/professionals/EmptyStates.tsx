import { UserPlus } from 'lucide-react'
import { Button, EmptyState } from '@homeowner-portal/ui'
import type { OfficerRow } from '@/lib/professionals/load'

/** Id of the invite card on the page, so the empty state can jump to the form. */
export const INVITE_FORM_ID = 'invite-professional'
/** Id of the officers list, so the Treasurer prompt can jump to the title pickers. */
export const OFFICERS_LIST_ID = 'officer-titles'

/** "Who has access" with nobody in it: what the page is for, and the one next step. */
export function NoProfessionalsYet() {
  return (
    <EmptyState
      variant="compact"
      icon={<UserPlus aria-hidden />}
      title="No CPA or attorney yet"
      description="Invite your CPA or attorney here. They get only the access their job needs, until the date you pick."
      action={
        <Button asChild>
          <a href={`#${INVITE_FORM_ID}`}>Invite a CPA or attorney</a>
        </Button>
      }
    />
  )
}

/**
 * Shown above the officer list while no board member is titled Treasurer.
 * Money approvals go to the Treasurer first once one is set. Only an admin can
 * set titles, so only an admin gets the link; everyone else gets the explanation.
 */
export function NoTreasurerNotice({ rows, canEdit }: { rows: OfficerRow[]; canEdit: boolean }) {
  if (rows.some((r) => r.title === 'treasurer')) return null
  const hasBoard = rows.length > 0
  return (
    <div className="rounded-lg border border-border bg-subtle p-4 text-sm" data-testid="no-treasurer">
      <p className="font-medium">No Treasurer set</p>
      <p className="mt-1 text-foreground-secondary">
        Once a Treasurer is set, money approvals go to them first. Until then, any admin can sign off.
      </p>
      {canEdit && hasBoard ? (
        <p className="mt-2">
          <a className="font-medium underline" href={`#${OFFICERS_LIST_ID}`}>
            Set the Treasurer below
          </a>
        </p>
      ) : null}
      {canEdit && !hasBoard ? (
        <p className="mt-2">
          <a className="font-medium underline" href="/settings/members">
            Add a board member first
          </a>
        </p>
      ) : null}
      {!canEdit ? <p className="mt-2 text-foreground-secondary">Ask an admin to set it.</p> : null}
    </div>
  )
}
