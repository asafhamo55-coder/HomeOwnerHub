import { Home, Megaphone, Sparkles } from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getResidentUnits } from '@/lib/resident'
import { getResidentActor } from '@/lib/impersonation'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { SignOutButton } from '@/components/resident/SignOutButton'
import { IconTile, Panel, ScreenHeader, SectionLabel, TappableRow } from '@/components/resident/screen'

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
  ] = await Promise.all([supabase.auth.getUser(), getResidentActor(), getResidentUnits()])

  const email = (actor.impersonating ? actor.email : user?.email) ?? ''

  // Prefer the profile's full name for the display name; fall back to the
  // email local-part so there's always something friendly to show.
  let fullName: string | null = null
  if (!actor.impersonating && user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle<{ full_name: string | null }>()
    fullName = data?.full_name?.trim() || null
  }
  const displayName = fullName || email.split('@')[0] || 'Resident'

  const communities = [
    ...new Set(units.map((u) => u.association_name).filter((n): n is string => n != null && n !== '')),
  ]

  return (
    <div className="space-y-7">
      <ScreenHeader title="Account" />

      {/* Identity */}
      <Panel className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {initialsFrom(fullName || email || 'R')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-foreground">{displayName}</p>
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
          {units.map((u) => (
            <TappableRow
              key={u.unit_id}
              icon={<Home className="h-5 w-5" />}
              tone="slate"
              title={u.unit_number ?? u.address ?? 'Your unit'}
              subtitle={u.unit_number && u.address ? u.address : u.association_name ?? undefined}
              trailing={
                <Badge variant="outline" size="sm">
                  {u.ownership_pct ? `${u.ownership_pct}% owner` : 'Owner'}
                </Badge>
              }
            />
          ))}
        </section>
      ) : null}

      {/* Community */}
      <section className="space-y-2.5">
        <SectionLabel>Community</SectionLabel>
        <TappableRow
          href="/resident/announcements"
          icon={<Megaphone className="h-5 w-5" />}
          title="Announcements"
          subtitle="Updates from your board"
        />
        <TappableRow
          href="/resident/ask"
          icon={<Sparkles className="h-5 w-5" />}
          title="Ask the Docs"
          subtitle="Cited answers from your governing documents"
        />
      </section>

      {/* Preferences */}
      <section className="space-y-2.5">
        <SectionLabel>Preferences</SectionLabel>
        <Panel className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-foreground">Appearance</p>
            <p className="text-[13px] text-muted">Light, dark, or match your device</p>
          </div>
          <ThemeToggle />
        </Panel>
      </section>

      <SignOutButton />
    </div>
  )
}
