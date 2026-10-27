/**
 * BL-168 follow-up: officer titles on the Georgia registration kit's officer
 * list. With M6_APPLIED off, nothing here reads the database and the kit
 * keeps its "titles by hand" lines. With it on, each board member's
 * org_members.officer_title (migration 0071) is shown beside their name.
 *
 * Org-scoped; logs carry codes, never names.
 */

import { OFFICER_TITLE_LABEL, readOfficerTitle } from '@/lib/professionals/model'

interface TitleDb {
  from(table: string): any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface KitBoardMember {
  userId: string
  name: string
  role: 'board' | 'admin'
}

export interface KitOfficer {
  name: string
  role: 'board' | 'admin'
  /** "Treasurer" etc.; null = none set (the kit leaves a line to write on). */
  title: string | null
}

/**
 * officer_title per user id for the org's board members, or null when the
 * flag is off (no query) or the read failed (logged by code). null means
 * "fill in by hand", never "no titles exist".
 */
export async function loadOfficerTitles(
  db: TitleDb,
  orgId: string,
  userIds: readonly string[],
  live: boolean,
): Promise<Map<string, string | null> | null> {
  if (!live || userIds.length === 0) return null
  const res = (await db
    .from('org_members')
    .select('user_id, officer_title')
    .eq('org_id', orgId)
    .eq('role', 'board')
    .in('user_id', [...userIds])) as { data: Array<{ user_id: string; officer_title: string | null }> | null; error: { code?: string } | null }
  if (res.error) {
    console.error('[ga-registration] officer titles read failed', { orgId, code: res.error.code ?? null })
    return null
  }
  return new Map((res.data ?? []).map((r) => [r.user_id, r.officer_title]))
}

/**
 * The kit's officer rows. `titles` null (flag off or failed read) leaves
 * every title null. Only board members carry a title; an admin never does.
 */
export function kitOfficers(board: readonly KitBoardMember[], titles: ReadonlyMap<string, string | null> | null): KitOfficer[] {
  return board
    .map((m) => {
      const t = titles && m.role === 'board' ? readOfficerTitle(titles.get(m.userId)) : null
      return { name: m.name, role: m.role, title: t ? OFFICER_TITLE_LABEL[t] : null }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
