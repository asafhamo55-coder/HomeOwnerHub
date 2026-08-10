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

/**
 * email (lowercased) → ISO timestamp of the most recent reminder sent to
 * them. Bounded to the last 200 campaigns; reminders are infrequent and
 * the panel only cares about the recent past.
 */
export async function getLastRemindedByEmail(
  associationId: string,
): Promise<Map<string, string>> {
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
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

  return latest
}
