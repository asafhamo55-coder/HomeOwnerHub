'use client'

import { useEffect, useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import {
  searchVendors,
  assignThreadToVendor,
  unassignThreadVendor,
  type VendorOption,
} from '@/lib/inbox/vendor/actions'
import { QuickCreateVendorModal } from './QuickCreateVendorModal'

interface Props {
  threadId: string
  senderEmail: string | null
  senderName: string | null
}

/**
 * Type-ahead over existing vendors, modeled on AssignPropertyForm.
 *
 * The "create new" affordance appears ONLY after a search has actually run
 * and returned nothing. Searching first is what stops a second vendor row
 * being created for a company already on file — the cheapest duplicate
 * prevention available, and the reason the create button is gated rather
 * than always visible.
 */
export function AssignVendorForm({ threadId, senderEmail, senderName }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VendorOption[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchPending, startSearch] = useTransition()
  const [assignPending, startAssign] = useTransition()

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const handle = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchVendors(query))
        setSearched(true)
      })
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  function assign(vendorId: string) {
    setError(null)
    startAssign(async () => {
      const result = await assignThreadToVendor(threadId, vendorId)
      if ('error' in result) setError(result.error)
    })
  }

  const noMatches = searched && !searchPending && results.length === 0

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        File under vendor
      </label>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search vendors by name or email…"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        autoComplete="off"
      />

      {results.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border">
          {results.map((vendor) => (
            <li key={vendor.vendorId}>
              <button
                type="button"
                disabled={assignPending}
                onClick={() => assign(vendor.vendorId)}
                className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted/10"
              >
                {vendor.legalName}
                {vendor.incomplete ? ' — setup incomplete' : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {noMatches ? (
        <div className="space-y-1">
          <p className="text-xs text-muted">No matching vendors.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModalOpen(true)}
            className="w-full"
          >
            Create new vendor
          </Button>
        </div>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      {modalOpen ? (
        <QuickCreateVendorModal
          threadId={threadId}
          senderEmail={senderEmail}
          senderName={senderName}
          initialName={query}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  )
}

export function UnassignVendorButton({ threadId }: { threadId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await unassignThreadVendor(threadId)
            if ('error' in result) setError(result.error)
          })
        }
      >
        Unfile vendor
      </Button>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </>
  )
}
