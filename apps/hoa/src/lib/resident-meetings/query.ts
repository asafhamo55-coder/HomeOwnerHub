/**
 * The resident meetings read (BL-088).
 *
 * Always called with the signed-in user's OWN client (RLS-bound), never
 * service role.
 *
 * WHERE THE ROWS COME FROM. 0063 made hoa_meeting_minutes board-only for
 * every command (C-19: drafts, raw transcripts, attendees), so a resident
 * reading the table gets nothing. A row-level resident policy would not
 * be enough either: RLS filters rows, not columns, so an approved row
 * would hand the resident its raw_transcript through PostgREST. The read
 * therefore goes through `resident_meeting_notices()`, a SECURITY DEFINER
 * function that returns only RESIDENT_MEETING_COLUMNS for the caller's own
 * orgs. That function is NOT in the database yet (no migration ships with
 * BL-088; the SQL is proposed in the BL-088 report). Until it is applied,
 * PostgREST answers "function not found" and this returns
 * `{ available: false }`, which the page shows as "not available yet",
 * never as "no meetings". Once applied it starts working with no deploy.
 *
 * The status and date rule is applied three times: in the function, in
 * this query's filters, and again on the returned rows (select.ts), so a
 * looser function can never widen what a resident sees.
 *
 * Errors throw with the code only (no row values) so the page shows
 * "Couldn't load" rather than a falsely empty list.
 *
 * No 'use server' and no Next imports: tests/integration imports this.
 */
import {
  RESIDENT_MEETING_COLUMNS,
  selectResidentMeetings,
  type ResidentMeetingRow,
  type ResidentMeetings,
} from './select'

export const RESIDENT_MEETINGS_FUNCTION = 'resident_meeting_notices'

/** Upcoming meetings are few by nature; past minutes are capped and the page says so. */
export const UPCOMING_LIMIT = 20
export const PAST_LIMIT = 24

/** PostgREST / Postgres codes for "that function does not exist". */
const MISSING_FUNCTION = new Set(['PGRST202', '42883'])

interface QueryError {
  code?: string
  message?: string
}
interface QueryResponse {
  data: unknown
  error: QueryError | null
}
interface Filterable extends PromiseLike<QueryResponse> {
  select(columns: string): Filterable
  eq(column: string, value: string): Filterable
  gte(column: string, value: string): Filterable
  lt(column: string, value: string): Filterable
  order(column: string, opts: { ascending: boolean }): Filterable
  limit(n: number): Filterable
}

/**
 * The function is not in the generated Database types (it is not applied),
 * so the client is taken structurally. Any supabase-js client fits.
 */
export interface MeetingsClient {
  rpc(fn: string): unknown
}

export type ResidentMeetingsResult =
  | ({ available: true; pastCapped: boolean } & ResidentMeetings)
  | { available: false }

export class ResidentMeetingsLoadError extends Error {
  constructor(readonly code: string | undefined) {
    super(`resident meetings read failed (${code ?? 'no code'})`)
    this.name = 'ResidentMeetingsLoadError'
  }
}

function notices(client: MeetingsClient): Filterable {
  return (client.rpc(RESIDENT_MEETINGS_FUNCTION) as Filterable).select(RESIDENT_MEETING_COLUMNS)
}

export async function fetchResidentMeetings(
  client: MeetingsClient,
  opts: { orgId: string; today: string; timeZone: string },
): Promise<ResidentMeetingsResult> {
  const [up, past] = await Promise.all([
    notices(client)
      .eq('org_id', opts.orgId)
      .eq('status', 'draft')
      .gte('meeting_date', opts.today)
      .order('meeting_date', { ascending: true })
      .limit(UPCOMING_LIMIT),
    notices(client)
      .eq('org_id', opts.orgId)
      .eq('status', 'approved')
      .lt('meeting_date', opts.today)
      .order('meeting_date', { ascending: false })
      .limit(PAST_LIMIT),
  ])

  for (const r of [up, past]) {
    if (r.error && MISSING_FUNCTION.has(r.error.code ?? '')) return { available: false }
  }
  for (const r of [up, past]) {
    if (r.error) throw new ResidentMeetingsLoadError(r.error.code)
  }

  const upRows = (Array.isArray(up.data) ? up.data : []) as ResidentMeetingRow[]
  const pastRows = (Array.isArray(past.data) ? past.data : []) as ResidentMeetingRow[]
  const selected = selectResidentMeetings([...upRows, ...pastRows], opts)
  return { available: true, pastCapped: pastRows.length >= PAST_LIMIT, ...selected }
}
