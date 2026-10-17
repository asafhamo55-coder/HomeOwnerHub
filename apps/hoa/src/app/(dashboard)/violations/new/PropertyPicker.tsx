'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button, Input, cn } from '@homeowner-portal/ui'
import { propertyOptionLabel, searchPropertyOptions, type PropertyOption } from '@/lib/properties/picker-search'

/**
 * Type-to-search property picker (ARIA 1.2 combobox + listbox). Replaces a
 * <Select> that listed every home alphabetically-as-text and preselected
 * the first one — so a violation could be filed against "1 Alder Ct" by
 * someone who never chose it. Nothing is selected until the user picks.
 *
 * The `id`/`aria-*` the surrounding Field passes land on the input.
 */
export function PropertyPicker({
  options,
  value,
  onChange,
  disabled,
  ...fieldProps
}: {
  options: PropertyOption[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const listId = useId()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((o) => o.id === value) ?? null
  const matches = useMemo(() => searchPropertyOptions(options, term, 50), [options, term])

  function choose(o: PropertyOption) {
    onChange(o.id)
    setTerm('')
    setOpen(false)
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-input bg-surface px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{propertyOptionLabel(selected)}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          icon={<X aria-hidden />}
          disabled={disabled}
          onClick={() => {
            onChange('')
            setOpen(true)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  const activeId = open && matches[active] ? `${listId}-${matches[active].id}` : undefined

  return (
    <div className="relative">
      <Input
        {...fieldProps}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        placeholder="Type an address or unit"
        prefix={<Search aria-hidden />}
        value={term}
        disabled={disabled}
        onChange={(e) => {
          setTerm(e.currentTarget.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            if (open && matches[active]) {
              e.preventDefault()
              choose(matches[active])
            }
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Properties"
          className="absolute z-popover mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-elevated p-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-muted" role="presentation">
              No home matches “{term}”.
            </li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: it fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(o)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'cursor-pointer truncate rounded-md px-2.5 py-2 text-sm text-foreground sm:py-1.5',
                  i === active && 'bg-subtle',
                )}
              >
                {propertyOptionLabel(o)}
              </li>
            ))
          )}
          {matches.length === 50 ? (
            <li role="presentation" className="px-2.5 py-1.5 text-xs text-muted">
              Showing the first 50 — keep typing to narrow.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
