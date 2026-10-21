'use client'

import { Loader2, Mail, Phone, Plus, Users2, X } from 'lucide-react'
import { Badge, Button, Checkbox, Field, Input, Select, cn } from '@homeowner-portal/ui'
import type {
  ResidentOption,
  BoardMemberOption,
} from '@/lib/communications/actions'
import type { StreetOption } from '@/lib/communications/streets'

export interface AudienceCounts {
  everyone: number
  owners_only: number
  tenants_only: number
  late_on_dues: number
  open_violations: number
  board: number
}

export interface PropertyOption {
  id: string
  label: string
}

// 'specific_property' drives the property + resident-picker UI; on
// submit it converts to the resolver's 'specific_residents' shape.
// 'street' (BL-102 A5) converts to 'specific_units' with that street's
// unit ids. 'manual_emails' drives a free-form email entry list — also
// passes through to the resolver as-is.
export type AudienceKind =
  | keyof AudienceCounts
  | 'specific_property'
  | 'street'
  | 'follow_up'
  | 'manual_emails'

/** BL-102 A5: plain-language names. Order is the order shown. */
export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  follow_up: 'Homes that haven’t opened it',
  everyone: 'All homes',
  owners_only: 'All owners',
  tenants_only: 'Renters',
  late_on_dues: 'Homes behind on dues',
  open_violations: 'Homes with an open violation',
  street: 'A street',
  specific_property: 'One home',
  board: 'Board',
  manual_emails: 'Someone outside the HOA',
}

const AUDIENCE_HINTS: Record<AudienceKind, string> = {
  follow_up: 'The homes that didn’t open the earlier email',
  everyone: 'Every home, owner or renter',
  owners_only: 'The owner of each home',
  tenants_only: 'Homes with a current renter',
  late_on_dues: 'Homes with an overdue charge',
  open_violations: 'The owner of each home with a violation not yet resolved',
  street: 'Homes on one street; untick any to leave out',
  specific_property: 'Pick people at one address',
  board: 'Board members (email + portal)',
  manual_emails: 'Vendors, attorneys, anyone else',
}

const EMPTY_SET: ReadonlySet<string> = new Set()
function noop() {}

/** BL-102 A9: shown only under "More options". */
const ADVANCED_AUDIENCES: ReadonlySet<AudienceKind> = new Set(['board', 'manual_emails'])

export interface ManualContact {
  email: string
  phone: string
  name: string
}

interface Props {
  pending: boolean

  audience: AudienceKind
  setAudience: (kind: AudienceKind) => void
  audienceCounts: AudienceCounts
  properties: PropertyOption[]

  /** BL-102 A8: homes in a follow-up; the option shows only when set. */
  followUpCount?: number

  // Street audience state (BL-102 A5).
  streets: StreetOption[]
  selectedStreetKey: string
  setSelectedStreetKey: (key: string) => void
  streetOwnersOnly: boolean
  setStreetOwnersOnly: (v: boolean) => void
  /** BL-146: homes unticked on the chosen street. */
  streetExcluded?: ReadonlySet<string>
  toggleStreetHome?: (unitId: string) => void
  setStreetExcluded?: (next: Set<string>) => void

  // Manual contacts audience state.
  manualContacts: ManualContact[]
  draftName: string
  setDraftName: (v: string) => void
  draftEmail: string
  setDraftEmail: (v: string) => void
  draftPhone: string
  setDraftPhone: (v: string) => void
  addManualContact: () => { ok: true } | { ok: false; error: string }
  setError: (message: string) => void
  removeContact: (index: number) => void

  // Specific-property audience state.
  selectedPropertyId: string
  setSelectedPropertyId: (id: string) => void
  residents: ResidentOption[]
  residentsLoading: boolean
  checkedResidentIds: Set<string>
  toggleResident: (id: string) => void
  selectAllResidents: () => void
  selectByRole: (role: ResidentOption['role']) => void
  clearResidents: () => void

  // Board audience state.
  boardMembers: BoardMemberOption[]
  boardLoading: boolean
  checkedBoardIds: Set<string>
  toggleBoardMember: (id: string) => void
  selectAllBoard: () => void
  clearBoard: () => void
}

/**
 * The audience-selection block of the new-communication wizard. All state
 * and handlers stay owned by the wizard — this component is pure
 * presentation over the props above.
 */
