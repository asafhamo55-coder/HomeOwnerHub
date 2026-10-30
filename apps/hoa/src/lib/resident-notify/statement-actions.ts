'use server'

// Round 16 — "Email to owner" on /properties/[id]/statement.
//
// Board/admin only: the role is re-checked here because a server action is a
// public endpoint. The client sends a property id and a period. The
// recipient address, the figures and the association are all read on the
// server inside the caller's org.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { parseDay } from '@/lib/properties/statement/window'
import { residentNotifyDeps } from './deps'
import { runStatementEmail, type StatementEmailStatus } from './statement-run'
import { supabaseStatementEmailStore } from './statement-store'

const Schema = z.object({ propertyId: z.string().uuid(), from: z.string(), to: z.string() })

export type EmailStatementResult =
  | { ok: true; status: Extract<StatementEmailStatus, 'sent' | 'held'>; message: string }
  | { ok: false; status: StatementEmailStatus | 'invalid' | 'forbidden'; error: string }

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta ?? {}),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta ?? {}),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta ?? {}),
}

const STATEMENT_MESSAGES = {
  sent: 'Statement sent to the owner.',
  held:
    'Not delivered. This account is in test mode or the safety guard held it, so no email left the system. It is recorded as suppressed.',
  opted_out: 'This owner has turned off email from the association.',
  duplicate: 'A statement for this home was already emailed in the last 24 hours. Try again tomorrow.',
  no_email: 'There is no email address on file for this home’s owner.',
  not_found: 'That home wasn’t found, or it has no unit linked.',
  email_not_configured: 'Email isn’t set up on this server, so nothing was sent.',
  failed: 'Couldn’t send the statement. Try again.',
} as const satisfies Record<StatementEmailStatus, string>

export async function emailStatementToOwner(input: {
  propertyId: string
  from: string
  to: string
}): Promise<EmailStatementResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, status: 'forbidden', error: gate.error }
  const parsed = Schema.safeParse(input)
  const from = parsed.success ? parseDay(parsed.data.from) : null
  const to = parsed.success ? parseDay(parsed.data.to) : null
  if (!parsed.success || !from || !to) return { ok: false, status: 'invalid', error: 'Invalid input.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const r = await runStatementEmail(
    supabaseStatementEmailStore(supabase),
    residentNotifyDeps,
    {
      propertyId: parsed.data.propertyId,
      from: from <= to ? from : to,
      to: from <= to ? to : from,
      actorUserId: user?.id ?? null,
      actorRole: gate.role,
      organizationId: gate.orgId,
    },
    logger,
  )
  if (r.status === 'sent' || r.status === 'held') {
    revalidatePath('/communications')
    return { ok: true, status: r.status, message: STATEMENT_MESSAGES[r.status] }
  }
  return { ok: false, status: r.status, error: STATEMENT_MESSAGES[r.status] }
}
