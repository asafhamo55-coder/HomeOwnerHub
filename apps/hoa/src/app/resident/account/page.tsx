import { CircleHelp, FileText, Home, Megaphone, Sparkles } from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getResidentUnits } from '@/lib/resident'
import { loadMyContacts } from '@/lib/contact-updates/resident-load'
import { MyContactDetails } from './MyContactDetails'
import { getResidentActor } from '@/lib/impersonation'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { SignOutButton } from '@/components/resident/SignOutButton'
import { Panel, RowGroup, ScreenHeader, SectionLabel, TappableRow } from '@/components/resident/screen'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { getCurrentOrg } from '@/lib/orgs'
import { loadEmailConsent, type ConsentState } from '@/lib/email-consent'
import { ElectronicNotices } from './ElectronicNotices'

export const metadata = { title: 'Account' }
export const dynamic = 'force-dynamic'

function initialsFrom(value: string): string {
  const cleaned = value.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || value
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || value.slice(0, 2)).toUpperCase()
}

export default async function ResidentAccountPage() {
  const supabase = await getSupabaseServerClient()
  const [
    {
      data: { user },
    },
    actor,
    units,
    contacts,
  ] = await Promise.all([supabase.auth.getUser(), getResidentActor(), getResidentUnits(), loadMyContacts()])

  const email = (actor.impersonating ? actor.email : user?.email) ?? ''

  // Prefer the profile's full name for the display name; fall back to the
  // email local-part so there's always something friendly to show.
  let fullName: string | null = null
  if (!actor.impersonating && user) {
    // A failed read only costs the friendly name — we fall back to the
    // email local-part below, which is still correct, so no error state.
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle<{ full_name: string | null }>()
    fullName = error ? null : data?.full_name?.trim() || null
  }
  const displayName = fullName || email.split('@')[0] || 'Resident'

  // BL-020 (M1): this member's consent to official notices by email.
  // Nothing is read — and nothing rendered — until M1_APPLIED. Viewing as a
  // resident reads their state through the confined admin client.
  let consent: ConsentState | null | 'failed' | undefined
  if (M1_APPLIED) {
    const org = actor.impersonating ? null : await getCurrentOrg()
    const orgId = actor.impersonating ? actor.orgId : (org?.id ?? null)
    const memberId = actor.impersonating ? actor.id : (user?.id ?? null)
    if (orgId && memberId) {
      const res = await loadEmailConsent(actor.client, orgId)
      consent = !res.ok ? 'failed' : res.available ? (res.consent.get(memberId) ?? null) : undefined
    }
  }

  const communities = [
    ...new Set(units.map((u) => u.association_name).filter((n): n is string => n != null && n !== '')),
  ]

  return (
    <div className="space-y-8">
      <ScreenHeader title="Account" />

      {/* Identity */}
      <Panel className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-lg font-semibold text-primary">
          {initialsFrom(fullName || email || 'R')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">{displayName}</p>
          {email ? <p className="truncate text-sm text-muted">{email}</p> : null}
          {communities.length > 0 ? (
            <p className="mt-0.5 truncate text-xs text-muted">{communities.join(' · ')}</p>
          ) : null}
        </div>
      </Panel>

      {/* Homes */}
      {units.length > 0 ? (
        <section className="space-y-2.5">
          <SectionLabel>My {units.length === 1 ? 'home' : 'homes'}</SectionLabel>
          <RowGroup>
          {units.map((u) => (
            <TappableRow
              key={u.unit_id}
              icon={<Home />}
              tone="slate"
              title={u.unit_number ?? u.address ?? 'Your unit'}
              subtitle={u.unit_number && u.address ? u.address : u.association_name ?? undefined}
              trailing={
                <Badge variant="neutral" size="sm">
                  {u.ownership_pct ? `${u.ownership_pct}% owner` : 'Owner'}
                </Badge>
              }
            />
          ))}
          </RowGroup>
        </section>
      ) : null}

      {/* PR-10: my contact details (a change goes to the board for approval) */}
      <MyContactDetails
        homes={contacts.ok ? contacts.data.homes : null}
        signInEmail={contacts.ok ? contacts.data.signInEmail : null}
        readOnly={actor.impersonating}
      />

      {consent !== undefined ? <ElectronicNotices consent={consent} readOnly={actor.impersonating} /> : null}

      {/* Community */}
      <section className="space-y-2.5">
        <SectionLabel>Community</SectionLabel>
        <RowGroup>
        <TappableRow
          href="/resident/announcements"
          icon={<Megaphone />}
          title="Announcements"
          subtitle="Updates from your board"
        />
        <TappableRow
          href="/resident/documents"
          icon={<FileText />}
          title="Documents"
          subtitle="CC&Rs, bylaws, rules and policies"
          tone="slate"
        />
        <TappableRow
          href="/resident/ask"
          icon={<Sparkles />}
          title="Ask the Docs"
          subtitle="Cited answers from your governing documents"
          tone="ai"
        />
        <TappableRow
          href="/resident/help"
          icon={<CircleHelp />}
          title="Help"
          subtitle="How to pay dues, ask for approval and more"
          tone="info"
        />
        </RowGroup>
      </section>

      {/* Preferences */}
      <section className="space-y-2.5">
        <SectionLabel>Preferences</SectionLabel>
        <Panel className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Appearance</p>
            <p className="text-xs text-muted">Light, dark, or match your device</p>
          </div>
          <ThemeToggle />
        </Panel>
      </section>

      <SignOutButton />
    </div>
  )
}
