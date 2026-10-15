'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Users2 } from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  ChoiceGroup,
  Field,
  Fieldset,
  Radio,
  Select,
  cn,
} from '@homeowner-portal/ui'
import {
  listBoardMembers,
  listPropertyResidents,
  type BoardMemberOption,
  type ResidentOption,
} from '@/lib/communications/actions'
import type { NotifyChannel } from '@/lib/events'

// Channels + audience picker shared by the new- and edit-event forms.
// Encapsulates all the lazy-loading / checkbox bookkeeping and emits a
// normalized { channels, audience } the parent submits verbatim.

export type EventAudienceKind = 'everyone' | 'board' | 'specific_residents'

export interface EventAudienceValue {
  kind: EventAudienceKind
  /** Present only when kind='board' and a subset is hand-picked. Omitted
   *  ⇒ the whole board. */
  boardUserIds?: string[]
  /** Present only when kind='specific_residents'. */
  residentIds?: string[]
}

export interface EventNotifyValue {
  channels: NotifyChannel[]
  audience: EventAudienceValue
}

interface PropertyOption {
  id: string
  label: string
}

const CHANNELS: { value: NotifyChannel; label: string; hint: string }[] = [
  { value: 'email', label: 'Email', hint: 'to their email address' },
  { value: 'sms', label: 'SMS', hint: 'text message' },
  { value: 'portal', label: 'In-app portal', hint: 'shows in their inbox' },
]

const AUDIENCE_OPTIONS: { value: EventAudienceKind; label: string; hint: string }[] = [
  { value: 'everyone', label: 'All community', hint: 'Every unit in the association' },
  { value: 'board', label: 'Board', hint: 'All or specific board members' },
  {
    value: 'specific_residents',
    label: 'Specific resident',
    hint: 'Pick a property, then who at it',
  },
]

