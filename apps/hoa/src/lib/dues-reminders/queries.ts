import { getSupabaseServerClient } from '@/lib/supabase/server'

/** The window the UI calls "recently reminded". One constant so the
 *  panel's "Reminded 3d ago" line and the dialog's repeat warning can
 *  never disagree. */
export const RECENT_REMINDER_DAYS = 7

/** Marker written to communications.related_resource so a dues reminder
 *  is distinguishable from a hand-written dues announcement. */
export const DUES_REMINDER_RESOURCE_TYPE = 'dues_reminder'

interface CommRow {
  sent_at: string | null
  communication_recipients: { email: string | null }[] | null
}

/** `ok: true` carries email (lowercased) → ISO timestamp of the most
 *  recent reminder sent to them, bounded to the last 200 campaigns —
 *  reminders are infrequent and the panel only cares about the recent
 *  past. `ok: false` means the lookup itself failed: deliberately a
 *  distinct shape from `{ ok: true, lastReminded: <empty map> } ` so a
 *  callsite can't mistake "we don't know" for "clean, nobody reminded
 *  recently" — see the comment on the `error` branch below. */
export type LastRemindedResult =
  | { ok: true; lastReminded: Map<string, string> }
  | { ok: false }

export async function getLastRemindedByEmail(
  associationId: string,
): Promise<LastRemindedResult> {
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('communications')
    .select('sent_at, communication_recipients(email)')
    .eq('association_id', associationId)
    // related_resource->>type is a PostgREST JSON-path operator. The unit tests
    // mock the Supabase client, so they don't prove the real database accepts
    // this filter. Verify against a live database before merge — Task 10 covers
    // this by sending one reminder and confirming "Reminded today" appears.
    // If the filter is rejected, fall back to selecting related_resource
    // unfiltered and narrow in JS:
    //   const rows = (data ?? []).filter(
    //     (r) => (r.related_resource as { type?: string } | null)?.type === DUES_REMINDER_RESOURCE_TYPE,
    //   )
    .eq('related_resource->>type', DUES_REMINDER_RESOURCE_TYPE)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(200)

  // Deliberately NOT thrown, unlike the reads in packets.ts. What this
  // map feeds is advisory: the "Reminded 3d ago" annotation and the
  // dialog's repeat warning. Both call sites degrade on `ok: false`
  // (WhoOwesPanel's allSettled branch, and previewDuesReminders), because
  // losing an annotation is not a reason to hide who owes money. Throwing
  // would also take down previewDuesReminders, which does not otherwise
  // degrade — so the honest behaviour here is to report that the lookup
  // failed rather than pretend an empty result is a clean one. Message
  // only, never the row data: those rows carry emails.
  if (error) {
    console.error('getLastRemindedByEmail: lookup failed', { message: error.message })
    return { ok: false }
  }

  const rows = (data ?? []) as unknown as CommRow[]
  const latest = new Map<string, string>()

  for (const row of rows) {
    if (!row.sent_at) continue
    for (const recipient of row.communication_recipients ?? []) {
      const email = recipient.email?.trim().toLowerCase()
      if (!email) continue
      const seen = latest.get(email)
      if (!seen || row.sent_at > seen) latest.set(email, row.sent_at)
    }
  }

  return { ok: true, lastReminded: latest }
}
