'use client'

import { Loader2, Mail, Phone, Plus, Users2, X } from 'lucide-react'
import { Button, Input, Select } from '@homeowner-portal/ui'
import type {
  ResidentOption,
  BoardMemberOption,
} from '@/lib/communications/actions'

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
// 'manual_emails' drives a free-form email entry list — also passes
// through to the resolver as-is.
export type AudienceKind =
  | keyof AudienceCounts
  | 'specific_property'
  | 'manual_emails'

export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  everyone: 'Everyone',
  owners_only: 'Owners only',
  tenants_only: 'Tenants only',
  late_on_dues: 'Late on dues',
  open_violations: 'Units with open violations',
  specific_property: 'Specific property',
  board: 'Board',
  manual_emails: 'Custom contacts',
}

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
 * The audience-selection block of the new-communication wizard, extracted
 * verbatim from NewCommunicationWizard.tsx (previously ~350 of its 896
 * lines, roughly lines 390-743). All state and handlers stay owned by the
 * wizard — this component is pure presentation over the props above. The
 * caller wraps this in the numbered <Section> the same way it always did.
 */
export function AudienceStep({
  pending,
  audience,
  setAudience,
  audienceCounts,
  properties,
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
  return (
    <>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(AUDIENCE_LABELS) as AudienceKind[]).map((kind) => {
            const selected = audience === kind
            const count =
              kind === 'specific_property'
                ? properties.length
                : kind === 'manual_emails'
                  ? manualContacts.length
                  : audienceCounts[kind as keyof AudienceCounts]
            const disabled =
              pending ||
              (kind !== 'specific_property' &&
                kind !== 'manual_emails' &&
                count === 0)
            return (
              <label
                key={kind}
                className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm ${
                  selected
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted hover:bg-background'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="audience"
                    value={kind}
                    checked={selected}
                    onChange={() => setAudience(kind)}
                    disabled={disabled}
                  />
                  {AUDIENCE_LABELS[kind]}
                </span>
                <span className="font-mono text-xs text-muted">{count}</span>
              </label>
            )
          })}
        </div>

        {/* Property picker + resident checkboxes — only when
            "Specific property" is the chosen audience. */}
        {/* Manual email entry — typed-in addresses for one-off
            recipients (vendor, attorney, anyone not in the roster). */}
        {audience === 'manual_emails' ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background/40 p-4">
            <p className="text-xs text-muted">
              Add contacts by email and/or US phone number. At least one is
              required per contact. Useful for one-off messages to people not
              in the resident list — vendors, attorneys, contractors.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Name (optional)"
                disabled={pending}
              />
              <Input
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const result = addManualContact()
                    if (!result.ok) setError(result.error)
                  }
                }}
                placeholder="email@example.com"
                disabled={pending}
              />
              <Input
                type="tel"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const result = addManualContact()
                    if (!result.ok) setError(result.error)
                  }
                }}
                placeholder="(555) 123-4567"
                disabled={pending}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const result = addManualContact()
                  if (!result.ok) setError(result.error)
                }}
                disabled={pending || (!draftEmail.trim() && !draftPhone.trim())}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {manualContacts.length === 0 ? (
              <p className="flex items-center gap-2 text-xs italic text-muted">
                <Users2 className="h-3.5 w-3.5" />
                No contacts added yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {manualContacts.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      {c.name ? <span className="font-medium text-foreground">{c.name}</span> : null}
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        {c.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </span>
                        ) : null}
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeContact(i)}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${c.name || c.email || c.phone}`}
                      disabled={pending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {audience === 'specific_property' ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background/40 p-4">
            <div>
              <label className="text-xs font-medium text-foreground" htmlFor="comm-property">
                Property
              </label>
              <Select
                id="comm-property"
                value={selectedPropertyId}
                onValueChange={setSelectedPropertyId}
                disabled={pending}
                placeholder="Choose a property"
                className="mt-1"
              >
                <option value="" disabled>
                  — pick one —
                </option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>

            {selectedPropertyId ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    Who at this property?{' '}
                    <span className="font-normal text-muted">
                      ({checkedResidentIds.size} selected)
                    </span>
                  </p>
                  {residents.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={selectAllResidents}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={() => selectByRole('owner')}
                      >
                        Owners
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={() => selectByRole('tenant')}
                      >
                        Tenants
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={clearResidents}
                      >
                        None
                      </button>
                    </div>
                  ) : null}
                </div>

                {residentsLoading ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading residents…
                  </p>
                ) : residents.length === 0 ? (
                  <p className="mt-3 flex items-center gap-2 text-xs italic text-muted">
                    <Users2 className="h-3.5 w-3.5" />
                    No active residents recorded for this property.
                    Add residents on the property detail page first.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
                    {residents.map((r) => {
                      const checked = checkedResidentIds.has(r.id)
                      return (
                        <li key={r.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleResident(r.id)}
                              disabled={pending}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-foreground">
                                {r.fullName}
                                {r.isPrimary ? (
                                  <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">
                                    primary
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted">
                                {roleHumanLabel(r.role)}
                                {r.email ? ` · ${r.email}` : ' · no email on file'}
                              </p>
                            </div>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Board picker — checkbox list of board members, defaulting
            to all selected. "Board" is reached by email + in-app portal;
            there's no phone on file so SMS is a no-op for this audience. */}
        {audience === 'board' ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">
                Which board members?{' '}
                <span className="font-normal text-muted">
                  ({checkedBoardIds.size} selected)
                </span>
              </p>
              {boardMembers.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                    onClick={selectAllBoard}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                    onClick={clearBoard}
                  >
                    None
                  </button>
                </div>
              ) : null}
            </div>

            {boardLoading ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading board members…
              </p>
            ) : boardMembers.length === 0 ? (
              <p className="flex items-center gap-2 text-xs italic text-muted">
                <Users2 className="h-3.5 w-3.5" />
                No board members yet. Invite members with the Board role
                on the Members page first.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-md border border-border bg-surface">
                  {boardMembers.map((m) => {
                    const checked = checkedBoardIds.has(m.userId)
                    return (
                      <li key={m.userId}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background/50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBoardMember(m.userId)}
                            disabled={pending}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">
                              {m.fullName}
                              <span
                                className={`ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                                  m.role === 'admin'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-primary/10 text-primary'
                                }`}
                              >
                                {m.role}
                              </span>
                            </p>
                            <p className="text-xs text-muted">
                              {m.email ?? 'no email on file'}
                            </p>
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                <p className="text-xs italic text-muted">
                  Board members are reached by email and the in-app portal.
                  SMS is skipped — there is no phone number on file for board roles.
                </p>
              </>
            )}
          </div>
        ) : null}
    </>
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
