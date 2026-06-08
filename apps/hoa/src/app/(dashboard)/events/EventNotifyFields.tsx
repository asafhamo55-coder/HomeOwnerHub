'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Users2 } from 'lucide-react'
import { Select } from '@homeowner-portal/ui'
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
}: {
  properties: PropertyOption[]
  initial?: EventNotifyValue
  onChange: (value: EventNotifyValue) => void
  disabled?: boolean
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
      {/* Channels */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">How to notify</p>
        <div className="flex flex-wrap gap-4">
          {CHANNELS.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={channels.includes(c.value)}
                onChange={() => toggleChannel(c.value)}
                disabled={disabled}
              />
              {c.label}
              <span className="text-xs text-muted">{c.hint}</span>
            </label>
          ))}
        </div>
        {channels.length === 0 ? (
          <p className="text-xs text-destructive">Pick at least one channel.</p>
        ) : null}
      </div>

      {/* Audience */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Who to notify</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {AUDIENCE_OPTIONS.map((opt) => {
            const selected = kind === opt.value
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-sm ${
                  selected
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted hover:bg-background'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="event-audience"
                    checked={selected}
                    onChange={() => setKind(opt.value)}
                    disabled={disabled}
                  />
                  {opt.label}
                </span>
                <span className="ml-6 text-xs text-muted">{opt.hint}</span>
              </label>
            )
          })}
        </div>

        {/* Board sub-picker */}
        {kind === 'board' ? (
          <div className="space-y-3 rounded-md border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">
                Which board members?{' '}
                <span className="font-normal text-muted">
                  ({checkedBoard.size} selected)
                </span>
              </p>
              {board.length > 0 ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                    onClick={() => setCheckedBoard(new Set(board.map((m) => m.userId)))}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                    onClick={() => setCheckedBoard(new Set())}
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
            ) : board.length === 0 ? (
              <p className="flex items-center gap-2 text-xs italic text-muted">
                <Users2 className="h-3.5 w-3.5" />
                No board members yet. Invite members with the Board role first.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border bg-surface">
                {board.map((m) => (
                  <li key={m.userId}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background/50">
                      <input
                        type="checkbox"
                        checked={checkedBoard.has(m.userId)}
                        onChange={() => setCheckedBoard((p) => toggle(p, m.userId))}
                        disabled={disabled}
                      />
                      <span className="min-w-0 flex-1 text-sm text-foreground">
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
                        <span className="ml-2 text-xs text-muted">
                          {m.email ?? 'no email on file'}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs italic text-muted">
              Board members are checked by default; admins are listed as an
              opt-in. SMS is skipped for these roles — no phone number is on file.
            </p>
          </div>
        ) : null}

        {/* Specific-resident sub-picker */}
        {kind === 'specific_residents' ? (
          <div className="space-y-3 rounded-md border border-border bg-background/40 p-4">
            <div>
              <label className="text-xs font-medium text-foreground" htmlFor="event-property">
                Property
              </label>
              <Select
                id="event-property"
                value={propertyId}
                onValueChange={setPropertyId}
                disabled={disabled}
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

            {propertyId ? (
              residentsLoading ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading residents…
                </p>
              ) : residents.length === 0 ? (
                <p className="flex items-center gap-2 text-xs italic text-muted">
                  <Users2 className="h-3.5 w-3.5" />
                  No active residents recorded for this property.
                </p>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">
                      Who at this property?{' '}
                      <span className="font-normal text-muted">
                        ({checkedResidents.size} selected)
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={() => setCheckedResidents(new Set(residents.map((r) => r.id)))}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={() => setCheckedResidents(new Set())}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
                    {residents.map((r) => (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background/50">
                          <input
                            type="checkbox"
                            checked={checkedResidents.has(r.id)}
                            onChange={() => setCheckedResidents((p) => toggle(p, r.id))}
                            disabled={disabled}
                          />
                          <span className="min-w-0 flex-1 text-sm text-foreground">
                            {r.fullName}
                            <span className="ml-2 text-xs text-muted">
                              {r.email ?? 'no email on file'}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
