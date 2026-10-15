'use client'

import { Loader2, Mail, Phone, Plus, Users2, X } from 'lucide-react'
import { Badge, Button, Checkbox, Field, Input, Select, cn } from '@homeowner-portal/ui'
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

const AUDIENCE_HINTS: Record<AudienceKind, string> = {
  everyone: 'Every unit with contact info',
  owners_only: 'One recipient per owned unit',
  tenants_only: 'Units with a current tenant',
  late_on_dues: 'Units with an overdue charge',
  open_violations: 'Units with an open violation',
  specific_property: 'Pick residents at one address',
  board: 'Board members (email + portal)',
  manual_emails: 'Vendors, attorneys, anyone else',
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
  function tryAdd() {
    const result = addManualContact()
    if (!result.ok) setError(result.error)
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">Audience</legend>
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
            const id = `audience-${kind}`
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
                  <span className="block text-xs text-muted">
                    {disabled && !pending ? 'Nobody matches right now' : AUDIENCE_HINTS[kind]}
                  </span>
                </span>
                <span className="num shrink-0 text-sm text-foreground-secondary">{count}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

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
