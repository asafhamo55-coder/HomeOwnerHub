'use server'

/**
 * BL-129: "Respond to the board" on /resident/violations/[id].
 *
 * The resident writes the ticket and its messages with their OWN client
 * (0024/0063 RLS). The service role is used for one thing, the audit_log
 * row linking the ticket to the violation (residents cannot write
 * audit_log), and only after postViolationResponse has confirmed the
 * violation is on a home this resident owns or occupies. See
 * violation-response.ts. Nothing is sent to the resident; the board hears
 * about it as about any new ticket.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '@homeowner-portal/jobs'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentUnits } from '@/lib/resident'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { postViolationResponse, type Db } from '@/lib/violation-response'

export type RespondToViolationResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const Schema = z.object({
  violationId: z.string().uuid('That notice isn’t valid.'),
  body: z.string().trim().min(1, 'Write your response first.').max(4000, 'Keep it under 4,000 characters.'),
})

export async function respondToMyViolation(violationId: string, body: string): Promise<RespondToViolationResult> {
  // Gate first: an impersonating admin reads the resident portal but never
  // writes as the owner.
  const actor = await getResidentActor()
  if (actor.impersonating) return { ok: false, error: IMPERSONATION_READONLY_MSG }

  const parsed = Schema.safeParse({ violationId, body })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = String(issue?.path[0] ?? '')
    return { ok: false, error: issue?.message ?? 'Invalid input.', ...(field === 'body' ? { fieldErrors: { body: issue!.message } } : {}) }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  // getResidentUnits throws when its read fails (never "no home"); a form
  // gets a retry message instead of an unhandled error.
  let units: Awaited<ReturnType<typeof getResidentUnits>>
  try {
    units = await getResidentUnits()
  } catch {
    return { ok: false, error: 'We couldn’t load your home just now. Please try again.' }
  }
  if (units.length === 0) return { ok: false, error: 'We couldn’t find that notice on your home.' }

  const result = await postViolationResponse(
    {
      db: supabase as unknown as Db,
      admin: createAdminClient() as unknown as Db,
      notifyBoard: async (ticketId) => {
        await inngest.send({ name: 'ticket/created', data: { ticketId, organizationId: org.id } })
      },
    },
    {
      violationId: parsed.data.violationId,
      body: parsed.data.body,
      userId: user.id,
      orgId: org.id,
      unitIds: units.map((u) => u.unit_id),
      associationIdOf: (unitId) => units.find((u) => u.unit_id === unitId)?.association_id ?? null,
    },
  )
  if (!result.ok) return result

  revalidatePath(`/resident/violations/${parsed.data.violationId}`)
  revalidatePath(`/violations/${parsed.data.violationId}`)
  revalidatePath(`/tickets/${result.ticketId}`)
  revalidatePath('/resident/tickets')
  return { ok: true, ticketId: result.ticketId }
}
