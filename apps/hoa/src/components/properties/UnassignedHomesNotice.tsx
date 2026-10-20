import Link from 'next/link'
import { Alert, Button } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadUnassignedHomes, unassignedHeadline } from '@/lib/properties/unassigned-homes'
import { AssignHomesForm } from './AssignHomesForm'

/**
 * "N homes aren't assigned to an association" (BL-125), on the dashboard
 * and /properties. A home with no association is never billed dues, so
 * this says so and offers the fix in place:
 *   - no association yet → set one up (its homes are attached then);
 *   - associations exist → the board assigns them (picking which, when
 *     there are several).
 *
 * Renders nothing when every home is assigned. A failed read renders
 * nothing too — it is a nudge, not the record — and is logged (ids and
 * codes only) by the loader.
 */
export async function UnassignedHomesNotice({ orgId }: { orgId: string }) {
  const supabase = await getSupabaseServerClient()
  const [load, ctx] = await Promise.all([loadUnassignedHomes(supabase, orgId), getCurrentUserRole()])
  // Units are a board write (RLS); the action re-checks.
  const canAssign = ctx?.role === 'admin' || ctx?.role === 'board'
  if (!load.ok || load.data.count === 0) return null
  const { count, associations } = load.data
  const one = count === 1
  const they = one ? 'It' : 'They'

  if (associations.length === 0) {
    return (
      <Alert
        variant="warning"
        title={unassignedHeadline(count)}
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href="/dues">Set up your association</Link>
          </Button>
        }
      >
        Dues can’t be billed until your HOA has an association. {they} will be added to it automatically when it’s set
        up.
      </Alert>
    )
  }

  return (
    <Alert
      variant="warning"
      title={unassignedHeadline(count)}
      actions={canAssign ? <AssignHomesForm associations={associations} /> : undefined}
    >
      {one ? 'It won’t' : 'They won’t'} be billed dues until {one ? 'it’s' : 'they’re'} assigned.
      {associations.length > 1 && canAssign
        ? ` Your HOA has more than one association, so pick the one ${one ? 'it belongs' : 'they belong'} to.`
        : ''}
      {!canAssign ? ` Ask someone on the board to assign ${one ? 'it' : 'them'}.` : ''}
    </Alert>
  )
}
