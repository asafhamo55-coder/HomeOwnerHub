import { CalendarDays, CircleHelp, FileText, Home, Megaphone, Sparkles } from 'lucide-react'
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
import { getCurrentOrg, getSignedInUser } from '@/lib/orgs'
import { timed } from '@/lib/perf/timing'
import { loadEmailConsent, type ConsentState } from '@/lib/email-consent'
import { ElectronicNotices } from './ElectronicNotices'
import { TextMessages } from './TextMessages'
import { loadTextMessagesState, type TextMessagesState } from '@/lib/sms-consent'
import { createAdminClient } from '@homeowner-portal/db'
import { MessageLanguage } from './MessageLanguage'
import { loadMyLanguage, type LanguageState } from '@/lib/language-preference'

export const metadata = { title: 'Account' }
export const dynamic = 'force-dynamic'

function initialsFrom(value: string): string {
  const cleaned = value.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || value
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || value.slice(0, 2)).toUpperCase()
}

const R = '/resident/account'

export default async function ResidentAccountPage() {
  const supabase = await getSupabaseServerClient()
  // getSignedInUser is the request-memoized getUser the resident layout
  // already made: no second auth round trip (BL-099 static pass). The org
  // is memoized the same way and needed by two of the reads below.
  const [user, actor, units, contacts, currentOrg] = await Promise.all([
    getSignedInUser(),
    timed(R, 'account.actor', () => getResidentActor()),
    timed(R, 'account.units', () => getResidentUnits()),
    timed(R, 'account.contacts', () => loadMyContacts()),
    getCurrentOrg(),
  ])

  const email = (actor.impersonating ? actor.email : user?.email) ?? ''

  // The profile name, the email consent and the text-message state each
  // need only the actor, the user and the org, so they are read together
  // rather than one after another (BL-099 static pass).

  // Prefer the profile's full name for the display name; fall back to the
  // email local-part so there's always something friendly to show.
  const fullNameP: Promise<string | null> =
    !actor.impersonating && user
      ? timed(R, 'account.profile', async () => {
          // A failed read only costs the friendly name — we fall back to the
          // email local-part below, which is still correct, so no error state.
          const { data, error } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle<{ full_name: string | null }>()
          return error ? null : data?.full_name?.trim() || null
        })
      : Promise.resolve(null)

  // BL-020 (M1): this member's consent to official notices by email.
  // Nothing is read — and nothing rendered — until M1_APPLIED. Viewing as a
  // resident reads their state through the confined admin client.
  const consentP: Promise<ConsentState | null | 'failed' | undefined> = (async () => {
    if (!M1_APPLIED) return undefined
    const org = actor.impersonating ? null : currentOrg
    const orgId = actor.impersonating ? actor.orgId : (org?.id ?? null)
    const memberId = actor.impersonating ? actor.id : (user?.id ?? null)
    if (!orgId || !memberId) return undefined
    const res = await timed(R, 'account.emailConsent', () => loadEmailConsent(actor.client, orgId))
    return !res.ok ? 'failed' : res.available ? (res.consent.get(memberId) ?? null) : undefined
  })()

  // BL-110: the resident's own agreement to text messages. Needs an
  // account (preferences are per user); viewing as an account-less owner
  // shows nothing.
  const textsP: Promise<TextMessagesState | 'failed' | null> = (async () => {
    if (!actor.id) return null
    const textOrg = currentOrg
    if (!textOrg || (actor.impersonating && actor.orgId !== textOrg.id)) return null
    // BL-111: the consent rows live in audit_log, which a resident can't
    // read; the service role reads only this user's rows in this org.
    const actorId = actor.id
    return timed(R, 'account.texts', () => loadTextMessagesState(actor.client, textOrg, actorId, createAdminClient()))
  })()

  // The language messages arrive in. Same actor/org gate as the texts card.
  const languageP: Promise<LanguageState | null> = (async () => {
    if (!actor.id) return null
    const langOrg = currentOrg
    if (!langOrg || (actor.impersonating && actor.orgId !== langOrg.id)) return null
    const actorId = actor.id
    return timed(R, 'account.language', () => loadMyLanguage(actor.client, langOrg.id, actorId))
  })()

  const [fullName, consent, texts, language] = await Promise.all([fullNameP, consentP, textsP, languageP])
  const displayName = fullName || email.split('@')[0] || 'Resident'

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

      {texts !== null ? <TextMessages state={texts} readOnly={actor.impersonating} /> : null}

      {language !== null ? (
        <MessageLanguage
          current={language.ok ? language.language : null}
          loadFailed={!language.ok}
          otherOrg={language.ok && language.otherOrg}
          readOnly={actor.impersonating}
        />
      ) : null}

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
          href="/resident/meetings"
          icon={<CalendarDays />}
          title="Meetings and notices"
          subtitle="Upcoming meetings, agendas and approved minutes"
          tone="info"
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
