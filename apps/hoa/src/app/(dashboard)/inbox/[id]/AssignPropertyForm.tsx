'use client'

import { useEffect, useState, useTransition, useActionState } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { assignThreadToProperty, searchProperties, type InboxActionState } from '@/lib/inbox/actions'

const initial: InboxActionState = {}

interface PropertyOption {
  unitId: string
  address: string
}

interface Props {
  threadId: string
  suggestedProperty: PropertyOption | null
}

/**
 * `searchProperties` (apps/hoa/src/lib/inbox/actions.ts, Task 21) takes a
 * single search term and returns `[]` for an empty/whitespace term — it
 * is a search action, not a list-everything call. The brief's sample
 * called it once with `''` on the server to eagerly populate a <select>
 * of every property, which would always render empty against the real
 * signature. This is a type-ahead instead: results only appear once the
 * manager has typed enough to search for, matching what the action
 * actually does.
 */
export function AssignPropertyForm({ threadId, suggestedProperty }: Props) {
  const [state, action, pending] = useActionState(assignThreadToProperty, initial)
  const [query, setQuery] = useState(suggestedProperty?.address ?? '')
  const [results, setResults] = useState<PropertyOption[]>(
    suggestedProperty ? [suggestedProperty] : [],
  )
  const [selected, setSelected] = useState<PropertyOption | null>(suggestedProperty)
  const [searchPending, startSearch] = useTransition()

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const handle = setTimeout(() => {
      startSearch(async () => {
        const matches = await searchProperties(query)
        setResults(matches)
      })
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="unitId" value={selected?.unitId ?? ''} />

      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        File under property
      </label>
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setSelected(null)
        }}
        placeholder="Search by address…"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        autoComplete="off"
      />

      {selected ? (
        <p className="rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
          Filing under <span className="font-semibold">{selected.address}</span>
          {suggestedProperty?.unitId === selected.unitId ? ' — suggested' : ''}
        </p>
      ) : results.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border">
          {results.map((property) => (
            <li key={property.unitId}>
              <button
                type="button"
                onClick={() => {
                  setSelected(property)
                  setQuery(property.address)
                }}
                className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted/10"
              >
                {property.address}
                {property.unitId === suggestedProperty?.unitId ? ' — suggested' : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !searchPending ? (
        <p className="text-xs text-muted">No matching properties.</p>
      ) : null}

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="rememberSender" defaultChecked />
        Remember this sender for next time
      </label>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <Button type="submit" size="sm" loading={pending} disabled={!selected} className="w-full">
        Assign
      </Button>
    </form>
  )
}