export function EventNotifyFields({
  properties,
  initial,
  onChange,
  disabled,
  channelsError,
  audienceError,
}: {
  properties: PropertyOption[]
  initial?: EventNotifyValue
  onChange: (value: EventNotifyValue) => void
  disabled?: boolean
  /** Server/client validation message for the channel choice. */
  channelsError?: string | null
  /** Server/client validation message for the audience choice. */
  audienceError?: string | null
}) {
  const [channels, setChannels] = useState<NotifyChannel[]>(
    initial?.channels?.length ? initial.channels : ['email'],
  )
  const [kind, setKind] = useState<EventAudienceKind>(initial?.audience.kind ?? 'board')

  // Board picker state — loaded when "Board" is first chosen. Defaults to
  // all checked (opt members out, not in).
  const [board, setBoard] = useState<BoardMemberOption[]>([])
  const [boardLoading, setBoardLoading] = useState(false)
  const [checkedBoard, setCheckedBoard] = useState<Set<string>>(
    new Set(initial?.audience.boardUserIds ?? []),
  )
  const boardLoadedRef = useRef(false)

  // Resident picker state — property → residents, checkboxes default all.
  const [propertyId, setPropertyId] = useState('')
  const [residents, setResidents] = useState<ResidentOption[]>([])
  const [residentsLoading, setResidentsLoading] = useState(false)
  const [checkedResidents, setCheckedResidents] = useState<Set<string>>(new Set())

  // Load board members the first time "Board" is selected.
  useEffect(() => {
    if (kind !== 'board' || boardLoadedRef.current) return
    boardLoadedRef.current = true
    setBoardLoading(true)
    listBoardMembers()
      .then((rows) => {
        setBoard(rows)
        // Honor a previously-saved subset; otherwise default to the board
        // role only — admins are listed but left unchecked (opt-in).
        setCheckedBoard((prev) =>
          prev.size > 0
            ? prev
            : new Set(rows.filter((r) => r.role === 'board').map((r) => r.userId)),
        )
      })
      .finally(() => setBoardLoading(false))
  }, [kind])

  // Load residents when a property is picked.
  useEffect(() => {
    if (kind !== 'specific_residents' || !propertyId) {
      setResidents([])
      setCheckedResidents(new Set())
      return
    }
    let cancelled = false
    setResidentsLoading(true)
    listPropertyResidents(propertyId)
      .then((rows) => {
        if (cancelled) return
        setResidents(rows)
        setCheckedResidents(new Set(rows.map((r) => r.id)))
      })
      .finally(() => {
        if (!cancelled) setResidentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, propertyId])

  // Emit the normalized value whenever any input changes.
  useEffect(() => {
    let audience: EventAudienceValue
    if (kind === 'board') {
      // Omit boardUserIds (⇒ "the whole board at send time") only when the
      // selection is exactly every board-role member and no admins — any
      // admin pick or board deselect needs explicit ids.
      const boardRoleIds = board.filter((m) => m.role === 'board').map((m) => m.userId)
      const isWholeBoard =
        boardRoleIds.length > 0 &&
        checkedBoard.size === boardRoleIds.length &&
        boardRoleIds.every((id) => checkedBoard.has(id))
      audience =
        isWholeBoard || board.length === 0
          ? { kind: 'board' }
          : { kind: 'board', boardUserIds: Array.from(checkedBoard) }
    } else if (kind === 'specific_residents') {
      audience = { kind: 'specific_residents', residentIds: Array.from(checkedResidents) }
    } else {
      audience = { kind: 'everyone' }
    }
    onChange({ channels, audience })
    // onChange is a stable setter from the parent; intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, kind, board, checkedBoard, checkedResidents])

  function toggleChannel(c: NotifyChannel) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }
  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  return (
    <div className="space-y-5">
      <Fieldset
        legend="How to notify"
        error={channels.length === 0 ? 'Pick at least one channel.' : (channelsError ?? undefined)}
      >
        <ChoiceGroup orientation="horizontal">
          {CHANNELS.map((c) => (
            <Checkbox
              key={c.value}
              label={c.label}
              description={c.hint}
              checked={channels.includes(c.value)}
              onChange={() => toggleChannel(c.value)}
              disabled={disabled}
            />
          ))}
        </ChoiceGroup>
      </Fieldset>

      <Fieldset legend="Who to notify" error={audienceError ?? undefined}>
        <div className="grid gap-2 sm:grid-cols-3">
          {AUDIENCE_OPTIONS.map((opt) => {
            const selected = kind === opt.value
            return (
              <Radio
                key={opt.value}
                name="event-audience"
                label={opt.label}
                description={opt.hint}
                checked={selected}
                onChange={() => setKind(opt.value)}
                disabled={disabled}
                wrapperClassName={cn(
                  'rounded-lg border px-3 py-2.5 transition-colors',
                  selected ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-subtle',
                )}
              />
            )
          })}
        </div>

        {kind === 'board' ? (
          <div className="mt-2 space-y-3 rounded-lg border border-border bg-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                Which board members? <span className="num font-normal text-muted">({checkedBoard.size} selected)</span>
              </p>
              {board.length > 0 ? (
                <div className="flex items-center gap-1">
                  <Button type="button" size="xs" variant="ghost" onClick={() => setCheckedBoard(new Set(board.map((m) => m.userId)))}>
                    Select all
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setCheckedBoard(new Set())}>
                    Clear
                  </Button>
                </div>
              ) : null}
            </div>
            {boardLoading ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-muted" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading board members…
              </p>
            ) : board.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Users2 className="size-4" aria-hidden />
                No board members yet. Invite members with the Board role first.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {board.map((m) => (
                  <li key={m.userId} className="px-3 py-2.5">
                    <Checkbox
                      checked={checkedBoard.has(m.userId)}
                      onChange={() => setCheckedBoard((p) => toggle(p, m.userId))}
                      disabled={disabled}
                      label={
                        <span className="flex flex-wrap items-center gap-2">
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
            )}
            <p className="text-xs text-muted">
              Board members are checked by default; admins are listed as an opt-in. SMS is skipped for these roles — no
              phone number is on file.
            </p>
          </div>
        ) : null}

        {kind === 'specific_residents' ? (
          <div className="mt-2 space-y-3 rounded-lg border border-border bg-subtle p-4">
            <Field label="Property">
              <Select
                value={propertyId}
                onValueChange={setPropertyId}
                disabled={disabled}
                placeholder="Choose a property"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            {propertyId ? (
              residentsLoading ? (
                <p className="inline-flex items-center gap-1.5 text-sm text-muted" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading residents…
                </p>
              ) : residents.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Users2 className="size-4" aria-hidden />
                  No active residents recorded for this property.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      Who at this property?{' '}
                      <span className="num font-normal text-muted">({checkedResidents.size} selected)</span>
                    </p>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="xs" variant="ghost" onClick={() => setCheckedResidents(new Set(residents.map((r) => r.id)))}>
                        Select all
                      </Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setCheckedResidents(new Set())}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {residents.map((r) => (
                      <li key={r.id} className="px-3 py-2.5">
                        <Checkbox
                          checked={checkedResidents.has(r.id)}
                          onChange={() => setCheckedResidents((p) => toggle(p, r.id))}
                          disabled={disabled}
                          label={r.fullName}
                          description={r.email ?? 'No email on file'}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </Fieldset>
    </div>
  )
}