export function AudienceStep({
  pending,
  audience,
  setAudience,
  audienceCounts,
  properties,
  followUpCount = 0,
  streets,
  selectedStreetKey,
  setSelectedStreetKey,
  streetOwnersOnly,
  setStreetOwnersOnly,
  streetExcluded = EMPTY_SET,
  toggleStreetHome = noop,
  setStreetExcluded = noop,
  manualContacts,
  draftName,
  setDraftName,
  draftEmail,
  setDraftEmail,
  draftPhone,
  setDraftPhone,
  addManualContact,
  setError,
  removeContact,
  selectedPropertyId,
  setSelectedPropertyId,
  residents,
  residentsLoading,
  checkedResidentIds,
  toggleResident,
  selectAllResidents,
  selectByRole,
  clearResidents,
  boardMembers,
  boardLoading,
  checkedBoardIds,
  toggleBoardMember,
  selectAllBoard,
  clearBoard,
}: Props) {
  const selectedStreet = audience === 'street' ? (streets.find((st) => st.key === selectedStreetKey) ?? null) : null

  function tryAdd() {
    const result = addManualContact()
    if (!result.ok) setError(result.error)
  }

  function renderOption(kind: AudienceKind) {
    const selected = audience === kind
    // "One home": the chosen home's recipients — no number until one is
    // picked (the property list's length is not a head count).
    const count =
      kind === 'follow_up'
        ? followUpCount
        : kind === 'specific_property'
        ? selectedPropertyId
          ? checkedResidentIds.size
          : null
        : kind === 'street'
          ? streets.length
          : kind === 'manual_emails'
            ? manualContacts.length
            : audienceCounts[kind as keyof AudienceCounts]
    const disabled = pending || (kind !== 'specific_property' && kind !== 'manual_emails' && count === 0)
    const id = `audience-${kind}`
    const hint =
      disabled && !pending
        ? kind === 'street'
          ? 'No street names found in your addresses'
          : 'Nobody matches right now'
        : AUDIENCE_HINTS[kind]
    return (
      <label
        key={kind}
        htmlFor={id}
        className={cn(
          'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-fast',
          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
          selected ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-subtle',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
      >
        <input
          id={id}
          type="radio"
          name="audience"
          value={kind}
          checked={selected}
          onChange={() => setAudience(kind)}
          disabled={disabled}
          className="mt-1 size-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{AUDIENCE_LABELS[kind]}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        {/* A street's number is how many streets, so it isn't shown as a head count. */}
        {kind === 'street' || count === null ? null : <span className="num shrink-0 text-sm text-foreground-secondary">{count}</span>}
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">Audience</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(AUDIENCE_LABELS) as AudienceKind[])
            .filter((k) => !ADVANCED_AUDIENCES.has(k) && (k !== 'follow_up' || followUpCount > 0))
            .map((kind) => renderOption(kind))}
        </div>
        {/* BL-102 A9: the rare audiences, out of the way. */}
        <details className="group mt-3" open={ADVANCED_AUDIENCES.has(audience) || undefined}>
          <summary className="cursor-pointer text-sm font-medium text-primary">More options</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(AUDIENCE_LABELS) as AudienceKind[])
              .filter((k) => ADVANCED_AUDIENCES.has(k))
              .map((kind) => renderOption(kind))}
          </div>
        </details>
      </fieldset>

      {audience === 'street' ? (
        <div className="space-y-3 rounded-lg border border-border bg-subtle/50 p-4">
          <Field label="Street" hint="Streets are read from your homes’ addresses.">
            <Select
              value={selectedStreetKey}
              onValueChange={setSelectedStreetKey}
              disabled={pending}
              placeholder="Choose a street"
            >
              {streets.map((st) => (
                <option key={st.key} value={st.key}>
                  {st.label} ({st.unitIds.length} {st.unitIds.length === 1 ? 'home' : 'homes'})
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox
            checked={streetOwnersOnly}
            onChange={() => setStreetOwnersOnly(!streetOwnersOnly)}
            disabled={pending}
            label="Owners only"
            description="Only the owner of each home on this street, not renters."
          />
          {selectedStreet ? (
            <StreetHomes
              homes={selectedStreet.homes}
              excluded={streetExcluded}
              ownersOnly={streetOwnersOnly}
              pending={pending}
              toggle={toggleStreetHome}
              setExcluded={setStreetExcluded}
            />
          ) : null}
        </div>
      ) : null}

      {/* Manual email entry — typed-in addresses for one-off recipients. */}
      {audience === 'manual_emails' ? (
        <div className="space-y-3 rounded-lg border border-border bg-subtle/50 p-4">
          <p className="text-xs text-muted">
            Add contacts by email and/or US phone number — at least one per contact. Press Enter to add.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <Field label="Name" optional>
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Jane Doe"
                disabled={pending}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    tryAdd()
                  }
                }}
                placeholder="name@example.com"
                disabled={pending}
              />
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    tryAdd()
                  }
                }}
                placeholder="(555) 123-4567"
                disabled={pending}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              icon={<Plus aria-hidden />}
              onClick={tryAdd}
              disabled={pending || (!draftEmail.trim() && !draftPhone.trim())}
            >
              Add
            </Button>
          </div>

          {manualContacts.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Users2 className="size-3.5" aria-hidden />
              No contacts added yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {manualContacts.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    {c.name ? <span className="font-medium text-foreground">{c.name}</span> : null}
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      {c.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3" aria-hidden />
                          {c.email}
                        </span>
                      ) : null}
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" aria-hidden />
                          {c.phone}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeContact(i)}
                    aria-label={`Remove ${c.name || c.email || c.phone}`}
                    disabled={pending}
                    icon={<X aria-hidden />}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {audience === 'specific_property' ? (
        <div className="space-y-4 rounded-lg border border-border bg-subtle/50 p-4">
          <Field label="Property">
            <Select
              value={selectedPropertyId}
              onValueChange={setSelectedPropertyId}
              disabled={pending}
              placeholder="Choose a property"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          {selectedPropertyId ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  Who at this property?{' '}
                  <span className="num font-normal text-muted">({checkedResidentIds.size} selected)</span>
                </p>
                {residents.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <Button type="button" variant="ghost" size="xs" onClick={selectAllResidents}>
                      All
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={() => selectByRole('owner')}>
                      Owners
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={() => selectByRole('tenant')}>
                      Tenants
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={clearResidents}>
                      None
                    </Button>
                  </div>
                ) : null}
              </div>

              {residentsLoading ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Loading residents…
                </p>
              ) : residents.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Users2 className="size-3.5" aria-hidden />
                  No active residents recorded for this property. Add residents on the property page first.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                  {residents.map((r) => (
                    <li key={r.id} className="px-3 py-2.5">
                      <Checkbox
                        checked={checkedResidentIds.has(r.id)}
                        onChange={() => toggleResident(r.id)}
                        disabled={pending}
                        label={
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {r.fullName}
                            {r.isPrimary ? <Badge variant="default">Primary</Badge> : null}
                          </span>
                        }
                        description={`${roleHumanLabel(r.role)}${r.email ? ` · ${r.email}` : ' · no email on file'}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Board picker — defaulting to every board-role member. Reached by
          email + in-app portal; there's no phone on file so SMS is a no-op. */}
      {audience === 'board' ? (
        <div className="space-y-3 rounded-lg border border-border bg-subtle/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              Which board members?{' '}
              <span className="num font-normal text-muted">({checkedBoardIds.size} selected)</span>
            </p>
            {boardMembers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <Button type="button" variant="ghost" size="xs" onClick={selectAllBoard}>
                  All
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={clearBoard}>
                  None
                </Button>
              </div>
            ) : null}
          </div>

          {boardLoading ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Loading board members…
            </p>
          ) : boardMembers.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Users2 className="size-3.5" aria-hidden />
              No board members yet. Invite members with the Board role on the Members page first.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {boardMembers.map((m) => (
                  <li key={m.userId} className="px-3 py-2.5">
                    <Checkbox
                      checked={checkedBoardIds.has(m.userId)}
                      onChange={() => toggleBoardMember(m.userId)}
                      disabled={pending}
                      label={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {m.fullName}
                          <Badge variant={m.role === 'admin' ? 'warning' : 'default'}>
                            {m.role === 'admin' ? 'Admin' : 'Board'}
                          </Badge>
                        </span>
                      }
                      description={m.email ?? 'No email on file'}
                    />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Board members are reached by email and the in-app portal. SMS is skipped — there is
                no phone number on file for board roles.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function roleHumanLabel(role: ResidentOption['role']): string {
  switch (role) {
    case 'owner': return 'Owner'
    case 'tenant': return 'Tenant'
    case 'family_member': return 'Family member'
    case 'other': return 'Resident'
  }
}

/**
 * BL-146: every home on the chosen street, ticked by default; the board
 * unticks the ones that shouldn't get it. The server leaves the unticked
 * homes out (audience.ts excludeUnitIds), so this list is a choice, not
 * the only guard.
 */
function StreetHomes({
  homes,
  excluded,
  ownersOnly,
  pending,
  toggle,
  setExcluded,
}: {
  homes: StreetOption['homes']
  excluded: ReadonlySet<string>
  ownersOnly: boolean
  pending: boolean
  toggle: (unitId: string) => void
  setExcluded: (next: Set<string>) => void
}) {
  const kept = homes.filter((h) => !excluded.has(h.id)).length
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground" id="street-homes-heading">
          Homes on this street{' '}
          <span className="num font-normal text-muted">
            ({kept} of {homes.length} ticked)
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={() => setExcluded(new Set())} disabled={pending}>
            All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setExcluded(new Set(homes.map((h) => h.id)))}
            disabled={pending}
          >
            None
          </Button>
        </div>
      </div>
      <ul
        aria-labelledby="street-homes-heading"
        className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface"
      >
        {homes.map((h) => (
          <li key={h.id} className="px-3 py-2">
            <Checkbox
              checked={!excluded.has(h.id)}
              onChange={() => toggle(h.id)}
              disabled={pending}
              label={h.label || 'Home with no address line'}
              description={ownersOnly && !h.hasOwner ? 'No owner on file, so nobody here gets it' : undefined}
            />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Untick a home to leave it out of this message.</p>
    </div>
  )
}
