/**
 * What the invitation email may say about where the person is being invited.
 * Supabase's "Invite user" template reads these as {{ .Data.association_name }}
 * and {{ .Data.org_name }}. A failed read never blocks an invitation: the data
 * just goes without a name and the template falls back to plain wording.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface InviteData {
  full_name?: string
  org_name?: string
  association_name?: string
}

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null
}

/** The inviter's association name, else the HOA (organization) name, else null. */
export async function loadInviteNames(
  admin: Db,
  orgId: string,
  orgName?: string | null,
): Promise<{ orgName: string | null; associationName: string | null }> {
  let org = clean(orgName)
  let assoc: string | null = null
  try {
    const a = await admin.from('associations').select('name').eq('organization_id', orgId).order('created_at', { ascending: true }).limit(1)
    assoc = clean((a?.data as Array<{ name?: string }> | null)?.[0]?.name)
    if (!org) {
      const o = await admin.from('orgs').select('name').eq('id', orgId).maybeSingle()
      org = clean((o?.data as { name?: string } | null)?.name)
    }
  } catch {
    /* no name is fine */
  }
  return { orgName: org, associationName: assoc ?? org }
}

/** The `data` for inviteUserByEmail; undefined when there is nothing to pass. */
export function buildInviteData(
  fullName: string | null | undefined,
  names: { orgName: string | null; associationName: string | null },
): InviteData | undefined {
  const d: InviteData = {}
  const n = clean(fullName)
  if (n) d.full_name = n
  if (names.orgName) d.org_name = names.orgName
  if (names.associationName) d.association_name = names.associationName
  return Object.keys(d).length ? d : undefined
}
