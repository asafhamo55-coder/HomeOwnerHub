'use client'

import { useEffect, useState, useTransition, useActionState } from 'react'
import { Check, Search } from 'lucide-react'
import { Alert, Button, Checkbox, Field, Input } from '@homeowner-portal/ui'
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
    <form action={action} className="space-y-3">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="unitId" value={selected?.unitId ?? ''} />

      <Field label="File under property" hint={selected ? undefined : 'Type at least two characters of the address.'}>
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(null)
          }}
          placeholder="Search by address…"
          prefix={<Search aria-hidden />}
          autoComplete="off"
        />
      </Field>

      {selected ? (
        <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary-subtle px-3 py-2 text-xs text-foreground">
          <Check className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            Filing under <span className="font-semibold">{selected.address}</span>
            {suggestedProperty?.unitId === selected.unitId ? ' — suggested' : ''}
          </span>
        </p>
      ) : results.length > 0 ? (
        <ul
          aria-label="Matching properties"
          className="max-h-44 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface"
        >
          {results.map((property) => (
            <li key={property.unitId}>
              <button
                type="button"
                onClick={() => {
                  setSelected(property)
                  setQuery(property.address)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
              >
                {property.address}
                {property.unitId === suggestedProperty?.unitId ? (
                  <span className="text-xs text-muted"> — suggested</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !searchPending ? (
        <p className="text-xs text-muted">No matching properties.</p>
      ) : null}

      <Checkbox name="rememberSender" defaultChecked label="Remember this sender for next time" />

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.warning ? <Alert variant="warning">{state.warning}</Alert> : null}

      <Button type="submit" size="sm" loading={pending} disabled={!selected} className="w-full">
        File under property
      </Button>
    </form>
  )
}
